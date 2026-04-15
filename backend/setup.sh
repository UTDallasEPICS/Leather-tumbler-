#!/usr/bin/env bash
# SensorHub - Raspberry Pi setup script.
# Installs dependencies, configures hardware, creates services, and can
# optionally set up PWA serving and Cloudflare demo tunnels.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="sensorhub"
PWA_SERVICE_NAME="sensorhub-pwa"
CONFIG_FILE="/boot/firmware/config.txt"

echo -e "${BOLD}${CYAN}"
echo "======================================"
echo "        SensorHub Pi Setup"
echo "======================================"
echo -e "${NC}"

# --------------------------------------------------
# 0. Clean up previous installation (safe re-run)
# --------------------------------------------------
if systemctl list-unit-files | rg -q "sensorhub\.service|sensorhub-pwa\.service"; then
    echo -e "${YELLOW}Existing SensorHub services found. Cleaning up old service files...${NC}"
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    sudo systemctl stop "$PWA_SERVICE_NAME" 2>/dev/null || true
    sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    sudo systemctl disable "$PWA_SERVICE_NAME" 2>/dev/null || true
    sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    sudo rm -f "/etc/systemd/system/${PWA_SERVICE_NAME}.service"
    sudo systemctl daemon-reload
fi

# --------------------------------------------------
# 1. System update
# --------------------------------------------------
echo -e "${BOLD}[1/10] Updating system packages...${NC}"
sudo apt-get update -y
sudo apt-get upgrade -y

# --------------------------------------------------
# 2. Install Python + tools
# --------------------------------------------------
echo -e "${BOLD}[2/10] Installing dependencies...${NC}"
sudo apt-get install -y python3 python3-pip python3-venv curl i2c-tools python3-smbus

# --------------------------------------------------
# 3. Ask GPIO pin for DS18B20
# --------------------------------------------------
echo ""
echo -e "${BOLD}[3/10] DS18B20 configuration${NC}"
echo "Common choices: GPIO4 (pin 7), GPIO17 (pin 11), GPIO27 (pin 13)"
read -rp "GPIO number for DS18B20 data wire [default: 4]: " GPIO_PIN
GPIO_PIN=${GPIO_PIN:-4}

if ! [[ "$GPIO_PIN" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}Error: GPIO pin must be numeric.${NC}"
    exit 1
fi
echo -e "Using GPIO ${GREEN}${GPIO_PIN}${NC}"

# --------------------------------------------------
# 4. Enable 1-Wire and I2C
# --------------------------------------------------
echo -e "${BOLD}[4/10] Configuring 1-Wire and I2C...${NC}"
OVERLAY_LINE="dtoverlay=w1-gpio,gpiopin=${GPIO_PIN}"

if rg -q "dtoverlay=w1-gpio" "$CONFIG_FILE"; then
    sudo sed -i "s|dtoverlay=w1-gpio.*|${OVERLAY_LINE}|" "$CONFIG_FILE"
else
    echo "$OVERLAY_LINE" | sudo tee -a "$CONFIG_FILE" > /dev/null
fi

if ! rg -q "dtparam=i2c_arm=on" "$CONFIG_FILE"; then
    echo "dtparam=i2c_arm=on" | sudo tee -a "$CONFIG_FILE" > /dev/null
fi

if ! groups | rg -qw i2c; then
    sudo usermod -aG i2c "$(whoami)"
    echo -e "${YELLOW}Added $(whoami) to i2c group. Re-login/reboot required for group change.${NC}"
fi

sudo modprobe w1-gpio 2>/dev/null || true
sudo modprobe w1-therm 2>/dev/null || true

# --------------------------------------------------
# 5. Ask Shelly Pro 2 IP
# --------------------------------------------------
echo ""
echo -e "${BOLD}[5/10] Shelly Pro 2 configuration${NC}"
read -rp "Shelly Pro 2 IP address (leave blank for mock relay): " SHELLY_IP
if [ -z "$SHELLY_IP" ]; then
    echo -e "${YELLOW}No Shelly IP set - relay will run in mock mode.${NC}"
fi

# --------------------------------------------------
# 6. Ask server port
# --------------------------------------------------
echo ""
read -rp "WebSocket server port [default: 8765]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-8765}

# --------------------------------------------------
# 7. Write config + install python env
# --------------------------------------------------
echo -e "${BOLD}[6/10] Writing config and Python environment...${NC}"
cat > "${SCRIPT_DIR}/config.json" << CONF
{
    "gpio_pin": ${GPIO_PIN},
    "shelly_ip": "${SHELLY_IP}",
    "server_port": ${SERVER_PORT},
    "server_host": "0.0.0.0",
    "mock": false
}
CONF

python3 -m venv "${SCRIPT_DIR}/venv"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/venv/bin/activate"
pip install --upgrade pip
pip install -r "${SCRIPT_DIR}/requirements.txt"
deactivate

# --------------------------------------------------
# 8. Test hardware
# --------------------------------------------------
echo ""
echo -e "${BOLD}[7/10] Testing hardware...${NC}"

echo -n "DS18B20 sensor: "
if ls /sys/bus/w1/devices/28-* 1>/dev/null 2>&1; then
    SENSOR_PATH=$(ls -d /sys/bus/w1/devices/28-* | head -1)
    READING=$(cat "${SENSOR_PATH}/w1_slave" 2>/dev/null || echo "")
    if echo "$READING" | rg -q "YES"; then
        TEMP_RAW=$(echo "$READING" | rg -o "t=[0-9-]*" | cut -d= -f2)
        TEMP_C=$(echo "scale=2; ${TEMP_RAW}/1000" | bc 2>/dev/null || echo "?")
        echo -e "${GREEN}Detected (${TEMP_C} C)${NC}"
    else
        echo -e "${YELLOW}Detected but CRC check failed.${NC}"
    fi
else
    echo -e "${YELLOW}Not found (reboot may be required).${NC}"
fi

echo -n "Shelly Pro 2: "
if [ -n "$SHELLY_IP" ]; then
    if curl -s --connect-timeout 3 "http://${SHELLY_IP}/rpc/Shelly.GetDeviceInfo" | python3 -m json.tool > /dev/null 2>&1; then
        echo -e "${GREEN}Reachable${NC}"
    else
        echo -e "${YELLOW}Not reachable at ${SHELLY_IP}${NC}"
    fi
else
    echo -e "${YELLOW}Skipped${NC}"
fi

echo -n "ADS1115 (pH): "
ADS_FOUND=$(sudo i2cdetect -y 1 2>/dev/null | rg -cw "48" || true)
if [ "$ADS_FOUND" -gt 0 ]; then
    echo -e "${GREEN}Detected at 0x48${NC}"
else
    echo -e "${YELLOW}Not detected at 0x48${NC}"
fi

# --------------------------------------------------
# 9. Optional PWA service setup
# --------------------------------------------------
echo ""
echo -e "${BOLD}[8/10] Optional PWA static server${NC}"
PWA_ENABLED=0
read -rp "Enable local PWA static service (systemd)? [y/N]: " ENABLE_PWA
if [[ "$ENABLE_PWA" =~ ^[Yy]$ ]]; then
    DEFAULT_PWA_DIR="${SCRIPT_DIR}/../pwa"
    if [ ! -d "$DEFAULT_PWA_DIR" ] && [ -d "${SCRIPT_DIR}/../out" ]; then
        DEFAULT_PWA_DIR="${SCRIPT_DIR}/../out"
    fi

    read -rp "PWA directory [default: ${DEFAULT_PWA_DIR}]: " PWA_DIR_INPUT
    PWA_DIR="${PWA_DIR_INPUT:-$DEFAULT_PWA_DIR}"
    read -rp "PWA HTTP port [default: 8080]: " PWA_PORT
    PWA_PORT=${PWA_PORT:-8080}

    if [ -d "$PWA_DIR" ]; then
        PWA_SERVICE_FILE="/etc/systemd/system/${PWA_SERVICE_NAME}.service"
        sudo tee "$PWA_SERVICE_FILE" > /dev/null << PWASVC
[Unit]
Description=SensorHub PWA Static Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(whoami)
ExecStart=python3 -m http.server ${PWA_PORT} --directory ${PWA_DIR}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
PWASVC
        PWA_ENABLED=1
        echo -e "${GREEN}PWA service configured for ${PWA_DIR} on port ${PWA_PORT}.${NC}"
    else
        echo -e "${YELLOW}PWA directory not found (${PWA_DIR}). Skipping PWA service setup.${NC}"
    fi
fi

# --------------------------------------------------
# 10. Main websocket service
# --------------------------------------------------
echo ""
echo -e "${BOLD}[9/10] Creating SensorHub systemd service...${NC}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
sudo tee "$SERVICE_FILE" > /dev/null << SVC
[Unit]
Description=SensorHub WebSocket Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${SCRIPT_DIR}/venv/bin/python ${SCRIPT_DIR}/main.py --config ${SCRIPT_DIR}/config.json
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME"
if [ "$PWA_ENABLED" -eq 1 ]; then
    sudo systemctl enable "$PWA_SERVICE_NAME"
    sudo systemctl start "$PWA_SERVICE_NAME"
fi

# --------------------------------------------------
# 11. Optional Cloudflare tunnel helper
# --------------------------------------------------
echo ""
echo -e "${BOLD}[10/10] Optional Cloudflare tunnel helper${NC}"
if [ "$PWA_ENABLED" -eq 1 ]; then
    read -rp "Set up temporary Cloudflare tunnel commands now? [y/N]: " SETUP_TUNNEL
    if [[ "$SETUP_TUNNEL" =~ ^[Yy]$ ]]; then
        if ! command -v cloudflared &>/dev/null; then
            echo "Installing cloudflared..."
            curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb" -o /tmp/cloudflared.deb
            sudo dpkg -i /tmp/cloudflared.deb || true
            rm -f /tmp/cloudflared.deb
        fi

        if command -v cloudflared &>/dev/null; then
            echo -e "${GREEN}Cloudflared is installed.${NC}"
            echo "To run PWA tunnel:"
            echo "  cloudflared tunnel --url http://localhost:${PWA_PORT} --no-autoupdate"
            echo "To run backend tunnel:"
            echo "  cloudflared tunnel --url http://localhost:${SERVER_PORT} --no-autoupdate"
        else
            echo -e "${YELLOW}cloudflared installation failed. You can install it later and run tunnel commands manually.${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Skipped (PWA service not enabled).${NC}"
fi

# --------------------------------------------------
# Summary
# --------------------------------------------------
PI_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${CYAN}======================================${NC}"
echo -e "${BOLD}${CYAN}            Setup Complete           ${NC}"
echo -e "${BOLD}${CYAN}======================================${NC}"
echo ""
echo -e "  ${BOLD}Config:${NC}    ${SCRIPT_DIR}/config.json"
echo -e "  ${BOLD}GPIO Pin:${NC}  ${GPIO_PIN}"
echo -e "  ${BOLD}Shelly IP:${NC} ${SHELLY_IP:-none (mock mode)}"
echo -e "  ${BOLD}Server:${NC}    ws://${PI_IP}:${SERVER_PORT}"
echo ""
echo -e "  ${BOLD}Service commands:${NC}"
echo "    sudo systemctl status ${SERVICE_NAME}"
echo "    sudo systemctl restart ${SERVICE_NAME}"
echo "    journalctl -u ${SERVICE_NAME} -f"
if [ "$PWA_ENABLED" -eq 1 ]; then
    echo ""
    echo "    sudo systemctl status ${PWA_SERVICE_NAME}"
    echo "    sudo systemctl restart ${PWA_SERVICE_NAME}"
    echo "    journalctl -u ${PWA_SERVICE_NAME} -f"
    echo ""
    echo -e "  ${BOLD}PWA URL:${NC}    http://${PI_IP}:${PWA_PORT}"
fi
echo ""
echo -e "  ${BOLD}In the phone app:${NC}"
echo -e "    Connection IP: ${GREEN}${PI_IP}${NC}"
echo ""
if ! ls /sys/bus/w1/devices/28-* 1>/dev/null 2>&1; then
    echo -e "  ${YELLOW}Sensor not detected yet. Reboot may be required:${NC}"
    echo "    sudo reboot"
    echo ""
fi
