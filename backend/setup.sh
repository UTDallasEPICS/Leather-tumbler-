#this is a edit of a setup script template i got on the internet to setup the py
#with a server bacekend

#!/usr/bin/env bash
# SensorHub — Raspberry Pi 5 Setup Script
# Installs dependencies, configures 1-Wire with like config stuff, sets up Shelly ip if we got it in time, creates systemd service just for it to work on in the background.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="sensorhub"
CONFIG_FILE="/boot/firmware/config.txt"
#cool asci stuff for the terminal :)
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════╗"
echo "║     SensorHub — Pi 5 Setup          ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# --------------------------------------------------
# 1. System update
# --------------------------------------------------
echo -e "${BOLD}[1/8] Updating system packages...${NC}"
sudo apt-get update -y
sudo apt-get upgrade -y

# --------------------------------------------------
# 2. Install Python + tools
# --------------------------------------------------
echo -e "${BOLD}[2/8] Installing Python 3 and tools...${NC}"
sudo apt-get install -y python3 python3-pip python3-venv curl

# --------------------------------------------------
# 3. Ask GPIO pin for DS18B20
# --------------------------------------------------
echo ""
echo -e "${BOLD}[3/8] DS18B20 Temperature Sensor Configuration${NC}"
echo "The DS18B20 DATA wire can be connected to various GPIO pins."
echo "Common choices: GPIO4 (pin 7), GPIO17 (pin 11), GPIO27 (pin 13)"
echo ""
read -rp "Which GPIO number is your DS18B20 DATA wire connected to? [default: 4]: " GPIO_PIN
GPIO_PIN=${GPIO_PIN:-4}

# Validate numeric
if ! [[ "$GPIO_PIN" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}Error: GPIO pin must be a number.${NC}"
    exit 1
fi

echo -e "Using GPIO ${GREEN}${GPIO_PIN}${NC}"

# --------------------------------------------------
# 4. Enable 1-Wire overlay
# --------------------------------------------------
echo -e "${BOLD}[4/8] Configuring 1-Wire overlay...${NC}"
OVERLAY_LINE="dtoverlay=w1-gpio,gpiopin=${GPIO_PIN}"

if grep -q "dtoverlay=w1-gpio" "$CONFIG_FILE" 2>/dev/null; then
    echo "Updating existing w1-gpio overlay in ${CONFIG_FILE}..."
    sudo sed -i "s|dtoverlay=w1-gpio.*|${OVERLAY_LINE}|" "$CONFIG_FILE"
else
    echo "Adding w1-gpio overlay to ${CONFIG_FILE}..."
    echo "$OVERLAY_LINE" | sudo tee -a "$CONFIG_FILE" > /dev/null
fi
echo -e "${GREEN}1-Wire overlay set: ${OVERLAY_LINE}${NC}"

# Load the module now (may not work until reboot on Pi 5)
sudo modprobe w1-gpio 2>/dev/null || true
sudo modprobe w1-therm 2>/dev/null || true

# --------------------------------------------------
# 5. Ask Shelly Pro 2 IP
# --------------------------------------------------
echo ""
echo -e "${BOLD}[5/8] Shelly Pro 2 Relay Configuration${NC}"
read -rp "Shelly Pro 2 IP address (e.g. 192.168.1.100): " SHELLY_IP

if [ -z "$SHELLY_IP" ]; then
    echo -e "${YELLOW}No Shelly IP provided — relay will run in mock mode.${NC}"
fi

# --------------------------------------------------
# 6. Ask server port
# --------------------------------------------------
echo ""
read -rp "WebSocket server port [default: 8765]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-8765}

# --------------------------------------------------
# 7. Write config.json + set up Python venv
# --------------------------------------------------
echo -e "${BOLD}[6/8] Writing config and installing Python dependencies...${NC}"

cat > "${SCRIPT_DIR}/config.json" << CONF
{
    "gpio_pin": ${GPIO_PIN},
    "shelly_ip": "${SHELLY_IP}",
    "server_port": ${SERVER_PORT},
    "server_host": "0.0.0.0",
    "mock": false
}
CONF
echo -e "Config saved to ${GREEN}${SCRIPT_DIR}/config.json${NC}"

#wayy too long to figure thie venc pythong stuff

# Python virtual environment
python3 -m venv "${SCRIPT_DIR}/venv"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/venv/bin/activate"
pip install --upgrade pip
pip install -r "${SCRIPT_DIR}/requirements.txt"
deactivate

# --------------------------------------------------
# 8. Test sensor
# --------------------------------------------------
echo ""
echo -e "${BOLD}[7/8] Testing hardware...${NC}"

echo -n "DS18B20 sensor: "
if ls /sys/bus/w1/devices/28-* 1>/dev/null 2>&1; then
    SENSOR_PATH=$(ls -d /sys/bus/w1/devices/28-* | head -1)
    READING=$(cat "${SENSOR_PATH}/w1_slave" 2>/dev/null || echo "")
    if echo "$READING" | grep -q "YES"; then
        TEMP_RAW=$(echo "$READING" | grep -o "t=[0-9-]*" | cut -d= -f2)
        TEMP_C=$(echo "scale=2; ${TEMP_RAW}/1000" | bc 2>/dev/null || echo "?")
        echo -e "${GREEN}Detected! Current reading: ${TEMP_C}°C${NC}"
    else
        echo -e "${YELLOW}Detected but CRC check failed. Check wiring.${NC}"
    fi
else
    echo -e "${YELLOW}Not found. A reboot may be needed for the dtoverlay to take effect.${NC}"
fi

# Test Shelly
echo -n "Shelly Pro 2: "
if [ -n "$SHELLY_IP" ]; then
    if curl -s --connect-timeout 3 "http://${SHELLY_IP}/rpc/Shelly.GetDeviceInfo" | python3 -m json.tool > /dev/null 2>&1; then
        MODEL=$(curl -s --connect-timeout 3 "http://${SHELLY_IP}/rpc/Shelly.GetDeviceInfo" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','Unknown'))" 2>/dev/null || echo "Unknown")
        echo -e "${GREEN}Reachable! Model: ${MODEL}${NC}"
    else
        echo -e "${YELLOW}Could not reach Shelly at ${SHELLY_IP}. Check IP and network.${NC}"
    fi
else
    echo -e "${YELLOW}Skipped (no IP configured).${NC}"
fi

# --------------------------------------------------
# 9. Create systemd service
# --------------------------------------------------
echo ""
echo -e "${BOLD}[8/8] Setting up systemd service...${NC}"

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

echo -e "${GREEN}Service '${SERVICE_NAME}' enabled and started.${NC}"

# --------------------------------------------------
# Summary stuff good job we did it
# --------------------------------------------------
PI_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         Setup Complete!              ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
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
echo ""
echo -e "  ${BOLD}In the phone app:${NC}"
echo -e "    Go to Connection settings and enter: ${GREEN}${PI_IP}${NC}"
echo ""
if ! ls /sys/bus/w1/devices/28-* 1>/dev/null 2>&1; then
    echo -e "  ${YELLOW}⚠ Sensor not detected. Reboot to apply 1-Wire overlay:${NC}"
    echo "    sudo reboot"
    echo ""
fi
