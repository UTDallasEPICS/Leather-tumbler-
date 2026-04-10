#!/usr/bin/env bash
# Serve the SensorHub PWA static files on the Raspberry Pi.
# Copy the contents of out/ to /var/www/sensorhub before running:
#   scp -r out/ pi@<pi-ip>:/var/www/sensorhub
#
# Usage:
#   bash serve_pwa.sh [directory] [port]
#   bash serve_pwa.sh                        # defaults: /var/www/sensorhub, port 8080
#   bash serve_pwa.sh /home/pi/pwa 3000

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-${SCRIPT_DIR}/../pwa}"
PORT="${2:-8080}"

if [ ! -d "$DIR" ]; then
  echo "Error: directory '$DIR' not found. Copy the PWA build first:"
  echo "  Run 'npm run build:pwa' and commit out/ to the repo, then git pull here."
  exit 1
fi

echo "Serving SensorHub PWA from $DIR on port $PORT"
echo "Access at http://$(hostname -I | awk '{print $1}'):$PORT"
python3 -m http.server "$PORT" --directory "$DIR"
