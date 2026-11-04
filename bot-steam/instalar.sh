#!/usr/bin/env bash
# Instala o actualiza el bot de Steam en el servidor (Ubuntu en Oracle Cloud).
# Uso:  bash instalar.sh        (desde la carpeta bot-steam del repositorio rayas-store)
set -euo pipefail

DESTINO=/opt/bot-steam
ORIGEN="$(cd "$(dirname "$0")" && pwd)"

echo "== 1/5 Node.js =="
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "== 2/5 Copiando el bot a $DESTINO =="
sudo mkdir -p "$DESTINO/secretos"
sudo cp "$ORIGEN"/index.js "$ORIGEN"/util.js "$ORIGEN"/util.test.js "$ORIGEN"/package.json "$DESTINO"/
[ -f "$DESTINO/.env" ] || sudo cp "$ORIGEN/.env.example" "$DESTINO/.env"
sudo chown -R "$USER":"$USER" "$DESTINO"
chmod 700 "$DESTINO/secretos"; chmod 600 "$DESTINO/.env"

echo "== 3/5 Instalando librerías =="
cd "$DESTINO" && npm install --omit=dev && npm test

echo "== 4/5 Servicio para que arranque solo =="
sed "s/^User=.*/User=$USER/" "$ORIGEN/bot-steam.service" | sudo tee /etc/systemd/system/bot-steam.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable bot-steam >/dev/null

echo "== 5/5 Revisando secretos =="
FALTA=0
grep -q "pon_aqui" "$DESTINO/.env" && { echo "  ✖ Completa la contraseña en $DESTINO/.env"; FALTA=1; }
[ -f "$DESTINO/secretos/bot.maFile" ] || { echo "  ✖ Falta $DESTINO/secretos/bot.maFile"; FALTA=1; }
[ -f "$DESTINO/secretos/firebase.json" ] || { echo "  ✖ Falta $DESTINO/secretos/firebase.json"; FALTA=1; }
if [ "$FALTA" = 0 ]; then
  chmod 600 "$DESTINO"/secretos/*
  sudo systemctl restart bot-steam
  echo "✔ Bot encendido. Ver lo que hace:  journalctl -u bot-steam -f"
else
  echo "Cuando completes lo de arriba, enciéndelo con:  sudo systemctl restart bot-steam"
fi
