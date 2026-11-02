"""Runs, shared by every device that talks to this tumbler.

The contract (fields the server reads and owns, status codes, rules) is written down at the top of
lib/runs-api.ts in the app; the ESP32 firmware implements the same one.
"""

import json
import logging
import re
import time

import aiosqlite
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from db import get_active_run, get_run, latest_seq, runs_since, write_run
from deps import get_broadcaster, get_db, get_run_sensors
from schemas.runs import ImportIn, OverrideIn, RunIn, RunPutIn
from services.broadcast import Broadcaster
from services.run_sensors import RunSensors

log = logging.getLogger("sensorhub.router.runs")
router = APIRouter(tags=["runs"])

ID_RE = re.compile(r"[A-Za-z0-9_-]{1,40}")
STATUSES = {"active", "completed", "overridden"}
SERVER_FIELDS = ("rev", "seq", "updatedAt", "sensors")
MAX_DOC_BYTES = 32 * 1024


def now_ms() -> int:
    return int(time.time() * 1000)


def reply(code: int, **body) -> JSONResponse:
    return JSONResponse(status_code=code, content={**body, "serverNow": now_ms()})


def problem(run: dict) -> str | None:
    """Why a run document can't be stored, or None if it can."""
    if not isinstance(run.get("id"), str) or not ID_RE.fullmatch(run["id"]):
        return "bad id"
    if not isinstance(run.get("tumblerId"), int):
        return "bad tumblerId"
    if run.get("status") not in STATUSES:
        return "bad status"
    if len(json.dumps(run)) > MAX_DOC_BYTES:
        return "run too large"
    return None


def client_fields(run: dict) -> dict:
    return {k: v for k, v in run.items() if k not in SERVER_FIELDS}


async def announce(broadcaster: Broadcaster, doc: dict) -> None:
    await broadcaster.broadcast({"type": "run_updated", "id": doc["id"], "rev": doc["rev"], "seq": doc["seq"]})


@router.get("")
async def list_runs(
    since: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: aiosqlite.Connection = Depends(get_db),
) -> JSONResponse:
    seq, runs, more = await runs_since(db, since, limit)
    return reply(200, seq=seq, runs=runs, more=more)


@router.post("")
async def create_run(
    body: RunIn,
    db: aiosqlite.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> JSONResponse:
    run = body.run
    if err := problem(run):
        return reply(400, error=err)
    if run["status"] != "active":
        return reply(400, error="a new run must be active")
    if existing := await get_run(db, run["id"]):
        return reply(409, error="exists", run=existing)
    if active := await get_active_run(db, run["tumblerId"]):
        return reply(409, error="active_run", run=active)
    doc = await write_run(db, {**client_fields(run), "rev": 1, "updatedAt": now_ms(), "sensors": {}})
    await announce(broadcaster, doc)
    log.info("Run %s started on tumbler %s", doc["id"], doc["tumblerId"])
    return reply(201, run=doc)


@router.put("/{run_id}")
async def save_run(
    run_id: str,
    body: RunPutIn,
    db: aiosqlite.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
    sensors: RunSensors = Depends(get_run_sensors),
) -> JSONResponse:
    run = body.run
    if err := problem(run) or (None if run["id"] == run_id else "id mismatch"):
        return reply(400, error=err)
    stored = await get_run(db, run_id)
    if not stored:
        return reply(404, error="not_found")
    if stored["status"] != "active":
        return reply(409, error="final", run=stored)
    if body.baseRev != stored["rev"]:
        return reply(409, error="stale", run=stored)
    if run["tumblerId"] != stored["tumblerId"]:
        return reply(400, error="tumblerId can't change")
    doc = await write_run(
        db,
        {
            **client_fields(run),
            "rev": stored["rev"] + 1,
            "updatedAt": now_ms(),
            "sensors": sensors.fold(run_id, stored.get("sensors", {})),
        },
    )
    await announce(broadcaster, doc)
    return reply(200, run=doc)


@router.post("/{run_id}/override")
async def override_run(
    run_id: str,
    body: OverrideIn,
    db: aiosqlite.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
    sensors: RunSensors = Depends(get_run_sensors),
) -> JSONResponse:
    stored = await get_run(db, run_id)
    if not stored:
        return reply(404, error="not_found")
    if stored["status"] != "active":
        return reply(409, error="final", run=stored)
    now = now_ms()
    doc = await write_run(
        db,
        {
            **stored,
            "status": "overridden",
            "overrideReason": body.reason,
            "endedAt": now,
            "rev": stored["rev"] + 1,
            "updatedAt": now,
            "sensors": sensors.fold(run_id, stored.get("sensors", {})),
        },
    )
    await announce(broadcaster, doc)
    log.info("Run %s overridden: %s", run_id, body.reason)
    return reply(200, run=doc)


@router.post("/import")
async def import_runs(
    body: ImportIn,
    db: aiosqlite.Connection = Depends(get_db),
    broadcaster: Broadcaster = Depends(get_broadcaster),
) -> JSONResponse:
    """A device's runs from before they were shared. Ids already stored are skipped; an active run that
    clashes with this tumbler's active run is kept as overridden. The device's own sensor totals are kept."""
    imported: list[str] = []
    skipped: list[str] = []
    for run in body.runs:
        if problem(run) or await get_run(db, run["id"]):
            skipped.append(str(run.get("id")))
            continue
        doc = client_fields(run)
        if doc["status"] == "active" and await get_active_run(db, doc["tumblerId"]):
            doc = {**doc, "status": "overridden", "overrideReason": "Started on another device", "endedAt": now_ms()}
        doc = await write_run(db, {**doc, "rev": 1, "updatedAt": now_ms(), "sensors": run.get("sensors") or {}})
        await announce(broadcaster, doc)
        imported.append(doc["id"])
    seq = await latest_seq(db)
    log.info("Imported %d runs (%d skipped)", len(imported), len(skipped))
    return reply(200, imported=imported, skipped=skipped, seq=seq)
