"""SensorHub WebSocket server.

Reads temperature sensor, stores in SQLite .db file, pushes live data to the app via WebSocket.
Accepts start/stop/reset commands from the phone app.

Usage:
    python main.py --mock          # development (simulated sensor)
    python main.py                 # production (real sensor on Pi)
    python main.py --port 9000     # custom port
    python main.py --config config.json  # load from config file
"""

import argparse
import asyncio
import json
import logging
import random
import re
from pathlib import Path
from datetime import datetime, timedelta

import httpx
import websockets

from db import (
    init_db,
    insert_reading,
    get_readings,
    insert_ph_reading,
    get_ph_readings,
    get_system_state,
    set_system_active,
    reset_cycles,
    clear_readings,
    set_recovery_phone,
    get_recovery_phone,
    create_otp,
    verify_and_consume_otp,
    cleanup_old_otps,
)
from sensor_reader import DS18B20Reader
from ph_reader import PhReader
from relay_controller import RelayController

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("sensorhub")

# All connected WebSocket clients
connected: set[websockets.ServerConnection] = set()
US_E164_PATTERN = re.compile(r"^\+1\d{10}$")
MX_E164_PATTERN = re.compile(r"^\+52\d{10}$")
LOCAL_10_PATTERN = re.compile(r"^\d{10}$")


def normalize_phone(phone: str) -> str:
    raw = (phone or "").strip()
    if not raw:
        return ""

    if raw.startswith("00"):
        raw = f"+{raw[2:]}"

    if raw.startswith("+"):
        digits = re.sub(r"\D", "", raw[1:])
        return f"+{digits}" if digits else ""

    digits_only = re.sub(r"\D", "", raw)
    if digits_only.startswith("1") and len(digits_only) == 11:
        return f"+{digits_only}"
    if digits_only.startswith("52") and len(digits_only) == 12:
        return f"+{digits_only}"
    return digits_only


def is_valid_phone(phone: str) -> bool:
    return bool(
        US_E164_PATTERN.match(phone)
        or MX_E164_PATTERN.match(phone)
        or LOCAL_10_PATTERN.match(phone)
    )


def phones_match(input_phone: str, registered_phone: str) -> bool:
    if input_phone == registered_phone:
        return True

    input_digits = re.sub(r"\D", "", input_phone)[-10:]
    registered_digits = re.sub(r"\D", "", registered_phone)[-10:]
    return bool(input_digits and registered_digits and input_digits == registered_digits)


class OtpService:
    def __init__(self, twilio_cfg: dict, otp_cfg: dict):
        self.sid = (twilio_cfg.get("account_sid") or "").strip()
        self.token = (twilio_cfg.get("auth_token") or "").strip()
        self.from_phone = (twilio_cfg.get("from_phone") or "").strip()
        self.code_ttl_seconds = int(twilio_cfg.get("otp_ttl_seconds", 300))
        self.code_length = int(twilio_cfg.get("otp_length", 6))
        self.mode = (otp_cfg.get("mode") or "mock").strip().lower()

    @property
    def use_mock_mode(self) -> bool:
        return self.mode != "twilio"

    @property
    def sms_enabled(self) -> bool:
        return (not self.use_mock_mode) and bool(self.sid and self.token and self.from_phone)

    async def send_otp_sms(self, phone: str, code: str) -> bool:
        if not self.sms_enabled:
            return False
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.sid}/Messages.json"
        body = f"DAVA PIN reset code: {code}. It expires in {self.code_ttl_seconds // 60} minutes."
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                data={"To": phone, "From": self.from_phone, "Body": body},
                auth=(self.sid, self.token),
            )
            response.raise_for_status()
            return True

    def generate_code(self) -> str:
        max_num = 10 ** self.code_length
        return str(random.randrange(max_num)).zfill(self.code_length)


def load_config(path: str | None) -> dict:
    """Load config from JSON file, returning empty dict if not found."""
    if path is None:
        return {}
    p = Path(path)
    if not p.exists():
        log.warning("Config file not found: %s", path)
        return {}
    with open(p) as f:
        return json.load(f)


async def broadcast(message: dict) -> None:
    """Send a JSON message to all connected apps."""
    if connected:
        data = json.dumps(message)
        websockets.broadcast(connected, data)


async def send_ws_response(ws, request_id: str | None, msg_type: str, payload: dict) -> None:
    await ws.send(json.dumps({"type": msg_type, "requestId": request_id, **payload}))


async def handle_message(ws, data: dict, db, relay, otp_service: OtpService) -> None:
    """Process an incoming message from a app."""
    msg_type = data.get("type")
    request_id = data.get("requestId")

    if msg_type == "start":
        success = await relay.start()
        await set_system_active(db, True)
        state = await get_system_state(db)
        await broadcast({"type": "system_state", **state})
        await ws.send(json.dumps({
            "type": "relay_ack", "action": "start", "success": success,
        }))
        log.info("System started")

    elif msg_type == "stop":
        success = await relay.stop()
        await set_system_active(db, False)
        state = await get_system_state(db)
        await broadcast({"type": "system_state", **state})
        await ws.send(json.dumps({
            "type": "relay_ack", "action": "stop", "success": success,
        }))
        log.info("System stopped")

    elif msg_type == "get_history":
        limit = min(max(int(data.get("limit", 100)), 1), 1000)
        readings = await get_readings(db, limit)
        await ws.send(json.dumps({"type": "history", "readings": readings}))
        ph_readings = await get_ph_readings(db, limit)
        await ws.send(json.dumps({"type": "ph_history", "readings": ph_readings}))

    elif msg_type == "reset_cycles":
        await reset_cycles(db)
        state = await get_system_state(db)
        await broadcast({"type": "system_state", **state})
        await ws.send(json.dumps({
            "type": "relay_ack", "action": "reset_cycles", "success": True,
        }))
        log.info("Cycles reset")

    elif msg_type == "clear_logs":
        await clear_readings(db)
        await ws.send(json.dumps({
            "type": "relay_ack", "action": "clear_logs", "success": True,
        }))
        log.info("Readings cleared")

    elif msg_type == "get_relay_status":
        relay_status = await relay.get_status()
        await ws.send(json.dumps({
            "type": "relay_status", **relay_status,
        }))

    elif msg_type == "get_recovery_phone":
        phone = await get_recovery_phone(db)
        await send_ws_response(ws, request_id, "get_recovery_phone_response", {
            "success": True,
            "phone": phone,
        })

    elif msg_type == "register_recovery_phone":
        phone = normalize_phone(data.get("phone", ""))
        if not is_valid_phone(phone):
            await send_ws_response(ws, request_id, "register_recovery_phone_response", {
                "success": False,
                "message": "Invalid phone number format. Use country code, e.g. +15551234567.",
            })
            return

        await set_recovery_phone(db, phone)
        await send_ws_response(ws, request_id, "register_recovery_phone_response", {
            "success": True,
            "message": "Recovery phone registered.",
            "phone": phone,
        })

    elif msg_type == "request_pin_reset_otp":
        phone = normalize_phone(data.get("phone", ""))
        if not is_valid_phone(phone):
            await send_ws_response(ws, request_id, "request_pin_reset_otp_response", {
                "success": False,
                "message": "Invalid phone number.",
            })
            return

        registered_phone = await get_recovery_phone(db)
        if not registered_phone:
            await send_ws_response(ws, request_id, "request_pin_reset_otp_response", {
                "success": False,
                "message": "No recovery phone registered. Set it in Account first.",
            })
            return

        if not phones_match(phone, registered_phone):
            await send_ws_response(ws, request_id, "request_pin_reset_otp_response", {
                "success": False,
                "message": "Phone number is not registered.",
            })
            return

        code = otp_service.generate_code()
        expires_at = (datetime.now() + timedelta(seconds=otp_service.code_ttl_seconds)).isoformat(timespec="seconds")
        await create_otp(db, phone, code, expires_at)
        await cleanup_old_otps(db, datetime.now().isoformat(timespec="seconds"))

        debug_code = None
        delivery = "sms"
        if otp_service.use_mock_mode:
            delivery = "mock"
            debug_code = code
        else:
            try:
                sent = await otp_service.send_otp_sms(phone, code)
                if not sent:
                    await send_ws_response(ws, request_id, "request_pin_reset_otp_response", {
                        "success": False,
                        "message": "Twilio mode is enabled but credentials are missing.",
                    })
                    return
            except Exception:
                log.exception("Failed to send OTP SMS")
                await send_ws_response(ws, request_id, "request_pin_reset_otp_response", {
                    "success": False,
                    "message": "Failed to send OTP SMS. Check SMS provider config.",
                })
                return

        if delivery == "mock":
            log.warning("OTP SMS provider not configured. Mock OTP for %s is %s", phone, code)

        await send_ws_response(ws, request_id, "request_pin_reset_otp_response", {
            "success": True,
            "message": "OTP sent.",
            "delivery": delivery,
            "debugCode": debug_code,
        })

    elif msg_type == "verify_pin_reset_otp":
        phone = normalize_phone(data.get("phone", ""))
        otp_code = str(data.get("otp", "")).strip()
        if not phone or not otp_code:
            await send_ws_response(ws, request_id, "verify_pin_reset_otp_response", {
                "success": False,
                "message": "Phone and OTP are required.",
            })
            return

        ok = await verify_and_consume_otp(
            db,
            phone,
            otp_code,
            datetime.now().isoformat(timespec="seconds"),
        )
        await send_ws_response(ws, request_id, "verify_pin_reset_otp_response", {
            "success": ok,
            "message": "OTP verified." if ok else "Invalid or expired OTP.",
        })

    else:
        await ws.send(json.dumps({
            "type": "error", "message": f"Unknown message type: {msg_type}",
        }))


async def handler(ws, db, relay, otp_service: OtpService):
    """Handle a single WebSocket client connection."""
    connected.add(ws)
    log.info("Client connected (%d total)", len(connected))

    try:
        # Send current state on connect
        state = await get_system_state(db)
        await ws.send(json.dumps({"type": "system_state", **state}))

        # Send recent history on connect
        readings = await get_readings(db, limit=100)
        await ws.send(json.dumps({"type": "history", "readings": readings}))
        ph_readings = await get_ph_readings(db, limit=100)
        await ws.send(json.dumps({"type": "ph_history", "readings": ph_readings}))

        # Listen for client messages
        async for raw in ws:
            try:
                data = json.loads(raw)
                await handle_message(ws, data, db, relay, otp_service)
            except json.JSONDecodeError:
                await ws.send(json.dumps({
                    "type": "error", "message": "Invalid JSON",
                }))
    finally:
        connected.discard(ws)
        log.info("Client disconnected (%d remaining)", len(connected))


async def sensor_loop(db, sensor: DS18B20Reader, ph_sensor: PhReader) -> None:
    """Continuously read sensors and broadcast when system is active."""
    while True:
        try:
            state = await get_system_state(db)
            if state["active"]:
                temp = sensor.read_temperature()
                if temp is not None:
                    reading = await insert_reading(db, temp)
                    await broadcast({
                        "type": "temperature",
                        "id": reading["id"],
                        "value": reading["temperature"],
                        "timestamp": reading["timestamp"],
                    })

                try:
                    ph = await asyncio.wait_for(asyncio.to_thread(ph_sensor.read_ph), timeout=2.0)
                except asyncio.TimeoutError:
                    log.warning("pH read timed out")
                    ph = None
                except Exception:
                    log.exception("pH sensor read failed")
                    ph = None

                if ph is not None:
                    try:
                        ph_reading = await insert_ph_reading(db, ph)
                        await broadcast({
                            "type": "ph",
                            "id": ph_reading["id"],
                            "value": ph_reading["ph"],
                            "timestamp": ph_reading["timestamp"],
                        })
                    except Exception:
                        log.exception("pH insert/broadcast failed")
        except Exception:
            log.exception("Error in sensor loop")

        await asyncio.sleep(1)


async def main(args) -> None:
    """Start the WebSocket server and sensor reading loop."""
    # Load config file, CLI args override
    cfg = load_config(args.config)

    host = args.host or cfg.get("server_host", "0.0.0.0")
    port = args.port or cfg.get("server_port", 8765)
    mock = args.mock or cfg.get("mock", False)
    shelly_ip = args.shelly_ip or cfg.get("shelly_ip", "") or None
    gpio_pin = cfg.get("gpio_pin", 4)
    twilio_cfg = cfg.get("twilio", {})
    otp_cfg = cfg.get("otp", {})

    db = await init_db(args.db)
    sensor = DS18B20Reader(mock=mock, gpio_pin=gpio_pin)
    ph_sensor = PhReader(mock=mock)
    relay = RelayController(shelly_ip=shelly_ip)
    otp_service = OtpService(twilio_cfg=twilio_cfg, otp_cfg=otp_cfg)

    # Ensure system starts in stopped state
    await set_system_active(db, False)

    log.info(
        "SensorHub starting on ws://%s:%d (mock=%s, shelly=%s, gpio=%d)",
        host, port, mock, shelly_ip or "none", gpio_pin,
    )

    async with websockets.serve(
        lambda ws: handler(ws, db, relay, otp_service),
        host,
        port,
    ):
        await sensor_loop(db, sensor, ph_sensor)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SensorHub WebSocket server")
    parser.add_argument("--host", default=None, help="Bind address")
    parser.add_argument("--port", type=int, default=None, help="WebSocket port")
    parser.add_argument("--mock", action="store_true", help="Use mock sensor/relay")
    parser.add_argument("--db", default="sensorhub.db", help="SQLite database path")
    parser.add_argument("--config", default=None, help="Path to config.json")
    parser.add_argument("--shelly-ip", default=None, help="Shelly Pro 2 IP address")
    args = parser.parse_args()

    asyncio.run(main(args))
