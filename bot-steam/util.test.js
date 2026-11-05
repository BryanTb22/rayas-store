"use strict";
const test = require("node:test");
const assert = require("node:assert");
const u = require("./util");

test("leerTradelink: válido y SteamID64", () => {
  const r = u.leerTradelink("https://steamcommunity.com/tradeoffer/new/?partner=427925017&token=AbC-12_x");
  assert.deepStrictEqual(r, { partner: 427925017, token: "AbC-12_x", steamId64: "76561198388190745" });
});

test("leerTradelink: inválidos", () => {
  assert.strictEqual(u.leerTradelink(""), null);
  assert.strictEqual(u.leerTradelink("https://steamcommunity.com/tradeoffer/new/?partner=abc&token=x"), null);
  assert.strictEqual(u.leerTradelink("http://steamcommunity.com/tradeoffer/new/?partner=1&token=x"), null);
  assert.strictEqual(u.leerTradelink("https://evil.com/tradeoffer/new/?partner=1&token=x"), null);
});

test("elegirItems: toma las unidades justas y respeta reservados", () => {
  const inv = [
    { assetid: "1", market_hash_name: "Bracers of the Cavern Luminar", tradable: true },
    { assetid: "2", market_hash_name: "Bracers of the Cavern Luminar", tradable: true },
    { assetid: "3", market_hash_name: "Bracers of the Cavern Luminar", tradable: false },
    { assetid: "4", market_hash_name: "Inscribed Golden Moonfall", tradable: true },
  ];
  const r = u.elegirItems(inv, [{ name: "bracers of the cavern  luminar", qty: 2 }, { name: "Inscribed Golden Moonfall", qty: 1 }], new Set(["1"]));
  assert.deepStrictEqual(r.elegidos.map((i) => i.assetid), ["2", "4"]);
  assert.deepStrictEqual(r.faltan, [{ name: "bracers of the cavern  luminar", faltan: 1 }]);
});

test("elegirItems: no repite la misma unidad entre líneas", () => {
  const inv = [{ assetid: "9", market_hash_name: "Taunt: Ñandú", tradable: true }];
  const r = u.elegirItems(inv, [{ name: "Taunt: Nandu", qty: 1 }, { name: "Taunt: Ñandú", qty: 1 }], null);
  assert.strictEqual(r.elegidos.length, 1);
  assert.strictEqual(r.faltan.length, 1);
});

test("estadoDeOferta: aceptada marca entregado", () => {
  const E = { Active: 2, Accepted: 3, Countered: 4, Expired: 5, Canceled: 6, Declined: 7, InvalidItems: 8, CreatedNeedsConfirmation: 9, CanceledBySecondFactor: 10, InEscrow: 11 };
  assert.strictEqual(u.estadoDeOferta(3, E).entregado, true);
  assert.strictEqual(u.estadoDeOferta(7, E).estado, "fallida");
  assert.strictEqual(u.estadoDeOferta(11, E).estado, "retenida");
  assert.strictEqual(u.estadoDeOferta(99, E), null);
});

test("mensajeOferta y codigoDeMensaje van de ida y vuelta", () => {
  assert.strictEqual(u.codigoDeMensaje(u.mensajeOferta("LJ-ABC123", "litlejacob")), "LJ-ABC123");
  assert.strictEqual(u.codigoDeMensaje("hola"), "");
});

test("leerConfig avisa lo que falta", () => {
  assert.throws(() => u.leerConfig({ STEAM_USUARIO: "x" }), /STEAM_CLAVE, MAFILE, FIREBASE_CREDENCIALES/);
  assert.strictEqual(u.leerConfig({ STEAM_USUARIO: "a", STEAM_CLAVE: "b", MAFILE: "c", FIREBASE_CREDENCIALES: "d" }).vencerHoras, 48);
});

test("agruparInventario suma unidades y arma el ícono", () => {
  const g = u.agruparInventario([
    { market_hash_name: "B", icon_url: "abc", name_color: "D2D2D2", tags: [{ category: "Rarity", name: "Mythical" }] },
    { market_hash_name: "A" }, { market_hash_name: "B" },
  ]);
  assert.deepStrictEqual(g.map((x) => [x.nombre, x.cantidad]), [["A", 1], ["B", 2]]);
  assert.match(g[1].icono, /economy\/image\/abc\//);
  assert.strictEqual(g[1].color, "#D2D2D2"); assert.strictEqual(g[1].rareza, "Mythical");
});
