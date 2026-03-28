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
from pathlib import Path

import websockets

from db import (
    init_db,
    insert_reading,
    get_readings,
    get_system_state,
    set_system_active,
    reset_cycles,
    clear_readings,
)
from sensor_reader import DS18B20Reader
from relay_controller import RelayController

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("sensorhub")

# All connected WebSocket clients
connected: set[websockets.ServerConnection] = set()


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


async def handle_message(ws, data: dict, db, relay) -> None:
    """Process an incoming message from a app."""
    msg_type = data.get("type")

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

    else:
        await ws.send(json.dumps({
            "type": "error", "message": f"Unknown message type: {msg_type}",
        }))


async def handler(ws, db, relay):
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

        # Listen for client messages
        async for raw in ws:
            try:
                data = json.loads(raw)
                await handle_message(ws, data, db, relay)
            except json.JSONDecodeError:
                await ws.send(json.dumps({
                    "type": "error", "message": "Invalid JSON",
                }))
    finally:
        connected.discard(ws)
        log.info("Client disconnected (%d remaining)", len(connected))


async def sensor_loop(db, sensor: DS18B20Reader) -> None:
    """Continuously read the sensor and broadcast when system is active."""
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

    db = await init_db(args.db)
    sensor = DS18B20Reader(mock=mock, gpio_pin=gpio_pin)
    relay = RelayController(shelly_ip=shelly_ip)

    # Ensure system starts in stopped state
    await set_system_active(db, False)

    log.info(
        "SensorHub starting on ws://%s:%d (mock=%s, shelly=%s, gpio=%d)",
        host, port, mock, shelly_ip or "none", gpio_pin,
    )

    async with websockets.serve(
        lambda ws: handler(ws, db, relay),
        host,
        port,
    ):
        await sensor_loop(db, sensor)


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
