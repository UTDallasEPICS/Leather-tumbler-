"""SQLite database operations for SensorHub."""

import json
import uuid

import aiosqlite
from datetime import datetime

# Finished runs kept; the oldest beyond this are deleted (the firmware keeps the same number).
RUNS_KEPT = 200


async def init_db(db_path: str = "sensorhub.db") -> aiosqlite.Connection:
    """Initialize the database and create tables if they don't exist."""
    db = await aiosqlite.connect(db_path)
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA busy_timeout=5000")
    db.row_factory = aiosqlite.Row

    await db.executescript("""
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS ph_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ph REAL NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS system_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active INTEGER NOT NULL DEFAULT 0,
            cycles INTEGER NOT NULL DEFAULT 0
        );

        -- Runs: one JSON document each (see lib/runs-api.ts in the app). The columns copy the few
        -- fields the server reads, so lookups don't have to parse every document.
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            tumbler_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            rev INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            started_at INTEGER,
            ended_at INTEGER,
            stage_id TEXT,
            doc TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS runs_seq ON runs(seq);

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        INSERT OR IGNORE INTO system_state (id, active, cycles) VALUES (1, 0, 0);
    """)
    await db.execute(
        "INSERT OR IGNORE INTO meta (key, value) VALUES ('controller_id', ?)",
        (f"py-{uuid.uuid4().hex[:12]}",),
    )
    await db.commit()
    return db


async def insert_reading(db: aiosqlite.Connection, temperature: float) -> dict:
    """Insert a temperature reading and return it."""
    now = datetime.now().isoformat(timespec="seconds")
    cursor = await db.execute(
        "INSERT INTO readings (temperature, timestamp) VALUES (?, ?)",
        (temperature, now),
    )
    await db.commit()
    return {"id": cursor.lastrowid, "temperature": temperature, "timestamp": now}


async def get_readings(db: aiosqlite.Connection, limit: int = 100) -> list[dict]:
    """Return the most recent readings, newest first."""
    cursor = await db.execute(
        "SELECT id, temperature, timestamp FROM readings ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    return [{"id": r[0], "temperature": r[1], "timestamp": r[2]} for r in rows]


async def get_system_state(db: aiosqlite.Connection) -> dict:
    """Return current system state."""
    cursor = await db.execute("SELECT active, cycles FROM system_state WHERE id = 1")
    row = await cursor.fetchone()
    return {"active": bool(row[0]), "cycles": row[1]}


async def set_system_active(db: aiosqlite.Connection, active: bool) -> None:
    """Set the system active flag."""
    await db.execute(
        "UPDATE system_state SET active = ? WHERE id = 1", (int(active),)
    )
    await db.commit()


async def set_cycles(db: aiosqlite.Connection, cycles: int) -> None:
    """Set the cycle count."""
    await db.execute("UPDATE system_state SET cycles = ? WHERE id = 1", (cycles,))
    await db.commit()


async def reset_cycles(db: aiosqlite.Connection) -> None:
    """Reset cycles to zero."""
    await set_cycles(db, 0)


async def insert_ph_reading(db: aiosqlite.Connection, ph: float) -> dict:
    """Insert a pH reading and return it."""
    now = datetime.now().isoformat(timespec="seconds")
    cursor = await db.execute(
        "INSERT INTO ph_readings (ph, timestamp) VALUES (?, ?)",
        (ph, now),
    )
    await db.commit()
    return {"id": cursor.lastrowid, "ph": ph, "timestamp": now}


async def get_ph_readings(db: aiosqlite.Connection, limit: int = 100) -> list[dict]:
    """Return the most recent pH readings, newest first."""
    cursor = await db.execute(
        "SELECT id, ph, timestamp FROM ph_readings ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    return [{"id": r[0], "ph": r[1], "timestamp": r[2]} for r in rows]


async def clear_readings(db: aiosqlite.Connection) -> None:
    """Delete all temperature and pH readings."""
    await db.execute("DELETE FROM readings")
    await db.execute("DELETE FROM ph_readings")
    await db.commit()


async def get_controller_id(db: aiosqlite.Connection) -> str:
    """Stable id for this server, so the app never mixes two controllers' runs."""
    cursor = await db.execute("SELECT value FROM meta WHERE key = 'controller_id'")
    row = await cursor.fetchone()
    return row[0]


# ---- runs -----------------------------------------------------------------------------------------


def _row_to_run(row) -> dict:
    return json.loads(row["doc"])


async def get_run(db: aiosqlite.Connection, run_id: str) -> dict | None:
    cursor = await db.execute("SELECT doc FROM runs WHERE id = ?", (run_id,))
    row = await cursor.fetchone()
    return _row_to_run(row) if row else None


async def get_active_run(db: aiosqlite.Connection, tumbler_id: int) -> dict | None:
    cursor = await db.execute(
        "SELECT doc FROM runs WHERE tumbler_id = ? AND status = 'active' LIMIT 1", (tumbler_id,)
    )
    row = await cursor.fetchone()
    return _row_to_run(row) if row else None


async def get_active_runs(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute("SELECT doc FROM runs WHERE status = 'active'")
    return [_row_to_run(r) for r in await cursor.fetchall()]


async def runs_since(db: aiosqlite.Connection, since: int, limit: int) -> tuple[int, list[dict], bool]:
    """Runs changed after `since`, oldest change first; the seq they cover; and whether more are left."""
    # read the latest seq first: a write landing between the two queries is then left for the next call
    # instead of being skipped
    latest = await latest_seq(db)
    cursor = await db.execute(
        "SELECT doc FROM runs WHERE seq > ? AND seq <= ? ORDER BY seq ASC LIMIT ?", (since, latest, limit)
    )
    runs = [_row_to_run(r) for r in await cursor.fetchall()]
    more = len(runs) == limit and runs[-1]["seq"] < latest
    return (runs[-1]["seq"] if more else latest), runs, more


async def latest_seq(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT COALESCE(MAX(seq), 0) FROM runs")
    return (await cursor.fetchone())[0]


async def write_run(db: aiosqlite.Connection, doc: dict) -> dict:
    """Store a run document as given (the caller has set rev, updatedAt and sensors); assigns the next seq."""
    doc = {**doc, "seq": await latest_seq(db) + 1}
    await db.execute(
        """
        INSERT INTO runs (id, tumbler_id, status, rev, seq, started_at, ended_at, stage_id, doc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            tumbler_id = excluded.tumbler_id, status = excluded.status, rev = excluded.rev,
            seq = excluded.seq, started_at = excluded.started_at, ended_at = excluded.ended_at,
            stage_id = excluded.stage_id, doc = excluded.doc
        """,
        (
            doc["id"],
            doc["tumblerId"],
            doc["status"],
            doc["rev"],
            doc["seq"],
            doc.get("startedAt"),
            doc.get("endedAt"),
            doc.get("stageId"),
            json.dumps(doc, separators=(",", ":")),
        ),
    )
    await _trim_runs(db)
    await db.commit()
    return doc


async def _trim_runs(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        DELETE FROM runs WHERE status != 'active' AND id NOT IN (
            SELECT id FROM runs WHERE status != 'active'
            ORDER BY COALESCE(ended_at, started_at) DESC LIMIT ?
        )
        """,
        (RUNS_KEPT,),
    )
