#!/usr/bin/env bash
# Serve static SensorHub web assets from a local directory.
#
# Usage:
#   bash serve_pwa.sh [directory] [port]
#   bash serve_pwa.sh                 # defaults to ../pwa or ../out, port 8080

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_DIR="${SCRIPT_DIR}/../pwa"
if [ ! -d "$DEFAULT_DIR" ] && [ -d "${SCRIPT_DIR}/../out" ]; then
  DEFAULT_DIR="${SCRIPT_DIR}/../out"
fi

DIR="${1:-$DEFAULT_DIR}"
PORT="${2:-8080}"

if [ ! -d "$DIR" ]; then
  echo "Error: directory '$DIR' not found."
  echo "Build web assets first (npm run build) and copy/export them to that folder."
  exit 1
fi

echo "Serving SensorHub web app from: $DIR"
echo "URL: http://$(hostname -I | awk '{print $1}'):$PORT"
python3 -m http.server "$PORT" --directory "$DIR"
