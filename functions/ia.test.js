"use strict";
// Prueba: node functions/ia.test.js  (no llama a la API real)
const assert = require("assert");
const ia = require("./ia");

(async function () {
  // limpiar datos
  const it = ia.limpiarItem({ nombre: "  Strongback the Swift ", precio: "75", steam: 85.456, stock: "0", raro: "x" });
  assert.strictEqual(it.nombre, "Strongback the Swift"); assert.strictEqual(it.precio, 75); assert.strictEqual(it.steam, 85.46); assert.strictEqual(it.stock, 1); assert.strictEqual(it.raro, undefined);
  // pedido: tienda correcta, soles, sin créditos
  const p = ia.armarPedido("litlejacob", it);
  assert(/LitleJacob Store/.test(p.system) && /litlejacob\.trade/.test(p.system)); assert(/S\/ 75/.test(p.user)); assert(/S\/ 85\.46/.test(p.user));
  assert(/Rayas Store/.test(ia.armarPedido("otra", it).system));
  // leer respuesta con ``` alrededor
  const l = ia.leerRespuesta('```json\n{"textos":[{"titulo":"Urgencia","texto":"A"},{"titulo":"Corto","texto":"B"},{"titulo":"X","texto":""}]}\n```');
  assert.deepStrictEqual(l.map((x) => x.texto), ["A", "B"]);
  assert.throws(() => ia.leerRespuesta("nada"));
  // llamada simulada
  let enviado = null;
  const ok = async (url, o) => { enviado = { url, o: o, body: JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"textos":[{"titulo":"Urgencia","texto":"🔥 *STRONGBACK* S/ 75"}]}' }] }) }; };
  const r = await ia.escribirTextos("sk-prueba", "rayas", { nombre: "Strongback", precio: 75 }, ok);
  assert.strictEqual(r[0].titulo, "Urgencia"); assert.strictEqual(enviado.url, "https://api.anthropic.com/v1/messages");
  assert.strictEqual(enviado.o.headers["x-api-key"], "sk-prueba"); assert.strictEqual(enviado.body.model, ia.MODELO);
  // errores legibles
  const mal = (st, msg) => async () => ({ ok: false, status: st, json: async () => ({ error: { message: msg || "" } }) });
  await assert.rejects(ia.escribirTextos("k", "rayas", { nombre: "A" }, mal(401)), /clave/);
  await assert.rejects(ia.escribirTextos("k", "rayas", { nombre: "A" }, mal(400, "Your credit balance is too low")), /crédito/);
  await assert.rejects(ia.escribirTextos("k", "rayas", { nombre: "" }, ok), /nombre/);
  console.log("ia.test.js: todo OK");
})().catch((e) => { console.error(e); process.exit(1); });
