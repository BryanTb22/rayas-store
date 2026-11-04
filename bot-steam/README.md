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
