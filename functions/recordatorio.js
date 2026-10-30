"use strict";
// Pedidos de sets "pagado" (sin entregar) que ya le toca entregar hoy. Misma regla que el panel (index.html: buildPlan / dueToday):
//  - el cliente debe llevar 30 días de amistad (customers/<key>.friendSince + 30);
//  - cupo de 8 SETS por día (límite de Steam): lo que pase de 8 se corre al día siguiente (día 31, 32…);
//  - los pedidos ya entregados hoy (entregadoDia) ocupan cupo de hoy.
const ENTREGA_CAP = 8;
const ESPERA_DIAS = 30;
function normalizar(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function custKey(steamId, name) {
  if (steamId) return "s" + steamId;
  return "n-" + (normalizar(name || "cliente").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente");
}
function hoyLima(ahora) { return new Date((ahora || new Date()).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
function dias(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; }
function sumarDias(iso, n) { return new Date((dias(iso) + n) * 86400000).toISOString().slice(0, 10); }
function aMs(t) { return t && t.toDate ? t.toDate().getTime() : (t instanceof Date ? t.getTime() : Number(t) || 0); }
function esItems(o) { return o.origen === "items"; }
function setsDe(o) { return Math.max(1, Number(o.count) || (o.items || []).reduce((n, it) => n + (Number(it.qty) || 1), 0)); }

// ordenes: [{code, customerName, steamId, status, createdAt, entregadoDia, ...}], clientes: { key: {friendSince:"YYYY-MM-DD"} }
// Devuelve { entregar: [pedidos que toca entregar hoy, con .entregaDia], programados: [resto con fecha], cupoHoy: n }
function planEntregas(ordenes, clientes, hoy) {
  const cnt = {}, pend = [];
  ordenes.forEach((o) => {
    if (esItems(o)) return;
    if (o.status === "entregado") { if (o.entregadoDia && o.entregadoDia >= hoy) cnt[o.entregadoDia] = (cnt[o.entregadoDia] || 0) + setsDe(o); return; }
    if (o.status !== "pagado") return;
    const c = clientes[custKey(o.steamId, o.customerName)];
    const since = c && /^\d{4}-\d{2}-\d{2}$/.test(c.friendSince || "") ? c.friendSince : "";
    if (since) pend.push({ o, base: sumarDias(since, ESPERA_DIAS), t: aMs(o.createdAt), n: setsDe(o) });
  });
  pend.sort((a, b) => (a.base < b.base ? -1 : a.base > b.base ? 1 : a.t - b.t));
  const entregar = [], programados = [];
  pend.forEach((p) => {
    const desde = p.base < hoy ? hoy : p.base;   // lo atrasado se entrega desde hoy, respetando el cupo
    let d = desde;
    while ((cnt[d] || 0) > 0 && (cnt[d] || 0) + p.n > ENTREGA_CAP) d = sumarDias(d, 1);   // un pedido que no cabe pasa entero al día siguiente
    cnt[d] = (cnt[d] || 0) + p.n;
    const item = Object.assign({}, p.o, { entregaDia: d, corrido: dias(d) - dias(desde) });
    (d <= hoy ? entregar : programados).push(item);
  });
  return { entregar, programados, cupoHoy: cnt[hoy] || 0 };
}
function pedidosParaEntregar(ordenes, clientes, hoy) { return planEntregas(ordenes, clientes, hoy).entregar; }
// URL completa de la foto de un set ("img/foto06.jpg" -> https://litlejacob.trade/img/foto06.jpg). Vacío si no hay o es una imagen incrustada.
function urlFoto(img, base) {
  img = String(img || "").trim();
  if (!img || /^data:/i.test(img)) return "";
  if (/^https?:\/\//i.test(img)) return img;
  return String(base || "https://litlejacob.trade").replace(/\/$/, "") + "/" + img.replace(/^\.?\//, "");
}
// imgPorId: { "<id del set>": "img/fotoNN.jpg" } (catálogo en vivo) para los pedidos que no guardaron la foto
function resumen(pedidos, imgPorId, base) {
  imgPorId = imgPorId || {};
  return pedidos.map((o) => ({
    code: o.code || "", cliente: o.customerName || "Sin nombre", steam: o.steamId || "", total: Number(o.total) || 0,
    whatsapp: o.phone || "", manual: !!o.manual, entrega: o.entregaDia || "", corrido: o.corrido || 0,
    nSets: setsDe(o),
    items: (o.items || []).map((it) => ({ name: it.name || "Set", qty: Number(it.qty) || 1, img: urlFoto(it.img || imgPorId[String(it.id)], base) })),
    sets: (o.items || []).map((it) => (it.qty > 1 ? it.qty + " x " : "") + it.name).join(", ")
  }));
}
module.exports = { ENTREGA_CAP, ESPERA_DIAS, custKey, hoyLima, planEntregas, pedidosParaEntregar, resumen, urlFoto };
