"""Background task that reads sensors and broadcasts readings when active."""

import asyncio
import logging

import aiosqlite

from db import get_system_state, insert_reading, insert_ph_reading
from sensor_reader import DS18B20Reader
from ph_reader import PhReader
from services.broadcast import Broadcaster

log = logging.getLogger("sensorhub.sensor_loop")


async def run_sensor_loop(
    db: aiosqlite.Connection,
    sensor: DS18B20Reader,
    ph_sensor: PhReader,
    broadcaster: Broadcaster,
) -> None:
    while True:
        try:
            state = await get_system_state(db)
            if state["active"]:
                temp = sensor.read_temperature()
                if temp is not None:
                    reading = await insert_reading(db, temp)
                    await broadcaster.broadcast({
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
                        await broadcaster.broadcast({
                            "type": "ph",
                            "id": ph_reading["id"],
                            "value": ph_reading["ph"],
                            "timestamp": ph_reading["timestamp"],
                        })
                    except Exception:
                        log.exception("pH insert/broadcast failed")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Error in sensor loop")

        await asyncio.sleep(1)
