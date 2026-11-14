/* GENERADOR DEL TEMA DE LITLEJACOB  →  tema-lj.css
   Las dos tiendas usan las mismas hojas de estilo (las de Rayas). Este programa lee esas hojas, se queda SOLO con
   las reglas que tienen colores o fuentes de Rayas, les pone la paleta de LitleJacob ("acero y sangre") y las
   escribe en tema-lj.css. Al final agrega a mano lo de base-lj.css (variables, portada, detalles).
   tema-lj.css se carga solo en LitleJacob, después de todas las demás hojas, así que sus reglas ganan.

   Cuándo correrlo: cada vez que se cambien colores o se agreguen reglas con color en las hojas de abajo.
     node herramientas/tienda-lj/generar-tema-lj.js          (desde la carpeta rayas-store)
   Si se olvida, no se rompe nada: lo nuevo sale con los colores de Rayas hasta volver a generar.

   Paleta (de Rayas → LitleJacob):
     amarillo/dorado oscuro → rojo sangre      amarillo muy claro → plata clara
     fucsia/rosado         → plata/acero       naranja            → rojo
     azul marino (fondos)  → negro con un toque rojizo
     lila/celeste claro (textos) → gris neutro
     Lo demás (blancos, verdes, rojos, colores de rareza) queda igual. */
"use strict";
const fs = require("fs"), path = require("path");
const RAIZ = path.resolve(__dirname, "..", "..");
// Mismo orden en que las carga index.html (tema-nuevo.css se agrega al final por JavaScript).
const HOJAS = ["estilos.css", "perfil.css", "ancho.css", "sets.css", "previa.css", "panel-pro.css", "cabecera-mk.css", "rapido.css", "portafolio.css", "tema-nuevo.css"];

/* ---------- colores ---------- */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) return [l, l, l];
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
// Devuelve el color nuevo [r,g,b] (0..1) o null si no se cambia.
function lj(r, g, b) {
  const [d, S, L] = rgb2hsl(r, g, b);
  if (S > .45 && d >= 30 && d <= 60) {                                   // amarillo / dorado
    if (L > .72) return hsl2rgb(220, .08, clamp(L, .8, .95));            //   muy claro → plata clara
    return hsl2rgb(357, .76, clamp(L * .8, .18, .56));                   //   → rojo sangre
  }
  if (S > .55 && d >= 15 && d < 30) return hsl2rgb(357, .76, clamp(L * .82, .18, .56));   // naranja → rojo
  if (S > .45 && d >= 310 && d <= 350) return hsl2rgb(220, .06, clamp(L + .2, .55, .92)); // fucsia → plata
  if (d >= 200 && d <= 255 && L < .5 && S > .12) return hsl2rgb(350, .14, L * .72);       // azul marino → negro rojizo
  if (d >= 185 && d <= 255 && L >= .5 && S > .15) return hsl2rgb(220, .06, L);           // lila/celeste claro → gris
  return null;
}
const hex = (c) => "#" + c.map((x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
function recolor(v) {
  let cambios = 0;
  v = v.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (m, h) => {
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const o = lj(...[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
    if (!o) return m; cambios++; return hex(o);
  });
  v = v.replace(/(rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,[^)]*)?\)/g, (m, f, r, g, b, a) => {
    const o = lj(r / 255, g / 255, b / 255);
    if (!o) return m; cambios++;
    const [R, G, B] = o.map((x) => Math.round(clamp(x, 0, 1) * 255));
    return `${f}(${R}, ${G}, ${B}${a || ""})`;
  });
  // fuentes de Rayas → fuentes de LitleJacob
  v = v.replace(/(["']?)Barlow Condensed\1/g, () => { cambios++; return '"Oswald"'; })
       .replace(/(["']?)Teko\1/g, () => { cambios++; return '"Oswald"'; })
       .replace(/(["']?)Barlow\1(?! Condensed)/g, () => { cambios++; return '"Inter"'; });
  return { v, cambios };
}

/* ---------- lector de CSS sencillo (bloques y declaraciones) ---------- */
function sinComentarios(t) { return t.replace(/\/\*[\s\S]*?\*\//g, ""); }
// Parte el texto en nodos: { sel, cuerpo } (cuerpo = texto entre llaves) respetando comillas y paréntesis.
function bloques(t) {
  const out = []; let i = 0;
  while (i < t.length) {
    const ab = siguiente(t, i, "{"); if (ab < 0) break;
    let sel = t.slice(i, ab);
    sel = sel.slice(sel.lastIndexOf(";") + 1).trim();   // salta sentencias sueltas antes del bloque (ej. @import …;)
    let prof = 1, j = ab + 1, q = null;
    for (; j < t.length && prof; j++) {
      const c = t[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c; else if (c === "{") prof++; else if (c === "}") prof--;
    }
    out.push({ sel, cuerpo: t.slice(ab + 1, j - 1) }); i = j;
  }
  return out;
}
function siguiente(t, i, ch) { let q = null; for (; i < t.length; i++) { const c = t[i]; if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === ch) return i; } return -1; }
function declaraciones(cuerpo) {   // separa por ";" fuera de paréntesis y comillas
  const out = []; let cur = "", par = 0, q = null;
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i];
    if (q) { cur += c; if (c === "\\") { cur += cuerpo[++i] || ""; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c; else if (c === "(") par++; else if (c === ")") par--;
    if (c === ";" && !par) { if (cur.trim()) out.push(cur.trim()); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// Procesa una lista de bloques y devuelve el CSS de salida (solo lo que cambió).
function procesar(texto, cuenta) {
  let out = "";
  for (const { sel, cuerpo } of bloques(texto)) {
    if (/^@(media|supports|layer|container)/i.test(sel)) {
      const dentro = procesar(cuerpo, cuenta);
      if (dentro) out += `${sel} {\n${dentro}}\n`;
    } else if (/^@(-webkit-)?keyframes/i.test(sel)) {
      const r = recolor(cuerpo);                         // animación con colores: se copia entera (mismo nombre la reemplaza)
      if (r.cambios) { out += `${sel} {${r.v}}\n`; cuenta.n += r.cambios; }
    } else if (/^@font-face/i.test(sel) || /^@/.test(sel)) {
      continue;
    } else {
      const ds = [], todas = declaraciones(cuerpo);
      for (const d of todas) {
        const p = d.indexOf(":"); if (p < 0) continue;
        const prop = d.slice(0, p).trim();
        const r = recolor(d.slice(p + 1));
        if (r.cambios) { ds.push(`${prop}:${r.v}`); cuenta.n += r.cambios; }
      }
      // "background" reinicia el recorte del texto con degradé: si la regla lo usaba, se copia también.
      if (ds.some((d) => /^background\s*:/i.test(d))) for (const d of todas) if (/^(-webkit-)?background-clip\s*:|^-webkit-text-fill-color\s*:/i.test(d)) ds.push(d);
      if (ds.length) out += `${sel} { ${ds.join("; ")}; }\n`;
    }
  }
  return out;
}

/* ---------- armar tema-lj.css ---------- */
let salida = "/* TEMA DE LITLEJACOB (archivo GENERADO, no editar a mano)\n" +
  "   Se crea con:  node herramientas/tienda-lj/generar-tema-lj.js   — los cambios a mano van en herramientas/tienda-lj/base-lj.css\n" +
  "   Se carga solo en LitleJacob (tienda.js / index.html), después de todas las demás hojas. */\n";
const resumen = [];
for (const h of HOJAS) {
  const cuenta = { n: 0 };
  const css = procesar(sinComentarios(fs.readFileSync(path.join(RAIZ, h), "utf8").replace(/\r\n/g, "\n")), cuenta);
  if (css) salida += `\n/* ===== ${h} ===== */\n` + css;
  resumen.push(`${h}: ${cuenta.n} colores/fuentes`);
}
salida += "\n/* ===== base-lj.css (a mano) ===== */\n" + fs.readFileSync(path.join(__dirname, "base-lj.css"), "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(path.join(RAIZ, "tema-lj.css"), salida);
console.log(resumen.join("\n") + `\ntema-lj.css: ${(Buffer.byteLength(salida) / 1024).toFixed(1)} KB`);
