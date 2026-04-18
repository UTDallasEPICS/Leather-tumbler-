"""FastAPI application factory.

Owns all long-lived resources (DB, sensors, relay, OTP service, WS broadcaster)
via a lifespan context manager. Routers under `/api/*` handle request/response;
`/ws` is a broadcast-only WebSocket stream for live sensor events.
"""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import load_config
from db import init_db, set_system_active
from ph_reader import PhReader
from relay_controller import RelayController
from routers import auth, readings, recovery, system, ws
from sensor_reader import DS18B20Reader
from services.broadcast import Broadcaster
from services.otp import OtpService
from services.sensor_loop import run_sensor_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("sensorhub")


def _build_lifespan(settings: dict):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        cfg = load_config(settings.get("config_path"))
        mock = settings.get("mock") or cfg.get("mock", False)
        shelly_ip = settings.get("shelly_ip") or cfg.get("shelly_ip", "") or None
        gpio_pin = cfg.get("gpio_pin", 4)
        db_path = settings.get("db_path") or "sensorhub.db"

        app.state.db = await init_db(db_path)
        app.state.sensor = DS18B20Reader(mock=mock, gpio_pin=gpio_pin)
        app.state.ph_sensor = PhReader(mock=mock)
        app.state.relay = RelayController(shelly_ip=shelly_ip)
        app.state.otp_service = OtpService(
            twilio_cfg=cfg.get("twilio", {}),
            otp_cfg=cfg.get("otp", {}),
        )
        app.state.broadcaster = Broadcaster()

        await set_system_active(app.state.db, False)

        log.info(
            "SensorHub ready (mock=%s, shelly=%s, gpio=%d)",
            mock, shelly_ip or "none", gpio_pin,
        )

        task = asyncio.create_task(
            run_sensor_loop(
                app.state.db,
                app.state.sensor,
                app.state.ph_sensor,
                app.state.broadcaster,
            )
        )

        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
            await app.state.db.close()

    return lifespan


def create_app(
    config_path: str | None = None,
    mock: bool = False,
    shelly_ip: str | None = None,
    db_path: str = "sensorhub.db",
) -> FastAPI:
    settings = {
        "config_path": config_path,
        "mock": mock,
        "shelly_ip": shelly_ip,
        "db_path": db_path,
    }
    app = FastAPI(lifespan=_build_lifespan(settings), title="SensorHub API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system.router, prefix="/api/system")
    app.include_router(readings.router, prefix="/api/readings")
    app.include_router(recovery.router, prefix="/api/recovery")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(ws.router)

    return app
