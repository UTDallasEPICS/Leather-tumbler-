#!/usr/bin/env bash
# SensorHub — Raspberry Pi 5 Setup Script
# Installs dependencies, configures 1-Wire, sets up Shelly, creates systemd service.
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

#cool asci proud of this :)
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════╗"
echo "║     SensorHub — Pi 5 Setup          ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# --------------------------------------------------
# 0. Clean up previous installation (safe for re-runs)
# --------------------------------------------------
if systemctl list-unit-files | grep -q "sensorhub.service"; then
    echo -e "${YELLOW}Previous SensorHub installation detected. Cleaning up...${NC}"
    sudo systemctl stop sensorhub 2>/dev/null || true
    sudo systemctl stop sensorhub-pwa 2>/dev/null || true
    sudo systemctl disable sensorhub 2>/dev/null || true
    sudo systemctl disable sensorhub-pwa 2>/dev/null || true
    sudo rm -f /etc/systemd/system/sensorhub.service
    sudo rm -f /etc/systemd/system/sensorhub-pwa.service
    sudo systemctl daemon-reload
    echo -e "${GREEN}Old services stopped and removed.${NC}"
    echo ""
fi

# --------------------------------------------------
# 1. System update
# --------------------------------------------------
echo -e "${BOLD}[1/9] Updating system packages...${NC}"
sudo apt-get update -y
sudo apt-get upgrade -y

# --------------------------------------------------
# 2. Install Python + tools
# --------------------------------------------------
echo -e "${BOLD}[2/9] Installing Python 3 and tools...${NC}"
sudo apt-get install -y python3 python3-pip python3-venv curl i2c-tools python3-smbus

# --------------------------------------------------
# 3. Ask GPIO pin for DS18B20
# --------------------------------------------------
echo ""
echo -e "${BOLD}[3/9] DS18B20 Temperature Sensor Configuration${NC}"
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
echo -e "${BOLD}[4/9] Configuring 1-Wire overlay...${NC}"
OVERLAY_LINE="dtoverlay=w1-gpio,gpiopin=${GPIO_PIN}"

if grep -q "dtoverlay=w1-gpio" "$CONFIG_FILE" 2>/dev/null; then
    echo "Updating existing w1-gpio overlay in ${CONFIG_FILE}..."
    sudo sed -i "s|dtoverlay=w1-gpio.*|${OVERLAY_LINE}|" "$CONFIG_FILE"
else
    echo "Adding w1-gpio overlay to ${CONFIG_FILE}..."
    echo "$OVERLAY_LINE" | sudo tee -a "$CONFIG_FILE" > /dev/null
fi
echo -e "${GREEN}1-Wire overlay set: ${OVERLAY_LINE}${NC}"

# Enable I2C for ADS1115 pH sensor
if ! grep -q "dtparam=i2c_arm=on" "$CONFIG_FILE" 2>/dev/null; then
    echo "dtparam=i2c_arm=on" | sudo tee -a "$CONFIG_FILE" > /dev/null
    echo -e "${GREEN}I2C enabled in ${CONFIG_FILE}${NC}"
else
    echo "I2C already enabled."
fi

# Add user to i2c group for non-root I2C access (needed by the systemd service)
if ! groups | grep -qw i2c; then
    sudo usermod -aG i2c "$(whoami)"
    echo -e "${GREEN}Added $(whoami) to i2c group${NC}"
    echo -e "${YELLOW}Note: Re-login or reboot needed for group change to take effect.${NC}"
else
    echo "User already in i2c group."
fi

# Load the module now (may not work until reboot on Pi 5)
sudo modprobe w1-gpio 2>/dev/null || true
sudo modprobe w1-therm 2>/dev/null || true

# --------------------------------------------------
# 5. Ask Shelly Pro 2 IP
# --------------------------------------------------
echo ""
echo -e "${BOLD}[5/9] Shelly Pro 2 Relay Configuration${NC}"
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
echo -e "${BOLD}[6/9] Writing config and installing Python dependencies...${NC}"

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
echo -e "${BOLD}[7/9] Testing hardware...${NC}"

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

# Test pH sensor (Atlas Scientific analog board via ADS1115 ADC)
echo -n "ADS1115 ADC (pH sensor): "
ADS_FOUND=$(sudo i2cdetect -y 1 2>/dev/null | grep -cw "48" || true)
if [ "$ADS_FOUND" -gt 0 ]; then
    echo -e "${GREEN}Detected at address 0x48!${NC}"
    # Try to read a voltage and convert to pH using the venv (no sudo — matches runtime)
    PH_VAL=$("${SCRIPT_DIR}/venv/bin/python3" -c "
import board, busio
import adafruit_ads1x15.ads1115 as ADS
from adafruit_ads1x15.analog_in import AnalogIn
try:
    i2c = busio.I2C(board.SCL, board.SDA)
    ads = ADS.ADS1115(i2c, address=0x48)
    ads.gain = 1
    chan = AnalogIn(ads, 0)
    voltage = chan.voltage
    ph = 14.0 - (voltage / 3.0) * 14.0
    ph = max(0.0, min(14.0, ph))
    print(f'{ph:.2f}')
except Exception as e:
    print('ERR')
" 2>/dev/null || echo "ERR")
    if [ "$PH_VAL" != "ERR" ]; then
        echo -e "  Voltage → pH reading: ${GREEN}${PH_VAL}${NC}"
    else
        echo -e "  ${YELLOW}ADS1115 detected but could not read pH.${NC}"
        echo -e "  ${YELLOW}If you just added yourself to the i2c group, re-login or reboot first.${NC}"
        echo -e "  ${YELLOW}Otherwise check wiring to the analog board.${NC}"
    fi
else
    echo -e "${YELLOW}Not found at address 0x48. Run 'i2cdetect -y 1' to check.${NC}"
fi

# --------------------------------------------------
# 8. PWA static server setup
# --------------------------------------------------
echo ""
echo -e "${BOLD}[8/9] PWA Static Server Configuration${NC}"
echo "The PWA static files will be served directly from the repo's out/ folder."
echo ""
read -rp "PWA HTTP port [default: 8080]: " PWA_PORT
PWA_PORT=${PWA_PORT:-8080}

PWA_DIR="${SCRIPT_DIR}/../pwa"
echo -e "Serving from: ${GREEN}${PWA_DIR}${NC}"

PWA_SERVICE_NAME="sensorhub-pwa"
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

echo -e "${GREEN}PWA service created: ${PWA_SERVICE_FILE}${NC}"

# --------------------------------------------------
# 9. Create systemd service
# --------------------------------------------------
echo ""
echo -e "${BOLD}[9/9] Setting up systemd services...${NC}"

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
sudo systemctl enable "$PWA_SERVICE_NAME"
sudo systemctl start "$PWA_SERVICE_NAME"

echo -e "${GREEN}Service '${SERVICE_NAME}' enabled and started.${NC}"
echo -e "${GREEN}Service '${PWA_SERVICE_NAME}' enabled and started.${NC}"

# --------------------------------------------------
# 10. Optional Cloudflare Tunnel for internet demo
# --------------------------------------------------
echo ""
echo -e "${BOLD}[10] Cloudflare Tunnel (Optional)${NC}"
echo "A temporary Cloudflare tunnel lets you demo the PWA over the internet."
echo "This creates two tunnels: one for the PWA and one for the WebSocket server."
echo ""
read -rp "Set up a temporary Cloudflare tunnel? [y/N]: " SETUP_TUNNEL

if [[ "$SETUP_TUNNEL" =~ ^[Yy]$ ]]; then
    # Install cloudflared if not present
    if ! command -v cloudflared &>/dev/null; then
        echo "Installing cloudflared..."
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o /tmp/cloudflared.deb
        sudo dpkg -i /tmp/cloudflared.deb
        rm -f /tmp/cloudflared.deb
    fi

    echo ""
    echo -e "${CYAN}Starting tunnels...${NC}"
    echo "This may take a moment."
    echo ""

    # Start PWA tunnel in background, capture URL
    cloudflared tunnel --url "http://localhost:${PWA_PORT}" --no-autoupdate 2>&1 | tee /tmp/cf-pwa.log &
    CF_PWA_PID=$!

    # Start WebSocket tunnel in background, capture URL
    cloudflared tunnel --url "http://localhost:${SERVER_PORT}" --no-autoupdate 2>&1 | tee /tmp/cf-ws.log &
    CF_WS_PID=$!

    # Wait for tunnel URLs to appear (up to 15 seconds)
    echo "Waiting for tunnel URLs..."
    for i in $(seq 1 30); do
        sleep 0.5
        CF_PWA_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-pwa.log 2>/dev/null | head -1)
        CF_WS_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-ws.log 2>/dev/null | head -1)
        if [ -n "$CF_PWA_URL" ] && [ -n "$CF_WS_URL" ]; then
            break
        fi
    done

    if [ -n "$CF_PWA_URL" ] && [ -n "$CF_WS_URL" ]; then
        # Extract just the hostname from the WS tunnel URL
        CF_WS_HOST=$(echo "$CF_WS_URL" | sed 's|https://||')

        # Write tunnel config so the PWA auto-connects to the WS tunnel
        cat > "${PWA_DIR}/tunnel-config.json" << TCONF
{"wsUrl":"wss://${CF_WS_HOST}"}
TCONF
        echo -e "${GREEN}Wrote tunnel-config.json to PWA directory${NC}"

        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║     Cloudflare Tunnels Active!       ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  ${BOLD}Share this link — it just works:${NC}"
        echo -e "    ${CYAN}${CF_PWA_URL}${NC}"
        echo ""
        echo -e "  Live sensor data connects automatically (no config needed)."
        echo ""
        echo -e "  ${YELLOW}Tunnels are temporary and will close when you stop this script (Ctrl+C).${NC}"
        echo -e "  PIDs: PWA=${CF_PWA_PID}, WS=${CF_WS_PID}"
        echo ""

        # Trap to cleanup tunnel processes on exit
        trap "kill $CF_PWA_PID $CF_WS_PID 2>/dev/null; echo 'Tunnels closed.'" EXIT
    else
        echo -e "${RED}Failed to get tunnel URLs. Check your internet connection.${NC}"
        kill $CF_PWA_PID $CF_WS_PID 2>/dev/null
    fi
else
    echo -e "${YELLOW}Skipping Cloudflare tunnel setup.${NC}"
fi

# --------------------------------------------------
# Summary
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
echo -e "  ${BOLD}PWA:${NC}       http://${PI_IP}:${PWA_PORT}"
echo -e "  ${BOLD}PWA dir:${NC}   ${PWA_DIR}"
echo ""
echo -e "  ${BOLD}Update PWA (from dev machine, commit out/ then on Pi):${NC}"
echo -e "    ${CYAN}git pull${NC}  — pulls latest PWA build from the repo"
echo ""
echo -e "  ${BOLD}Service commands:${NC}"
echo "    sudo systemctl status ${SERVICE_NAME}"
echo "    sudo systemctl restart ${SERVICE_NAME}"
echo "    journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "    sudo systemctl status ${PWA_SERVICE_NAME}"
echo "    sudo systemctl restart ${PWA_SERVICE_NAME}"
echo "    journalctl -u ${PWA_SERVICE_NAME} -f"
echo ""
echo -e "  ${BOLD}Android app — Connection settings:${NC}"
echo -e "    Server IP: ${GREEN}${PI_IP}${NC}"
echo ""
if ! ls /sys/bus/w1/devices/28-* 1>/dev/null 2>&1; then
    echo -e "  ${YELLOW}⚠ Sensor not detected. Reboot to apply 1-Wire overlay:${NC}"
    echo "    sudo reboot"
    echo ""
fi
