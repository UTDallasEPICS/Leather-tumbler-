"""FastAPI application factory.

Owns all long-lived resources (DB, sensors, relay, authentication, WS broadcaster)
via a lifespan context manager. Routers under `/api/*` handle request/response;
`/ws` is a broadcast-only WebSocket stream for live sensor events.
"""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from config import load_config
from db import init_db, set_system_active
from ph_reader import PhReader
from relay_controller import RelayController
from routers import auth, readings, system, ws
from sensor_reader import DS18B20Reader
from services.broadcast import Broadcaster
from security.config import AuthSettings
from security.service import AuthService
from security.dependencies import current_user
from security.middleware import SecurityMiddleware
from security.notifications import notification_loop
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
        shelly_ip = (
            None
            if mock
            else (settings.get("shelly_ip") or cfg.get("shelly_ip", "") or None)
        )
        gpio_pin = cfg.get("gpio_pin", 4)
        db_path = settings.get("db_path") or "sensorhub.db"

        app.state.auth = await asyncio.to_thread(
            AuthService, db_path, settings["auth_settings"]
        )
        app.state.db = await init_db(db_path)
        app.state.sensor = DS18B20Reader(mock=mock, gpio_pin=gpio_pin)
        app.state.ph_sensor = PhReader(mock=mock)
        app.state.relay = RelayController(shelly_ip=shelly_ip)
        app.state.broadcaster = Broadcaster(app.state.auth)

        await set_system_active(app.state.db, False)

        log.info(
            "SensorHub ready (mock=%s, shelly=%s, gpio=%d)",
            mock,
            shelly_ip or "none",
            gpio_pin,
        )

        task = asyncio.create_task(
            run_sensor_loop(
                app.state.db,
                app.state.sensor,
                app.state.ph_sensor,
                app.state.broadcaster,
            )
        )

        notifications = asyncio.create_task(notification_loop(app.state.auth))
        try:
            yield
        finally:
            notifications.cancel()
            with suppress(asyncio.CancelledError):
                await notifications
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
    auth_settings: AuthSettings | None = None,
) -> FastAPI:
    auth_settings = auth_settings or AuthSettings.from_env()
    settings = {
        "auth_settings": auth_settings,
        "config_path": config_path,
        "mock": mock,
        "shelly_ip": shelly_ip,
        "db_path": db_path,
    }
    app = FastAPI(
        lifespan=_build_lifespan(settings),
        title="SensorHub API",
        responses={
            code: {"description": description}
            for code, description in {
                400: "Malformed request body",
                401: "Authentication required",
                403: "Insufficient permission",
                404: "Not found",
                409: "Conflict",
                413: "Body too large",
                429: "Rate limited",
                503: "Unavailable",
            }.items()
        },
    )
    app.add_middleware(SecurityMiddleware)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {k: e[k] for k in ("loc", "msg", "type")} for e in exc.errors()
                ]
            },
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(auth_settings.origins),
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(
        system.router, prefix="/api/system", dependencies=[Depends(current_user)]
    )
    app.include_router(
        readings.router, prefix="/api/readings", dependencies=[Depends(current_user)]
    )
    app.include_router(auth.admin_router, prefix="/api/admin")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(ws.router)

    return app
