"""SensorHub WebSocket server.

Reads DS18B20 temperature, stores in SQLite, pushes live data to clients.
Accepts start/stop/reset commands from the phone app.

Usage:
    python main.py --mock          # development (simulated sensor)
    python main.py                 # production (real DS18B20 on Pi)
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
    insert_ph_reading,
    get_ph_readings,
    get_system_state,
    set_system_active,
    reset_cycles,
    clear_readings,
)
from sensor_reader import DS18B20Reader
from ph_reader import PhReader
from relay_controller import RelayController

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("sensorhub")

# These are all the connected client like the app or pwa via websokcket.
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
    """Send a JSON message to all connected clients."""
    if connected:
        data = json.dumps(message)
        websockets.broadcast(connected, data)


async def handle_message(ws, data: dict, db, relay) -> None:
    """Process an incoming message from a client."""
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

    else:
        await ws.send(json.dumps({
            "type": "error", "message": f"Unknown message type: {msg_type}",
        }))


async def handler(ws, db, relay):
    """Handle a single WebSocket client connection."""
    connected.add(ws)
    log.info("Client connected (%d total)", len(connected))

    try:
        # curent state is sent on instance of conect
        state = await get_system_state(db)
        await ws.send(json.dumps({"type": "system_state", **state}))

        # recent history is sent on instance of conect
        readings = await get_readings(db, limit=100)
        await ws.send(json.dumps({"type": "history", "readings": readings}))

        # pH history on connect
        ph_readings = await get_ph_readings(db, limit=100)
        await ws.send(json.dumps({"type": "ph_history", "readings": ph_readings}))

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


async def sensor_loop(db, sensor: DS18B20Reader, ph_sensor: PhReader) -> None:
    """Continuously read sensors and broadcast when system is active."""
    while True:
        try:
            state = await get_system_state(db)
            if state["active"]:
                # --- Temperature read ---
                temp = sensor.read_temperature()
                if temp is not None:
                    reading = await insert_reading(db, temp)
                    await broadcast({
                        "type": "temperature",
                        "id": reading["id"],
                        "value": reading["temperature"],
                        "timestamp": reading["timestamp"],
                    })

                # --- pH read (separate error handling so temp keeps working) ---
                try:
                    ph = await asyncio.wait_for(
                        asyncio.to_thread(ph_sensor.read_ph), timeout=2.0
                    )
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

    db = await init_db(args.db)
    sensor = DS18B20Reader(mock=mock, gpio_pin=gpio_pin)
    ph_sensor = PhReader(mock=mock)
    relay = RelayController(shelly_ip=shelly_ip)

    # this ensures system starts in stopped state
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
