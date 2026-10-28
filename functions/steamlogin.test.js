"use strict";
// Prueba rápida (sin red):  node functions/steamlogin.test.js
const assert = require("assert");
const { puros: P } = require("./steamlogin");
const OR = ["https://rayas.trade", "https://litlejacob.trade"];
assert(P.origenPermitido("https://rayas.trade", OR)); assert(!P.origenPermitido("https://malo.com", OR)); assert(!P.origenPermitido(null, OR));
assert.strictEqual(P.rutaSegura("/rifas.html"), "/rifas.html"); assert.strictEqual(P.rutaSegura("//evil.com"), "/"); assert.strictEqual(P.rutaSegura("/../x"), "/"); assert.strictEqual(P.rutaSegura("https://x"), "/"); assert.strictEqual(P.rutaSegura(undefined), "/");
const n = P.nonceNuevo(); assert(P.nonceValido(n)); assert(!P.nonceValido("abc")); assert(!P.nonceValido(null)); assert.notStrictEqual(n, P.nonceNuevo());
assert(P.nonceVencido(null, 1)); assert(P.nonceVencido({ exp: 5 }, 10)); assert(!P.nonceVencido({ exp: 20 }, 10));
assert.strictEqual(P.steamIdDeClaimed("https://steamcommunity.com/openid/id/76561198000000001"), "76561198000000001");
assert.strictEqual(P.steamIdDeClaimed("https://evil.com/openid/id/76561198000000001"), null);
assert.strictEqual(P.steamIdDeClaimed("https://steamcommunity.com/openid/id/123"), null);
assert.strictEqual(P.codigoAmigo("76561198000000001"), "39734273");
const RET = "https://us-central1-litlejacob-store.cloudfunctions.net/steamCallback?n=" + n;
const ok = { "openid.mode": "id_res", "openid.op_endpoint": P.STEAM_OPENID, "openid.return_to": RET, "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
  "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000001", "openid.identity": "https://steamcommunity.com/openid/id/76561198000000001" };
assert.strictEqual(P.revisarRespuesta(ok, RET).steamId, "76561198000000001");
assert(P.revisarRespuesta(Object.assign({}, ok, { "openid.mode": "cancel" }), RET).error);
assert(P.revisarRespuesta(Object.assign({}, ok, { "openid.return_to": RET + "x" }), RET).error);
assert(P.revisarRespuesta(Object.assign({}, ok, { "openid.op_endpoint": "https://evil.com/login" }), RET).error);
assert(P.revisarRespuesta(Object.assign({}, ok, { "openid.signed": "signed" }), RET).error);
assert(P.revisarRespuesta(Object.assign({}, ok, { "openid.identity": "https://steamcommunity.com/openid/id/76561198000000002" }), RET).error);
assert(P.revisarRespuesta(Object.assign({}, ok, { "openid.claimed_id": "https://x.com/openid/id/76561198000000001", "openid.identity": "https://x.com/openid/id/76561198000000001" }), RET).error);
const cv = new URLSearchParams(P.cuerpoVerificacion(Object.assign({ n: "x", otro: "y" }, ok)));
assert.strictEqual(cv.get("openid.mode"), "check_authentication"); assert(!cv.has("n")); assert(!cv.has("otro")); assert.strictEqual(cv.get("openid.claimed_id"), ok["openid.claimed_id"]);
assert(P.esValidoSteam("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")); assert(!P.esValidoSteam("is_valid:false\n")); assert(!P.esValidoSteam(""));
assert.strictEqual(P.nombreDeXml("<profile><steamID><![CDATA[Juan <b>]]></steamID></profile>"), "Juan b"); assert.strictEqual(P.nombreDeXml("x"), "");
const u = new URL(P.urlDeSteam(RET, "https://r")); assert.strictEqual(u.searchParams.get("openid.mode"), "checkid_setup"); assert.strictEqual(u.searchParams.get("openid.return_to"), RET);
console.log("steamlogin: todo bien");
