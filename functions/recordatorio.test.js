"use strict";
const assert = require("assert");
const { planEntregas, pedidosParaEntregar, resumen, custKey } = require("./recordatorio");
const hoy = "2026-10-30";
const ord = (i, extra) => Object.assign({ code: "LJ-" + i, customerName: "C" + i, steamId: String(1000 + i), status: "pagado", createdAt: new Date(2026, 9, 1, 12, i), items: [{ name: "Set", qty: 1 }] }, extra || {});
const cli = (os, desde) => { const m = {}; os.forEach((o) => { m[custKey(o.steamId, o.customerName)] = { friendSince: desde }; }); return m; };

// 10 pedidos con 30 días cumplidos: 8 hoy, 2 mañana (día 31)
let os = Array.from({ length: 10 }, (_, i) => ord(i + 1));
let p = planEntregas(os, cli(os, "2026-09-30"), hoy);
assert.strictEqual(p.entregar.length, 8);
assert.strictEqual(p.programados.length, 2);
assert.ok(p.programados.every((o) => o.entregaDia === "2026-10-31" && o.corrido === 1));
assert.deepStrictEqual(p.entregar.map((o) => o.code), os.slice(0, 8).map((o) => o.code)); // los más antiguos primero

// 25 pedidos: 8 + 8 + 8 + 1 (día 31, 32, 33)
os = Array.from({ length: 25 }, (_, i) => ord(i + 1));
p = planEntregas(os, cli(os, "2026-09-30"), hoy);
assert.strictEqual(p.entregar.length, 8);
assert.strictEqual(p.programados.filter((o) => o.entregaDia === "2026-11-02").length, 1);

// Aún no cumple 30 días: no se entrega hoy, se programa para su día 30
os = [ord(1)];
p = planEntregas(os, cli(os, "2026-10-20"), hoy);
assert.strictEqual(p.entregar.length, 0);
assert.strictEqual(p.programados[0].entregaDia, "2026-11-19");
assert.strictEqual(p.programados[0].corrido, 0);

// Sin fecha de amistad: no se programa
assert.strictEqual(planEntregas([ord(1)], {}, hoy).programados.length + planEntregas([ord(1)], {}, hoy).entregar.length, 0);

// Los entregados hoy ocupan cupo de hoy: 3 entregados + 7 pendientes → 5 hoy, 2 mañana
const hechos = [1, 2, 3].map((i) => ord(100 + i, { status: "entregado", entregadoDia: hoy }));
os = Array.from({ length: 7 }, (_, i) => ord(i + 1));
p = planEntregas(os.concat(hechos), Object.assign(cli(os, "2026-09-30"), cli(hechos, "2026-09-30")), hoy);
assert.strictEqual(p.entregar.length, 5);
assert.strictEqual(p.programados.length, 2);
assert.strictEqual(p.cupoHoy, 8);

// Entregados otro día no cuentan; pendientes y cancelados no se entregan; pedidos de items se ignoran
const otros = [ord(201, { status: "entregado", entregadoDia: "2026-10-29" }), ord(202, { status: "pendiente" }), ord(203, { status: "cancelado" }), ord(204, { origen: "items" })];
assert.strictEqual(pedidosParaEntregar(otros, cli(otros, "2026-09-30"), hoy).length, 0);
assert.strictEqual(planEntregas(otros, cli(otros, "2026-09-30"), hoy).cupoHoy, 0);

// Pedido manual de cliente no registrado (clave por ID de Steam) entra igual y se resume con su WhatsApp
const man = ord(300, { manual: true, phone: "@juan_wsp", steamId: "555123", customerName: "Juanito" });
const r = resumen(pedidosParaEntregar([man], { s555123: { friendSince: "2026-09-01" } }, hoy));
assert.deepStrictEqual([r.length, r[0].whatsapp, r[0].manual, r[0].entrega], [1, "@juan_wsp", true, hoy]);
// El cupo cuenta SETS, no pedidos: 3 pedidos de 3 sets = 9 sets → el tercero pasa a mañana
os = [1, 2, 3].map((i) => ord(i, { count: 3, items: [{ name: "Set", qty: 3 }] }));
p = planEntregas(os, cli(os, "2026-09-30"), hoy);
assert.deepStrictEqual([p.entregar.length, p.programados.length, p.cupoHoy], [2, 1, 6]);
assert.strictEqual(p.programados[0].entregaDia, "2026-10-31");
// 8 pedidos de 1 set siguen cabiendo hoy; un pedido de 5 sets + otro de 4 → el de 4 pasa a mañana
os = [ord(1, { count: 5 }), ord(2, { count: 4 })];
p = planEntregas(os, cli(os, "2026-09-30"), hoy);
assert.deepStrictEqual([p.entregar.length, p.programados.length], [1, 1]);
// Un pedido de 10 sets (más de 8) ocupa un día completo y no se bloquea
os = [ord(1, { count: 10 }), ord(2, { count: 1 })];
p = planEntregas(os, cli(os, "2026-09-30"), hoy);
assert.deepStrictEqual([p.entregar.map((o) => o.code), p.programados[0].entregaDia], [["LJ-1"], "2026-10-31"]);
console.log("recordatorio: todo bien");

// Correo con fotos
const emails = require("./emails");
const { urlFoto, resumen: res2 } = require("./recordatorio");
assert.strictEqual(urlFoto("img/foto06.jpg"), "https://litlejacob.trade/img/foto06.jpg");
assert.strictEqual(urlFoto("./img/a.jpg"), "https://litlejacob.trade/img/a.jpg");
assert.strictEqual(urlFoto("data:image/png;base64,AAA"), "");
assert.strictEqual(urlFoto(""), "");
const ped = res2([ord(1, { items: [{ id: "6", name: "Acechadora Sombría", qty: 2 }, { id: "9", name: "Sin foto", qty: 1, img: "" }], count: 3, phone: "51987654321" }), ord(2, { phone: "@jossad", manual: true, items: [{ id: "6", name: "X", qty: 1, img: "img/up-1.jpg" }] })], { "6": "img/foto11.jpg" });
const mail = emails.recordatorioEntregas("litlejacob", { fecha: hoy, cupo: 8, pedidos: ped });
assert.ok(mail.html.includes("https://litlejacob.trade/img/foto11.jpg") && mail.html.includes("https://litlejacob.trade/img/up-1.jpg"));
assert.ok(mail.html.includes("https://wa.me/51987654321") && mail.html.includes("@jossad") && mail.html.includes("🎁"));
assert.ok(mail.subject.includes("2 pedidos (4 sets)") && mail.from.includes("litlejacob.trade") && mail.text.includes("Acechadora"));
console.log("correo con fotos: todo bien");
