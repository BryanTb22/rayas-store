# Entrar con Steam — cómo dejarlo funcionando

**Estado:** el código ya está en las dos páginas, pero el botón **no funcionará hasta que despliegues las funciones nuevas** (paso 1).
No pude probarlo contra Steam de verdad desde aquí; solo probé la parte de la página y la lógica de validación con datos simulados.

## Qué hace
- Botón **Entrar con Steam** en "Entrar" y en "Crear cuenta" (Rayas y LitleJacob).
- Si ya tienes cuenta (correo o Google): en **Mi cuenta → Steam → Vincular mi Steam**. No pierdes saldo.
- Si entras con Steam por primera vez: se crea la cuenta y te pide **WhatsApp y trade link** (formulario "Completa tu perfil"). Hasta completarlo no puedes comprar ni participar.
- El administrador **no** puede entrar ni vincular con Steam (sigue con correo/Google).

## Pasos

### 1) Desplegar las funciones (2 funciones nuevas: `steamIniciar` y `steamCallback`)
En una computadora con Firebase CLI y con tu sesión (`firebase login`), dentro de la carpeta del repo `rayas-store`:

```
cd functions && npm install && node steamlogin.test.js && cd ..
firebase deploy --only functions:rayas
```
(`node steamlogin.test.js` debe decir "todo bien".)

### 2) Permiso para crear tokens
La función firma tokens de Firebase. Si en los registros (Logs) sale `iam.serviceAccounts.signBlob` o "Permission denied", en
Google Cloud → IAM → busca la cuenta de servicio con la que corre la función (normalmente `litlejacob-store@appspot.gserviceaccount.com` o la "Compute Engine default") → **Agregar rol: "Service Account Token Creator"** (Creador de tokens de cuenta de servicio) sobre sí misma. También se puede con:
```
gcloud iam service-accounts add-iam-policy-binding <CUENTA>@... --member="serviceAccount:<CUENTA>@..." --role="roles/iam.serviceAccountTokenCreator"
```

### 3) Cerrar las colecciones nuevas en Firestore
En Firestore → Reglas, `steam_nonces` y `steam_links` deben ser **solo del servidor** (el servidor ignora las reglas):
```
match /steam_nonces/{id} { allow read, write: if false; }
match /steam_links/{id}  { allow read, write: if false; }
```
(Si tus reglas ya niegan todo lo no listado, no hace falta agregar nada.)

### 4) Dominios
No hace falta agregar nada en Steam (OpenID no pide registro). Los dominios permitidos ya están en la lista `ORIGENES` de `functions/index.js` (rayas.trade, litlejacob.trade y sus www). Si en el futuro usas otro dominio, agrégalo ahí.

### 5) Fusionar los PR y Ctrl+F5
Rayas: rama `steam-login` (base `ajustes-finales`). LitleJacob: rama `steam-login` (base `lj-mejora-detalles`).

### Cómo probar (ya desplegado)
1. Abre la página → Entrar → **Entrar con Steam** → inicia sesión en Steam → vuelves a la página con la sesión iniciada.
2. Cuenta nueva: debe salir "Completa tu perfil".
3. Cuenta con correo: Mi cuenta → Vincular mi Steam → cierra sesión → entra con Steam y debe aparecer la misma cuenta con su saldo.

## Notas de seguridad
- La respuesta de Steam se **verifica con Steam** (`check_authentication`) antes de dar sesión; el enlace de retorno lleva un código de un solo uso que vence en 10 minutos.
- El token de sesión viaja solo en la dirección `#steamtoken=…` (con "#", nunca llega a servidores) y la página lo borra de inmediato.
- Una cuenta de Steam solo puede estar vinculada a una cuenta.
