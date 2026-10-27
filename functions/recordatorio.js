"use strict";
// Pedidos pagados (sin entregar) cuyo cliente ya cumplió 30 días de amistad. Misma regla que el panel (index.html: dueToday).
function normalizar(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function custKey(steamId, name) {
  if (steamId) return "s" + steamId;
  return "n-" + (normalizar(name || "cliente").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente");
}
function hoyLima(ahora) { return new Date((ahora || new Date()).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
function dias(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; }
// ordenes: [{code, customerName, steamId, status, total, items}], clientes: { key: {friendSince:"YYYY-MM-DD"} }
function pedidosParaEntregar(ordenes, clientes, hoy) {
  return ordenes.filter((o) => {
    if (o.status !== "pagado") return false;
    const c = clientes[custKey(o.steamId, o.customerName)];
    const since = c && /^\d{4}-\d{2}-\d{2}$/.test(c.friendSince || "") ? c.friendSince : "";
    return !!since && dias(hoy) - dias(since) >= 30;
  });
}
function resumen(pedidos) {
  return pedidos.map((o) => ({
    code: o.code || "", cliente: o.customerName || "Sin nombre", steam: o.steamId || "", total: Number(o.total) || 0,
    sets: (o.items || []).map((it) => (it.qty > 1 ? it.qty + " x " : "") + it.name).join(", ")
  }));
}
module.exports = { custKey, hoyLima, pedidosParaEntregar, resumen };
