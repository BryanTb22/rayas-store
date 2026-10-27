# Pagos con Culqi — guía de activación

Estado: **código listo, NO desplegado y NO activo.** La página sigue pidiendo créditos por WhatsApp
hasta que pongas la llave pública de Culqi en `app.js` (`PAGOS.culqiPk`).

## Cómo funciona
1. El cliente elige un paquete (S/ 10, 20, 50, 100) → se abre la ventana de Culqi (Yape / tarjeta).
2. Culqi devuelve un *token* → la página lo manda a la función `cobrar` (con la sesión del usuario).
3. `cobrar` crea el cargo en Culqi con la llave SECRETA, y si fue exitoso suma los créditos en Firestore.
4. `webhookCulqi` es la red de seguridad: si algo falla a medio camino, Culqi avisa y se acreditan igual.
   Nunca acredita dos veces el mismo pago, y la promo de primera recarga se usa una sola vez por cuenta.

El cliente elige un monto (S/ 10, 20, 50, 100 u otro entre S/ 3 y S/ 500) y cómo pagar: **Yape/tarjeta (Culqi)** o **WhatsApp**.
Los créditos y la promo los calcula **solo** el servidor (`functions/packs.js`); el navegador solo manda cuántos soles.
Supuestos míos: 1 crédito = S/ 1; promo de primera recarga S/ 50 → 55 y S/ 100 → 110; montos libres sin promo, entre S/ 3 y S/ 500. Cámbialos en `packs.js` y en `PAGOS`/`PACKS_UI` de `app.js`.
Si cambias `functions/`, hay que volver a desplegar (`firebase deploy --only functions`).

## 0. Antes de nada (importante)
- Este código se escribió **sin poder abrir la documentación de Culqi**. Verifica en docs.culqi.com:
  `POST /v2/charges`, `GET /v2/charges/{id}`, `outcome.type === "venta_exitosa"` (todo está en `functions/culqi.js`)
  y la URL del script del checkout (`PAGOS.js` en `app.js`).
- **Prueba primero con llaves de prueba** (`pk_test_…` / `sk_test_…`) y tarjetas de prueba de Culqi.
- La lógica de acreditación se probó con una base de datos simulada, no contra tu Firebase ni contra Culqi.

## 1. Reglas de Firestore (HAZLO ANTES de activar)
El proyecto `litlejacob-store` lo comparten **LitleJacob y Rayas**, así que **no reemplaces** las reglas:
mezcla esto con las que ya tienes (en Firebase Console → Firestore → Reglas) y pruébalo en el *Simulador*.
Hoy el navegador puede modificar `creditos`; con créditos pagados eso debe cerrarse: solo se pueden **bajar**.

```
match /rayas_users/{uid} {
  allow read: if request.auth != null && (request.auth.uid == uid || request.auth.uid == 'eLEZkdXiG5b0PpxHQCCei8D0Qxy1');
  allow create: if request.auth != null && request.auth.uid == uid && request.resource.data.creditos == 0;
  allow update: if request.auth != null && (
      request.auth.uid == 'eLEZkdXiG5b0PpxHQCCei8D0Qxy1'
      || (request.auth.uid == uid
          && request.resource.data.creditos <= resource.data.creditos
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['nombre','whatsapp','tradelink','steam','creditos'])));
}
match /rayas_pagos/{id} {
  allow read: if request.auth != null && (resource.data.uid == request.auth.uid || request.auth.uid == 'eLEZkdXiG5b0PpxHQCCei8D0Qxy1');
  allow write: if false;   // solo las funciones (Admin SDK) escriben aquí
}
```
Ojo: la lectura de `rayas_users` y el resto de colecciones (`rayas_part`, `rayas/estado`…) ya tienen reglas tuyas; no las pises.
Límite conocido: el descuento de créditos al entrar a una rifa lo escribe el navegador junto con la participación;
las reglas pueden impedir que *suban* el saldo, pero no obligar a que *bajen* al participar. Para blindarlo del todo,
la participación debería pasar también por una función (siguiente mejora).

## 2. Desplegar las funciones
Requiere Node 20 y Firebase CLI (`npm i -g firebase-tools`, `firebase login`). Desde esta carpeta:
```
cd functions && npm install && cd ..
firebase functions:secrets:set CULQI_SECRET_KEY      # pega tu sk_test_… (luego sk_live_…)
firebase functions:secrets:set CULQI_WEBHOOK_KEY     # inventa una clave larga y aleatoria
firebase deploy --only functions
```
(El plan Blaze, que ya tienes, es necesario.)

## 3. Culqi
- Panel de Culqi → Desarrollo → API Keys: copia la **llave pública** `pk_test_…` en `app.js` → `PAGOS.culqiPk`.
- Panel de Culqi → Eventos/Webhooks: registra
  `https://us-central1-litlejacob-store.cloudfunctions.net/webhookCulqi?k=TU_CULQI_WEBHOOK_KEY`
  para el evento de cargo creado (`charge.creation.succeeded`).
- Si tu `rayas.trade` usa otro dominio, ajusta `ORIGENES` en `functions/index.js` (CORS).

## 4. Activar y probar
1. Pon `pk_test_…` en `app.js`, sube el cambio y prueba una recarga con tarjeta de prueba:
   los créditos deben subir, y en Firestore debe aparecer un documento en `rayas_pagos` con `estado: "acreditado"`.
2. Repite el mismo pago y verifica que no se duplica. Prueba una tarjeta rechazada.
3. Recién ahí cambia a llaves `live` (pk en `app.js`, sk con `secrets:set`) y actualiza el webhook en modo producción.

## 5. Textos de la página
Cambié los textos por defecto (ya no dicen "créditos gratis"). Si en el panel admin → "Textos y contactos"
guardaste textos propios, **esos siguen mandando**: revísalos. Dos reglas son borrador y debes confirmarlas tú:
- "Los créditos usados en una rifa no se devuelven. Si hay un error en tu recarga, escríbenos por WhatsApp."
- "S/ 1 = 1 crédito."
