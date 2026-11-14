/* =====================================================================
   Cloudflare Pages (una sola web para las dos tiendas) — "portero" de la página.
   - Sirve los mismos archivos para rayas.trade y litlejacob.trade.
   - En los dominios de LitleJacob cambia lo que leen WhatsApp, Facebook y Google (ellos no corren JavaScript):
     título, descripción, foto de vista previa, íconos, manifest y dirección canónica.
   - No deja ver archivos internos del repo (funciones de Firebase, bot de Steam, herramientas, notas .md).
   - En las direcciones de prueba (prueba.… y *.pages.dev) le dice a Google que no las muestre.
   Al existir este archivo, Cloudflare NO trata la carpeta functions/ como funciones suyas
   (esa carpeta es de Firebase y se despliega aparte).
   ===================================================================== */
const PRIVADO = /^\/(functions|bot-steam|herramientas|node_modules)(\/|$)|^\/[^/]*\.md$|^\/(firebase\.json|\.firebaserc|\.gitignore|package(-lock)?\.json|_worker\.js)$/i;

const LJ = {
  nombre: "LitleJacob Store",
  url: "https://litlejacob.trade",
  titulo: "LitleJacob Store · Items, Sets Caché y Rifas de Dota 2 | Precios en soles",
  ogTitulo: "LitleJacob Store · Items, Sets Caché y Rifas de Dota 2",
  foto: "https://litlejacob.trade/img/og-preview-v4.jpg",
  fotoAlt: "Logo de LitleJacob Store con el texto: sets Míticos e Inmortales de Dota 2, precios en soles",
  color: "#0b0505"
};
const aLJ = (t) => String(t || "").replace(/Rayas Store/g, LJ.nombre).replace(/https:\/\/(www\.)?rayas\.trade/g, LJ.url);

// Cambia en el <head> lo de Rayas por lo de LitleJacob
function reescribirLJ(res, esPortada) {
  const meta = (el) => {
    const p = el.getAttribute("property") || el.getAttribute("name") || "", c = el.getAttribute("content");
    if (c === null) return;
    if (p === "og:image" || p === "og:image:secure_url" || p === "twitter:image") el.setAttribute("content", LJ.foto);
    else if (p === "og:image:alt" || p === "twitter:image:alt") el.setAttribute("content", LJ.fotoAlt);
    else if (p === "theme-color") el.setAttribute("content", LJ.color);
    else if (esPortada && (p === "og:title" || p === "twitter:title")) el.setAttribute("content", LJ.ogTitulo);
    else el.setAttribute("content", aLJ(c));
  };
  const link = (el) => {
    const rel = (el.getAttribute("rel") || "").toLowerCase(), href = el.getAttribute("href") || "", sz = el.getAttribute("sizes") || "";
    if (rel === "canonical" || rel === "alternate") el.setAttribute("href", aLJ(href));
    else if (rel === "manifest") el.setAttribute("href", "/lj/manifest.webmanifest");
    else if (rel === "apple-touch-icon") el.setAttribute("href", "/lj/apple-touch-icon.png");
    else if (rel === "icon" || rel === "shortcut icon") el.setAttribute("href", /192/.test(sz) ? "/lj/icon-192.png" : "/lj/favicon.png");
  };
  let enTitulo = false;
  return new HTMLRewriter()
    .on("title", {
      element() { enTitulo = true; },
      text(t) {
        if (!enTitulo) return;
        if (esPortada) { t.remove(); if (t.lastInTextNode) t.after(LJ.titulo); }
        else if (/Rayas Store/.test(t.text)) t.replace(aLJ(t.text));
        if (t.lastInTextNode) enTitulo = false;
      }
    })
    .on("meta", { element: meta })
    .on("link", { element: link })
    .transform(res);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (PRIVADO.test(decodeURIComponent(url.pathname))) return new Response("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

    let res = await env.ASSETS.fetch(request);
    const host = url.hostname.toLowerCase();
    const esLJ = /litlejacob/.test(host);
    const prueba = /^prueba\./.test(host) || /\.pages\.dev$/.test(host);
    const tipo = res.headers.get("content-type") || "";

    if (esLJ && tipo.includes("text/html")) {
      const portada = url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/index";
      res = reescribirLJ(res, portada);
    } else if (esLJ && /^\/(robots\.txt|sitemap\.xml)$/.test(url.pathname) && res.ok) {
      const txt = (await res.text()).replace(/https:\/\/(www\.)?rayas\.trade/g, LJ.url);
      res = new Response(txt, res);
    }
    if (prueba) {   // direcciones de prueba: que Google no las muestre
      res = new Response(res.body, res);
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return res;
  }
};
