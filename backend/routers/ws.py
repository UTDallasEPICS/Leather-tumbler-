"""Broadcast-only WebSocket endpoint.

The server pushes live sensor/system events. Client frames are ignored so the
transport stays one-directional.
"""

import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
import aiosqlite

from db import get_system_state
from deps import get_broadcaster, get_db
from services.broadcast import Broadcaster

log = logging.getLogger("sensorhub.ws")
router = APIRouter()


@router.websocket("/ws")
async def ws_broadcast(
    ws: WebSocket,
    broadcaster: Broadcaster = Depends(get_broadcaster),
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    await ws.accept()
    broadcaster.add(ws)
    log.info("Client connected (%d total)", broadcaster.client_count)

    try:
        state = await get_system_state(db)
        await ws.send_json({"type": "system_state", **state})

        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.remove(ws)
        log.info("Client disconnected (%d remaining)", broadcaster.client_count)
