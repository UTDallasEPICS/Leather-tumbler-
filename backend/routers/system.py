"""System control: start/stop relay, reset cycles, clear logs, state, relay status."""

import logging
from fastapi import APIRouter, Depends

import aiosqlite

from db import (
    clear_readings,
    get_system_state,
    reset_cycles as db_reset_cycles,
    set_system_active,
)
from deps import get_broadcaster, get_db, get_relay
from relay_controller import RelayController
from schemas.system import (
    ClearLogsResponse,
    RelayStatus,
    SystemActionResponse,
    SystemState,
)
from services.broadcast import Broadcaster

log = logging.getLogger("sensorhub.router.system")
router = APIRouter(tags=["system"])


@router.get("/state", response_model=SystemState)
async def read_state(db: aiosqlite.Connection = Depends(get_db)) -> SystemState:
    state = await get_system_state(db)
    return SystemState(**state)


@router.post("/start", response_model=SystemActionResponse)
async def start_system(
    db: aiosqlite.Connection = Depends(get_db),
    relay: RelayController = Depends(get_relay),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> SystemActionResponse:
    success = await relay.start()
    await set_system_active(db, True)
    state = await get_system_state(db)
    await broadcaster.broadcast({"type": "system_state", **state})
    log.info("System started")
    return SystemActionResponse(success=success, state=SystemState(**state))


@router.post("/stop", response_model=SystemActionResponse)
async def stop_system(
    db: aiosqlite.Connection = Depends(get_db),
    relay: RelayController = Depends(get_relay),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> SystemActionResponse:
    success = await relay.stop()
    await set_system_active(db, False)
    state = await get_system_state(db)
    await broadcaster.broadcast({"type": "system_state", **state})
    log.info("System stopped")
    return SystemActionResponse(success=success, state=SystemState(**state))


@router.post("/reset-cycles", response_model=SystemActionResponse)
async def reset_cycle_count(
    db: aiosqlite.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> SystemActionResponse:
    await db_reset_cycles(db)
    state = await get_system_state(db)
    await broadcaster.broadcast({"type": "system_state", **state})
    log.info("Cycles reset")
    return SystemActionResponse(success=True, state=SystemState(**state))


@router.post("/clear-logs", response_model=ClearLogsResponse)
async def clear_logs(
    db: aiosqlite.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> ClearLogsResponse:
    await clear_readings(db)
    await broadcaster.broadcast({"type": "logs_cleared"})
    log.info("Readings cleared")
    return ClearLogsResponse(success=True)


@router.get("/relay-status", response_model=RelayStatus)
async def relay_status(relay: RelayController = Depends(get_relay)) -> RelayStatus:
    status = await relay.get_status()
    return RelayStatus(**status)
