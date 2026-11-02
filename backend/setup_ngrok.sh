#!/usr/bin/env bash
# SensorHub - remote access through an ngrok tunnel.
#
# The backend serves the built site (out/), /api and /ws on one port, and an
# ngrok service publishes that port at your ngrok domain over HTTPS.
#
# Needs: setup.sh already run, backend/.env.auth with a seeded admin, out/ built
# and copied to the Pi, internet on the Pi (ethernet), and a free ngrok account
# with its authtoken and static domain (dashboard.ngrok.com -> Domains).
# Safe to re-run.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)/out"
CONFIG_JSON="${SCRIPT_DIR}/config.json"
ENV_AUTH="${SCRIPT_DIR}/.env.auth"
SERVICE_NAME="sensorhub"
NGROK_SERVICE_NAME="sensorhub-ngrok"

fail() { echo -e "${RED}$1${NC}"; exit 1; }

[ -f "${WEB_DIR}/index.html" ] || fail "No site at ${WEB_DIR}. Run 'pnpm build' on your laptop and rsync out/ to the Pi first (see README)."
[ -f "$CONFIG_JSON" ] || fail "No ${CONFIG_JSON}. Run setup.sh first."
[ -f "$ENV_AUTH" ] || fail "No ${ENV_AUTH}. Follow docs/security/README.md to create it and seed the admin first."

# 1. Install the ngrok agent (official apt repository)
echo -e "${BOLD}[1/5] ngrok agent${NC}"
if ! command -v ngrok &>/dev/null; then
    curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc > /dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y ngrok
fi
NGROK_BIN="$(command -v ngrok)" || fail "ngrok failed to install."
echo -e "${GREEN}$(ngrok version)${NC}"

# 2. Authtoken (stored by ngrok in ~/.config/ngrok/ngrok.yml)
echo -e "${BOLD}[2/5] ngrok account${NC}"
echo "Authtoken: dashboard.ngrok.com -> Your Authtoken."
read -rsp "Paste your authtoken (leave blank to keep the one already saved): " NGROK_TOKEN
echo ""
if [ -n "$NGROK_TOKEN" ]; then
    ngrok config add-authtoken "$NGROK_TOKEN" > /dev/null
fi
unset NGROK_TOKEN
ngrok config check > /dev/null || fail "ngrok config is invalid. Re-run and paste your authtoken."

# 3. Domain
echo -e "${BOLD}[3/5] Domain${NC}"
echo "Your free static domain: dashboard.ngrok.com -> Domains (looks like something.ngrok-free.app)."
read -rp "Domain: " NGROK_DOMAIN
NGROK_DOMAIN="${NGROK_DOMAIN#https://}"
NGROK_DOMAIN="${NGROK_DOMAIN%%/*}"
[[ "$NGROK_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || fail "That doesn't look like a domain."
SITE_ORIGIN="https://${NGROK_DOMAIN}"

# 4. Backend: serve out/, trust ngrok's forwarded client IP, allow the new origin
echo -e "${BOLD}[4/5] Backend settings${NC}"
SERVER_PORT="$(python3 - "$CONFIG_JSON" "$WEB_DIR" << 'PY'
import json, sys
path, web_dir = sys.argv[1], sys.argv[2]
with open(path) as f:
    cfg = json.load(f)
cfg["web_dir"] = web_dir
cfg["trust_proxy"] = True
with open(path, "w") as f:
    json.dump(cfg, f, indent=4)
    f.write("\n")
print(cfg.get("server_port", 8765))
PY
)"

# .env.auth holds the signing key: edit in place, keep it 0600.
python3 - "$ENV_AUTH" "$SITE_ORIGIN" << 'PY'
import os, sys
path, origin = sys.argv[1], sys.argv[2]
with open(path) as f:
    lines = f.read().splitlines()
for i, line in enumerate(lines):
    if line.startswith("AUTH_ORIGINS="):
        origins = [o.strip() for o in line.split("=", 1)[1].split(",") if o.strip()]
        if origin not in origins:
            origins.append(origin)
        lines[i] = "AUTH_ORIGINS=" + ",".join(origins)
        break
else:
    lines.append("AUTH_ORIGINS=" + origin)
fd = os.open(path, os.O_WRONLY | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("\n".join(lines) + "\n")
os.chmod(path, 0o600)
PY
echo -e "Serving ${GREEN}${WEB_DIR}${NC} from the backend on port ${SERVER_PORT}; allowed origin ${GREEN}${SITE_ORIGIN}${NC}."

# 5. ngrok service
echo -e "${BOLD}[5/5] Creating ${NGROK_SERVICE_NAME} service${NC}"
sudo tee "/etc/systemd/system/${NGROK_SERVICE_NAME}.service" > /dev/null << SVC
[Unit]
Description=SensorHub ngrok tunnel (${SITE_ORIGIN})
After=network-online.target ${SERVICE_NAME}.service
Wants=network-online.target

[Service]
Type=simple
User=$(whoami)
ExecStart=${NGROK_BIN} http --url=${SITE_ORIGIN} http://127.0.0.1:${SERVER_PORT} --log=stdout
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl enable "$NGROK_SERVICE_NAME"
sudo systemctl restart "$NGROK_SERVICE_NAME"

sleep 3
echo ""
if curl -fsS "http://127.0.0.1:${SERVER_PORT}/" -o /dev/null; then
    echo -e "Backend serving the site: ${GREEN}yes${NC}"
else
    echo -e "Backend serving the site: ${YELLOW}not yet (journalctl -u ${SERVICE_NAME} -f)${NC}"
fi
if systemctl is-active --quiet "$NGROK_SERVICE_NAME"; then
    echo -e "Tunnel: ${GREEN}running${NC}"
else
    echo -e "Tunnel: ${YELLOW}not running (journalctl -u ${NGROK_SERVICE_NAME} -f)${NC}"
fi
echo ""
echo -e "  ${BOLD}Site:${NC} ${SITE_ORIGIN}"
echo "  The free plan shows an ngrok warning page on the first visit; click Visit Site."
echo "  Then sign in, open Settings and turn Demo Mode off to see the real tumbler."
echo ""
echo "  journalctl -u ${NGROK_SERVICE_NAME} -f"
echo "  sudo systemctl stop ${NGROK_SERVICE_NAME}      # take the site offline"
