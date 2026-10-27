"use strict";
/* Lee el inventario público de Dota 2 (appid 570, contexto 2) a partir de un trade link. */
const BASE64 = BigInt("76561197960265728");

function steamIdDeTradeLink(link) {
  const m = /[?&]partner=(\d{1,12})/.exec(String(link || ""));
  if (!m) return null;
  const n = BigInt(m[1]);
  if (n <= 0n) return null;
  return String(n + BASE64);
}

/* Agrupa por market_hash_name; solo cuenta los intercambiables. */
function agrupar(data) {
  const desc = {};
  (data.descriptions || []).forEach((d) => { desc[d.classid + "_" + d.instanceid] = d; });
  const grupos = {};
  let noTradables = 0;
  (data.assets || []).forEach((a) => {
    const d = desc[a.classid + "_" + a.instanceid];
    if (!d) return;
    if (!d.tradable) { noTradables += Number(a.amount || 1); return; }
    const k = d.market_hash_name || d.name;
    if (!k) return;
    const g = grupos[k] || (grupos[k] = {
      k: k, name: d.market_name || d.name || k, n: 0,
      icon: d.icon_url ? "https://community.cloudflare.steamstatic.com/economy/image/" + d.icon_url + "/128fx128f" : "",
      color: /^[0-9a-fA-F]{6}$/.test(d.name_color || "") ? "#" + d.name_color : ""
    });
    g.n += Number(a.amount || 1);
  });
  return { items: Object.keys(grupos).map((k) => grupos[k]).sort((x, y) => x.name.localeCompare(y.name)), noTradables: noTradables };
}

module.exports = { steamIdDeTradeLink, agrupar };
