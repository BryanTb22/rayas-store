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

## Interruptor y paso a producción

- **Interruptor:** Panel admin → *Textos y contactos* → "Cobrar con Culqi" → **Publicar**. Apagado: los clientes solo piden créditos por WhatsApp. Vale para las dos páginas (comparten `rayas/estado`). El servidor también lo revisa (`cobroActivo()` en `functions/index.js`); el admin siempre puede probar.
- **Candado de pruebas:** mientras el secreto sea `sk_test_…`, solo el admin puede "pagar" (nadie recibe créditos gratis por error).
- **Pasar a real:** (1) activar el comercio en CulqiPanel y copiar `pk_live_…` y `sk_live_…`; (2) `firebase functions:secrets:set CULQI_SECRET_KEY --data-file clave.txt` con la `sk_live_`; (3) poner la `pk_live_` en `PAGOS.culqiPk` de `app.js` y `rifas.js`; (4) registrar el webhook también en el entorno de producción de Culqi; (5) `firebase deploy --only functions`; (6) probar con un pago real pequeño; (7) encender el interruptor.

## Efectivo (PagoEfectivo), QR y billeteras — función `crearOrden`
- El cliente elige el monto (mínimo S/ 6) y pulsa "Efectivo / QR / billeteras". La función `crearOrden` crea una **orden** en Culqi (vale 24 h) y la ventana de Culqi muestra el código.
- Los créditos NO se suman al crear la orden: se suman cuando Culqi manda el aviso (webhook) de orden pagada. El webhook le pregunta a Culqi el estado real (`GET /v2/orders/{id}` → `state: "paid"`) y acredita una sola vez.
- En el panel de Culqi (modo prueba y luego producción): activar PagoEfectivo/QR/billeteras en tu comercio y agregar al webhook existente el evento de órdenes (`order.status.changed`). La URL es la misma de siempre (`webhookCulqi?k=…`).
- Mismos candados que `cobrar`: interruptor del admin y bloqueo con `sk_test`.
- Verificar en modo prueba: nombre exacto de los campos de la orden y que `state` llegue como `paid`. Si algo difiere, solo se ajusta `functions/culqi.js`.

## Rifas: participar desde el servidor (`participarRifa`)

Antes la página escribía en `rayas_part` y descontaba créditos desde el navegador; como `costo` lo mandaba el cliente, se podía entrar con `costo = 0`. Ahora la función `participarRifa` lee el precio real en `rayas/estado`, valida fecha, cupos y máximo por persona, y descuenta los créditos en una transacción.

Orden para publicar (importante):
1. Desplegar: `firebase deploy --only functions:rayas:participarRifa`
2. Unir la rama y publicar la web (app.js?v=77).
3. **Recién entonces** cambiar en Firestore → Reglas el bloque de `rayas_part` por:

```
match /rayas_part/{id} {
  allow read: if true;
  allow write: if isAdmin();
}
```

## Vender items: filtros como en Comprar

El inventario ahora devuelve tipo, héroe, ranura, rareza y calidad de cada item (salen de las etiquetas de Steam), y Vender items usa los mismos filtros que Comprar. Despliegue: `firebase deploy --only functions:rayas:inventario` (la misma función sirve a Rayas y a LitleJacob).

## Límite de consultas en `inventario`

La función `inventario` ahora cuenta las consultas en la colección `rayas_limites` (solo la usa el servidor; las reglas la bloquean para clientes): 12 cada 10 min por conexión y 6 cada 10 min por inventario. Al pasarse responde 429. Despliegue: `firebase deploy --only functions:rayas:inventario`. No hace falta tocar las reglas ni las páginas.

## Precio de Steam bajo cada item + reponer stock al importar

- Cada item muestra bajo su precio `Steam: S/ …` (precio del Mercado de Steam en US$ × tipo de cambio `COM.tc` de `app.js`, hoy 3.85) y una flecha que abre `steamcommunity.com/market/listings/570/<nombre>`. Se guarda en `rayas_items` como `steamUsd` y `steamAct`.
- Nueva función **`preciosSteam`** (solo admin): `firebase deploy --only functions:rayas:preciosSteam`. El botón **↻ Precios de Steam** del modo admin actualiza los items visibles (los que llevan más de 6 h sin actualizar). Steam limita ~20 consultas/min; si pide esperar, se avisa y se sigue después.
- Importar desde el trade link ya **no borra ni reemplaza**: los items que ya están (mismo nombre y mismas gemas) solo reciben el stock nuevo (campo `stock`, sin tocar precio ni descripción); las subidas de stock vienen marcadas y las bajas sin marcar. Distintas gemas = tarjeta aparte.

## Precios de Steam desde tu PC (sin bloqueos)

`herramientas/precios-steam.bat` (doble clic, necesita Node) lee tu catálogo, consulta el Mercado de Steam con la conexión de tu casa (una consulta cada 3,5 s; si Steam pide esperar, pausa 90 s) y deja la lista `Nombre = precio US$` en `herramientas/precios-steam.txt` y en el portapapeles. En la página: modo admin → Comprar items → **📋 Pegar precios de Steam** → pegar → Guardar. No requiere desplegar funciones.
