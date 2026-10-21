"""Browser sends the bearer token in the first frame, never a URL/query string."""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool
import aiosqlite
from db import get_system_state
from deps import get_broadcaster, get_db
from services.broadcast import Broadcaster

router = APIRouter()


@router.websocket("/ws")
async def ws_broadcast(
    ws: WebSocket,
    broadcaster: Broadcaster = Depends(get_broadcaster),
    db: aiosqlite.Connection = Depends(get_db),
):
    origin = ws.headers.get("origin")
    if origin and origin not in ws.app.state.auth.settings.origins:
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        frame = await asyncio.wait_for(ws.receive_text(), timeout=5)
        if not frame.startswith("Bearer ") or len(frame) > 4103:
            await ws.close(code=1008)
            return
        token = frame[7:]
        await run_in_threadpool(ws.app.state.auth.authenticate, token)
        broadcaster.add(ws, token)
        state = await get_system_state(db)
        await broadcaster.send(ws, {"type": "system_state", **state})
        while True:
            # Check idle sessions too; no unauthorized frame is ever broadcast.
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=1)
            except asyncio.TimeoutError:
                pass
            await run_in_threadpool(ws.app.state.auth.authenticate, token)
    except (HTTPException, asyncio.TimeoutError):
        await ws.close(code=1008)
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.remove(ws)
