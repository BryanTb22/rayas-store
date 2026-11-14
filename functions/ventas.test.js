"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("./ventas");

test("código de venta: formato y lectura desde el mensaje del trade", () => {
  const c = v.nuevoCodigoVenta();
  assert.match(c, /^V-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(v.codigoDeMensaje("Hola, mi código: " + c), c);
  assert.equal(v.codigoDeMensaje("v-ab3cd"), "V-AB3CD");
  assert.equal(v.codigoDeMensaje("V - XY7ZQ gracias"), "V-XY7ZQ");
  assert.equal(v.codigoDeMensaje("sin código"), "");
  assert.equal(v.codigoDeMensaje(null), "");
});

test("mapaPrecios: la lista manual gana a la automática; soles hacia abajo", () => {
  const m = v.mapaPrecios({ items: [{ n: "Golden Moonfall", pen: 29.876 }, { n: "Silent Wake", pen: 36 }, { n: "Malo", pen: 0 }] }, [{ nombre: "silent  wake", precio: 40 }]);
  assert.equal(m.get("golden moonfall"), 29.87);
  assert.equal(m.get("silent wake"), 40);
  assert.equal(m.has("malo"), false);
});

test("leerConfig y puedeVender (piloto)", () => {
  const c = v.leerConfig({ permitidos: ["abc"], topeVenta: "80", minutos: 999 });
  assert.equal(c.activo, false);
  assert.equal(c.topeVenta, 80);
  assert.equal(c.minutos, 120);
  assert.equal(v.puedeVender(c, "abc", false), true);
  assert.equal(v.puedeVender(c, "otro", false), false);
  assert.equal(v.puedeVender(c, "otro", true), true);
  assert.equal(v.puedeVender(v.leerConfig({ activo: true }), "otro", false), true);
});

const INV = [{ k: "Golden Moonfall", name: "Golden Moonfall", n: 2 }, { k: "Silent Wake", name: "Silent Wake", n: 1 }, { k: "Treasure X", name: "Treasure X", n: 3 }];
const PRE = v.mapaPrecios({ items: [{ n: "Golden Moonfall", pen: 10.1 }, { n: "Silent Wake", pen: 5.25 }] }, []);

test("armarVenta: suma con precios del servidor y junta líneas repetidas", () => {
  const r = v.armarVenta([{ name: "Golden Moonfall", qty: 1 }, { name: "golden moonfall", qty: 1 }, { name: "Silent Wake", qty: 1, price: 999 }], INV, PRE);
  assert.equal(r.total, 25.45);
  assert.equal(r.count, 3);
  assert.deepEqual(r.lineas.map((l) => [l.name, l.qty, l.price]), [["Golden Moonfall", 2, 10.1], ["Silent Wake", 1, 5.25]]);
});

test("armarVenta: errores", () => {
  const code = (f) => { try { f(); return "ok"; } catch (e) { return e.code; } };
  assert.equal(code(() => v.armarVenta([], INV, PRE)), "VACIO");
  assert.equal(code(() => v.armarVenta([{ name: "Golden Moonfall", qty: 3 }], INV, PRE)), "NO_TIENES");
  assert.equal(code(() => v.armarVenta([{ name: "No existe", qty: 1 }], INV, PRE)), "NO_TIENES");
  assert.equal(code(() => v.armarVenta([{ name: "Treasure X", qty: 1 }], INV, PRE)), "SIN_PRECIO");
  assert.equal(code(() => v.armarVenta([{ name: "Silent Wake", qty: 0 }], INV, PRE)), "ITEM_MALO");
});

test("comparaRecibidos: exacto, faltan, sobran u otro juego", () => {
  const L = [{ name: "Golden Moonfall", qty: 2 }, { name: "Silent Wake", qty: 1 }];
  const it = (n, appid) => ({ market_hash_name: n, appid: appid || 570 });
  assert.equal(v.comparaRecibidos([it("Golden Moonfall"), it("golden moonfall"), it("Silent Wake")], L).ok, true);
  assert.deepEqual(v.comparaRecibidos([it("Golden Moonfall"), it("Silent Wake")], L).faltan, ["golden moonfall"]);
  assert.deepEqual(v.comparaRecibidos([it("Golden Moonfall"), it("Golden Moonfall"), it("Silent Wake"), it("Extra")], L).sobra, ["Extra"]);
  assert.equal(v.comparaRecibidos([it("Golden Moonfall"), it("Golden Moonfall"), it("Silent Wake", 730)], L).ok, false);
});

test("puedeVender: el piloto acepta correos (sin importar mayúsculas)", () => {
  const c = v.leerConfig({ permitidos: ["Cliente@Correo.com"] });
  assert.equal(v.puedeVender(c, "uid1", false, "cliente@correo.com"), true);
  assert.equal(v.puedeVender(c, "uid1", false, "otro@correo.com"), false);
  assert.equal(v.puedeVender(c, "uid1", false, ""), false);
});
