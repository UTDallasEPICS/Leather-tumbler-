#!/bin/bash
# Run this on the Raspberry Pi from /home/tumbler/tumbler-app/
# Usage: bash setup.sh

set -e

APP_DIR="/home/tumbler/tumbler-app"
WEB_DIR="$APP_DIR/web"

echo "==> Checking for Node.js..."
if ! command -v node &> /dev/null; then
  echo "==> Node.js not found. Installing via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
  echo "==> Node.js $(node -v) installed"
else
  echo "==> Node.js $(node -v) already installed"
fi

echo "==> Installing Python dependencies..."
pip install fastapi uvicorn --break-system-packages

echo "==> Installing Next.js dependencies..."
cd "$WEB_DIR"
npm install

echo "==> Building Next.js app..."
npm run build

# Standalone build needs static + public folders copied in manually
echo "==> Copying static assets for standalone build..."
cp -r "$WEB_DIR/.next/static" "$WEB_DIR/.next/standalone/.next/static"
if [ -d "$WEB_DIR/public" ]; then
  cp -r "$WEB_DIR/public" "$WEB_DIR/.next/standalone/public"
fi

echo "==> Installing service files..."
sudo cp "$APP_DIR/sensor-reader.service" /etc/systemd/system/sensor-reader.service
sudo cp "$APP_DIR/tumbler-api.service" /etc/systemd/system/tumbler-api.service
sudo cp "$APP_DIR/tumbler-web.service" /etc/systemd/system/tumbler-web.service

echo "==> Reloading systemd..."
sudo systemctl daemon-reload

echo "==> Enabling services..."
sudo systemctl enable sensor-reader tumbler-api tumbler-web

echo "==> Starting services..."
sudo systemctl start sensor-reader tumbler-api tumbler-web

echo ""
echo "✅ All done!"
echo ""
echo "   Sensor reader  →  journalctl -fu sensor-reader"
echo "   FastAPI        →  http://localhost:8000"
echo "   Next.js app    →  http://localhost:3000"
echo ""
PI_IP=$(hostname -I | awk '{print $1}')
echo "Access from your phone or computer on the same network:"
echo "   http://$PI_IP:3000"
