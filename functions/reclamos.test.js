"use strict";
const assert = require("assert");
const { validar, masDiasHabiles, correoHoja } = require("./reclamos");
const ok = { tipoDoc: "DNI", numDoc: "12345678", nombre: "Juan Perez Soto", domicilio: "Av. Lima 123, Lima", telefono: "999888777", email: "A@B.com", bienTipo: "producto", bien: "Item Dota 2", tipo: "reclamo", detalle: "No me llegó el item que pagué.", pedido: "Quiero mi item" };
assert.ok(validar(ok).ok); assert.strictEqual(validar(ok).datos.email, "a@b.com");
assert.ok(!validar(Object.assign({}, ok, { numDoc: "123" })).ok);
assert.ok(!validar(Object.assign({}, ok, { email: "x" })).ok);
assert.ok(!validar(Object.assign({}, ok, { tipo: "otro" })).ok);
assert.ok(!validar(Object.assign({}, ok, { menor: true })).ok);
assert.ok(!validar(Object.assign({}, ok, { monto: "abc" })).ok);
assert.ok(validar(Object.assign({}, ok, { monto: "25.50" })).ok);
// 15 días hábiles desde un lunes = 3 semanas después (lunes)
assert.strictEqual(masDiasHabiles(new Date("2026-11-02T12:00:00Z"), 15).toISOString().slice(0, 10), "2026-11-23");
const c = correoHoja("litlejacob", Object.assign({}, validar(ok).datos, { numero: "LJ-2026-000001", creado: new Date(), vence: new Date() }), false);
assert.ok(c.html.indexOf("LJ-2026-000001") > 0 && c.from.indexOf("litlejacob.trade") > 0);
console.log("todo bien");
