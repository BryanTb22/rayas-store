# 🤖 Bot de Steam — Rayas Store + LitleJacob Store

Entrega por Steam los items que compran en **Comprar items** (las dos tiendas).

## Cómo funciona (modo prueba)
1. Un cliente compra un item → el pedido aparece en el panel admin → **Pedidos** (como siempre).
2. Cuando el pedido está en **💰 Por entregar**, ábrelo y toca **🤖 Enviar con el bot**.
3. El bot busca el item en el inventario de **bryanmax007**, le manda la oferta al trade link del cliente y la confirma solo con el autenticador.
4. Cuando el cliente acepta, el pedido pasa solo a **✅ Entregado**.
5. Si algo falla (no está el item, el cliente rechazó, trade link vencido…), el panel muestra el motivo y puedes **reintentar**.

**El bot nunca envía nada que no hayas aprobado tú.**

Estados que verás en el pedido: ⏳ en cola → 📤 enviando → 📨 oferta enviada → ✅ aceptada · ✖ fallida · ⏸ retenida · 🚫 cancelada.

## Vender skins (el cliente le vende items a la tienda) — v1.2
1. En la web (Vender skins) el cliente elige sus items y toca **Vender ahora**: el servidor congela los precios 30 min y le da un código **V-XXXXX**.
2. El cliente le manda un trade al bot con ese código en el mensaje.
3. El bot lo acepta **solo si**: el código existe y no venció, viene de la misma cuenta de Steam del trade link, trae **exactamente** esos items, el bot no entrega nada y el cliente tiene Steam Guard móvil. Si no, lo rechaza y la web le dice por qué.
4. Cuando Steam completa el trade, le suma el saldo **una sola vez** (venta → pagada). Todo queda en el registro del panel.
5. Trades sin código o que le piden items al bot **no se tocan**.
6. Cada hora sube la lista de precios del motor del bot LIS a `live/preciosCompra` (`PRECIOS_COMPRA_URL` en el .env).
- Piloto: en la página Vender skins → panel admin → **💰 Vender skins** se elige quién puede vender, los topes y el trade link del bot.
- Si pausas el bot desde el panel, tampoco acepta ventas (los trades esperan hasta que lo reanudes).

## Reglas importantes
- **No juegues ni inicies sesión con bryanmax007 en otro lado**: Steam cierra la sesión del bot (se reconecta solo en ~10 minutos).
- En esa cuenta deja **solo los items que vendes**: el bot puede enviar cualquier item de su inventario.
- El nombre del item en el catálogo debe ser **igual al nombre del Mercado de Steam** (como queda al importarlo del inventario).
- Si el cliente no tiene Steam Guard móvil, Steam retendría el item días: el bot no lo envía y te avisa.
- Las ofertas sin respuesta se cancelan solas a las 48 h (cámbialo con `VENCER_OFERTA_HORAS`).

## Instalación en el servidor de Oracle (una sola vez)
Necesitas 3 secretos que **nunca van a GitHub**:

| Secreto | De dónde sale |
|---|---|
| Contraseña de bryanmax007 | La sabes tú |
| `bot.maFile` | `E:\BRYAN\PROGRAMAS\BOT STEAM\maFiles\` (el archivo que termina en `.maFile`) |
| `firebase.json` | Consola de Firebase → ⚙ Configuración del proyecto → **Cuentas de servicio** → **Generar nueva clave privada** |

Pasos (en el servidor, por la terminal):
```bash
git clone https://github.com/BryanTb22/rayas-store.git ~/rayas-store
cd ~/rayas-store/bot-steam && bash instalar.sh
```
Luego sube los dos archivos a `/opt/bot-steam/secretos/` con esos nombres (`bot.maFile` y `firebase.json`), pon la contraseña en `/opt/bot-steam/.env` y enciéndelo:
```bash
sudo systemctl restart bot-steam
journalctl -u bot-steam -f      # ver lo que hace (Ctrl+C para salir)
```
Después de copiar el maFile al servidor, guarda una copia de respaldo en un USB y bórralo de la PC.

## Actualizar el bot
```bash
cd ~/rayas-store && git pull && cd bot-steam && bash instalar.sh
```

## Comandos útiles
- Ver si está prendido: `systemctl status bot-steam`
- Apagarlo: `sudo systemctl stop bot-steam`
- Prenderlo: `sudo systemctl start bot-steam`

## Datos que usa en Firebase
- `orders/{id}.bot` → `{ estado, motivo, ofertaId, assetids, aprobadoEn, enviadaEn, actualizado }`
- `bot_estado/steam` → latido cada minuto: `{ enLinea, ultimaVez, items, aviso, cuenta, version }`
