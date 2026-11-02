"""Per-stage reading totals for active runs.

The sensor loop adds every reading taken while the drum runs. The totals are folded into the run's
`sensors` field every FLUSH_SECONDS and on every save, so the run keeps the server's own record of
each stage whether or not an app is open. The firmware does the same (it flushes less often, to
spare the flash).
"""

import logging
import time

import aiosqlite

from db import get_run, write_run
from services.broadcast import Broadcaster

log = logging.getLogger("sensorhub.run_sensors")

FLUSH_SECONDS = 60


def _add(agg: dict | None, v: float) -> dict:
    if not agg:
        return {"n": 1, "sum": v, "sumSq": v * v, "min": v, "max": v}
    return {
        "n": agg["n"] + 1,
        "sum": agg["sum"] + v,
        "sumSq": agg["sumSq"] + v * v,
        "min": min(agg["min"], v),
        "max": max(agg["max"], v),
    }


def _merge(a: dict | None, b: dict) -> dict:
    if not a:
        return b
    return {
        "n": a["n"] + b["n"],
        "sum": a["sum"] + b["sum"],
        "sumSq": a["sumSq"] + b["sumSq"],
        "min": min(a["min"], b["min"]),
        "max": max(a["max"], b["max"]),
    }


class RunSensors:
    def __init__(self) -> None:
        # run id -> stage id -> "temp" | "ph" -> totals not yet in the stored document
        self._pending: dict[str, dict[str, dict[str, dict]]] = {}
        self._last_flush = time.monotonic()

    def add(self, run_id: str, stage_id: str, key: str, value: float) -> None:
        stage = self._pending.setdefault(run_id, {}).setdefault(stage_id, {})
        stage[key] = _add(stage.get(key), value)

    def fold(self, run_id: str, stored: dict) -> dict:
        """The stored `sensors` with this run's pending totals added; the pending totals are cleared."""
        out = {stage: dict(keys) for stage, keys in (stored or {}).items()}
        for stage, keys in self._pending.pop(run_id, {}).items():
            target = out.setdefault(stage, {})
            for key, agg in keys.items():
                target[key] = _merge(target.get(key), agg)
        return out

    @property
    def due(self) -> bool:
        return bool(self._pending) and time.monotonic() - self._last_flush >= FLUSH_SECONDS

    async def flush(self, db: aiosqlite.Connection, broadcaster: Broadcaster) -> None:
        """Write every pending total into its run. Only `sensors`, `updatedAt` and `seq` change, not `rev`,
        so an app in the middle of an edit doesn't get a conflict."""
        self._last_flush = time.monotonic()
        for run_id in list(self._pending):
            stored = await get_run(db, run_id)
            if not stored or stored["status"] != "active":
                self._pending.pop(run_id, None)
                continue
            doc = await write_run(
                db,
                {**stored, "sensors": self.fold(run_id, stored.get("sensors", {})), "updatedAt": int(time.time() * 1000)},
            )
            await broadcaster.broadcast({"type": "run_updated", "id": doc["id"], "rev": doc["rev"], "seq": doc["seq"]})
