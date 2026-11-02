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
  const fotos = (await ia.buscarFotos("k", { nombre: "Sea Rake's Bridle", heroe: "Slark" }, web)).fotos;
  // del 1er video salen sus 3 cuadros (2, 1, 3), del 2º otros 3 = 6; nunca la portada si hay cuadros
  assert.deepStrictEqual(fotos.map((x) => x.id), ["aaaaaaaaaaa-2", "aaaaaaaaaaa-1", "aaaaaaaaaaa-3", "bbbbbbbbbbb-2", "bbbbbbbbbbb-1", "bbbbbbbbbbb-3"]);
  assert(/^data:image\/jpeg;base64,/.test(fotos[0].data)); assert(!fotos.some((x) => x.portada));
  assert(pedidos.some((u) => /aaaaaaaaaaa\/maxres2\.jpg/.test(u))); assert(!pedidos.some((u) => /default\.jpg/.test(u)));
  // video sin cuadros: usa la portada
  const sinCuadros = async (url, o) => /api\.anthropic/.test(url) ? web(url, o) : (/default\.jpg/.test(url) ? { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(9000).buffer } : { ok: false, status: 404 });
  const f2 = (await ia.buscarFotos("k", { nombre: "X" }, sinCuadros)).fotos;
  assert(f2.length === 3 && f2.every((x) => x.portada));
  const vacio = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "no hay" }] }) });
  await assert.rejects(ia.buscarFotos("k", { nombre: "X" }, vacio), /No encontré/);
  // la IA califica: quedan solo las de nota >= 6, la mejor primero; recibe la imagen oficial de referencia
  let califico = null;
  const conNotas = async (url, o) => {
    if (/api\.anthropic/.test(url)) {
      const body = JSON.parse(o.body);
      if (body.tool_choice && body.tool_choice.name === "calificar_fotos") {
        califico = body;
        return { ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", name: "calificar_fotos", input: { fotos: [{ n: 1, nota: 2 }, { n: 2, nota: 9 }, { n: 3, nota: 7 }, { n: 4, nota: 1 }, { n: 5, nota: 6 }, { n: 6, nota: 3 }] } }] }) };
      }
    }
    return web(url, o);
  };
  const ref = "data:image/jpeg;base64,QUJD";
  const x3 = await ia.buscarFotos("k", { nombre: "Bladeform Legacy", heroe: "Juggernaut" }, conNotas, ref);
  assert.deepStrictEqual(x3.fotos.map((x) => x.nota), [9, 7, 6]); assert.strictEqual(x3.aviso, "");
  assert(califico.messages[0].content.some((c) => c.type === "image" && c.source.data === "QUJD"));
  assert.strictEqual(califico.messages[0].content.filter((c) => c.type === "image").length, 1 + 9);
  // ninguna buena: devuelve las 3 mejores con aviso
  const malas = async (url, o) => /api\.anthropic/.test(url) && JSON.parse(o.body).tool_choice ? { ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", name: "calificar_fotos", input: { fotos: [{ n: 2, nota: 4 }, { n: 1, nota: 1 }] } }] }) } : web(url, o);
  const x4 = await ia.buscarFotos("k", { nombre: "X" }, malas);
  assert.strictEqual(x4.fotos.length, 3); assert.strictEqual(x4.fotos[0].nota, 4); assert(/de cerca/.test(x4.aviso));
  // si calificar falla, igual devuelve fotos
  const falla = async (url, o) => /api\.anthropic/.test(url) && JSON.parse(o.body).tool_choice ? { ok: false, status: 529, json: async () => ({}) } : web(url, o);
  assert.strictEqual((await ia.buscarFotos("k", { nombre: "X" }, falla)).fotos.length, 6);
  // retroalimentación: los ejemplos van como imágenes antes de las candidatas; mismo héroe primero
  const docs = [
    { heroe: "Slark", buena: { data: "data:image/jpeg;base64,U0xB" }, malas: [{ data: "data:image/jpeg;base64,TUFM" }] },
    { heroe: "Juggernaut", buena: { data: "data:image/jpeg;base64,SlVH" }, malas: [] },
    { heroe: "Pudge", buena: { data: "data:image/jpeg;base64,UFVE" }, malas: [{ data: "data:image/jpeg;base64,TUFM" }, { data: "data:image/jpeg;base64,TUFM" }, { data: "data:image/jpeg;base64,TUFM" }, { data: "data:image/jpeg;base64,TUFM" }] }
  ];
  const ej = ia.elegirEjemplos(docs, "juggernaut");
  assert.deepStrictEqual(ej.buenas.map((x) => x.slice(-4)), ["SlVH", "U0xB", "UFVE"]); assert.strictEqual(ej.malas.length, 3);
  let conEj = null;
  const verEj = async (url, o) => { if (/api\.anthropic/.test(url) && JSON.parse(o.body).tool_choice) conEj = JSON.parse(o.body); return conNotas(url, o); };
  await ia.buscarFotos("k", { nombre: "Bladeform Legacy", heroe: "Juggernaut" }, verEj, ref, ej);
  const imgs = conEj.messages[0].content.filter((c) => c.type === "image").map((c) => c.source.data);
  assert.strictEqual(imgs.length, 1 + 3 + 3 + 9); assert.strictEqual(imgs[1], "SlVH");
  assert(conEj.messages[0].content.some((c) => c.type === "text" && /NO le gustaron/.test(c.text)));
  // limpiar feedback: solo data URLs válidas, previa aparte
  const fb = ia.limpiarFeedback({ itemId: "it-1", nombre: "X", heroe: "Slark", buena: { id: "a-2", data: "data:image/jpeg;base64,QUJD" }, malas: [{ id: "b", data: "javascript:1" }, { id: "c", data: "data:image/png;base64,QUJD" }], previa: "data:image/jpeg;base64,QUJD" });
  assert.strictEqual(fb.buena.id, "a-2"); assert.strictEqual(fb.malas.length, 1); assert(fb.previa);
  assert.strictEqual(ia.limpiarFeedback({ buena: { data: "http://x" } }).buena, null);
  const pub = ia.limpiarPublicacion({ imagen: "data:image/jpeg;base64,QUJD", nombre: "X", precio: "85", textos: [{ titulo: "U", texto: "a" }, { texto: "" }] });
  assert.strictEqual(pub.imagen.length, 27); assert.strictEqual(pub.precio, 85); assert.strictEqual(pub.textos.length, 1);
  assert.strictEqual(ia.limpiarPublicacion({ imagen: "http://x" }).imagen, "");
  console.log("ia.test.js: todo OK");
})().catch((e) => { console.error(e); process.exit(1); });
