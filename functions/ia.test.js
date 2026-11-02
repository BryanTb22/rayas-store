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
  const ok = async (url, o) => { enviado = { url, o: o, body: JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", name: "guardar_textos", input: { textos: [{ titulo: "Urgencia", texto: "🔥 *STRONGBACK* S/ 75\n\"Última\" unidad" }] } }] }) }; };
  const r = await ia.escribirTextos("sk-prueba", "rayas", { nombre: "Strongback", precio: 75 }, ok);
  assert.strictEqual(r[0].titulo, "Urgencia"); assert.strictEqual(enviado.url, "https://api.anthropic.com/v1/messages");
  assert.strictEqual(enviado.o.headers["x-api-key"], "sk-prueba"); assert.strictEqual(enviado.body.model, ia.MODELO);
  assert.strictEqual(enviado.body.tool_choice.name, "guardar_textos"); assert(/Última/.test(r[0].texto));
  // JSON roto en texto: error legible, no el de JSON.parse
  assert.throws(() => ia.leerRespuesta('{"textos":[{"titulo":"a" "texto":"b"}]}'), /mal armados/);
  // respaldo: texto con JSON sigue sirviendo
  const vieja = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"textos":[{"titulo":"U","texto":"x"}]}' }] }) });
  assert.strictEqual((await ia.escribirTextos("k", "rayas", { nombre: "A" }, vieja))[0].texto, "x");
  // errores legibles
  const mal = (st, msg) => async () => ({ ok: false, status: st, json: async () => ({ error: { message: msg || "" } }) });
  await assert.rejects(ia.escribirTextos("k", "rayas", { nombre: "A" }, mal(401)), /clave/);
  await assert.rejects(ia.escribirTextos("k", "rayas", { nombre: "A" }, mal(400, "Your credit balance is too low")), /crédito/);
  await assert.rejects(ia.escribirTextos("k", "rayas", { nombre: "" }, ok), /nombre/);
  // foto in-game desde la web
  assert.deepStrictEqual(ia.idsYoutube("https://www.youtube.com/watch?v=abcdefghijk&t=3 y https://youtu.be/ABCDEFGHIJK y otra vez https://youtube.com/watch?v=abcdefghijk"), ["abcdefghijk", "ABCDEFGHIJK"]);
  const pedidos = [];
  const web = async (url, o) => {
    pedidos.push(url);
    if (url.indexOf("api.anthropic.com") >= 0) {
      const body = JSON.parse(o.body); assert.strictEqual(body.tools[0].type, "web_search_20250305");
      return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.youtube.com/watch?v=zzzzzzzzzzz" }] },
        { type: "text", text: "1. https://www.youtube.com/watch?v=aaaaaaaaaaa\n2. https://youtu.be/bbbbbbbbbbb" }] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(9000).buffer };
  };
  const fotos = await ia.buscarFotos("k", { nombre: "Sea Rake's Bridle", heroe: "Slark" }, web);
  // del 1er video salen sus 3 cuadros (2, 1, 3), del 2º otros 3 = 6; nunca la portada si hay cuadros
  assert.deepStrictEqual(fotos.map((x) => x.id), ["aaaaaaaaaaa-2", "aaaaaaaaaaa-1", "aaaaaaaaaaa-3", "bbbbbbbbbbb-2", "bbbbbbbbbbb-1", "bbbbbbbbbbb-3"]);
  assert(/^data:image\/jpeg;base64,/.test(fotos[0].data)); assert(!fotos.some((x) => x.portada));
  assert(pedidos.some((u) => /aaaaaaaaaaa\/maxres2\.jpg/.test(u))); assert(!pedidos.some((u) => /default\.jpg/.test(u)));
  // video sin cuadros: usa la portada
  const sinCuadros = async (url, o) => /api\.anthropic/.test(url) ? web(url, o) : (/default\.jpg/.test(url) ? { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(9000).buffer } : { ok: false, status: 404 });
  const f2 = await ia.buscarFotos("k", { nombre: "X" }, sinCuadros);
  assert(f2.length === 3 && f2.every((x) => x.portada));
  const vacio = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "no hay" }] }) });
  await assert.rejects(ia.buscarFotos("k", { nombre: "X" }, vacio), /No encontré/);
  console.log("ia.test.js: todo OK");
})().catch((e) => { console.error(e); process.exit(1); });
