"""SQLite database operations for SensorHub."""

import aiosqlite
from datetime import datetime

#this function just initalizes the db filebefore we start anything.
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

        INSERT OR IGNORE INTO system_state (id, active, cycles) VALUES (1, 0, 0);
    """)
    await db.commit()
    return db

#this take sthe temp readings that are stored from /sys/bus/w1/devices/28*-/ ... its in a w1_slave file, under the value t=..., then it iinserts those values into the table
async def insert_reading(db: aiosqlite.Connection, temperature: float) -> dict:
    """Insert a temperature reading and return it."""
    now = datetime.now().isoformat(timespec="seconds")
    cursor = await db.execute(
        "INSERT INTO readings (temperature, timestamp) VALUES (?, ?)",
        (temperature, now),
    )
    await db.commit()
    return {"id": cursor.lastrowid, "temperature": temperature, "timestamp": now}

#this goes and gets the readings for other fucntions to work
async def get_readings(db: aiosqlite.Connection, limit: int = 100) -> list[dict]:
    """Return the most recent readings, newest first."""
    cursor = await db.execute(
        "SELECT id, temperature, timestamp FROM readings ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    return [{"id": r[0], "temperature": r[1], "timestamp": r[2]} for r in rows]

#this for the num of cycles the tumbler would go thorgh but this isnt fully done as the shelly isnt done yet
async def get_system_state(db: aiosqlite.Connection) -> dict:
    """Return current system state."""
    cursor = await db.execute("SELECT active, cycles FROM system_state WHERE id = 1")
    row = await cursor.fetchone()
    return {"active": bool(row[0]), "cycles": row[1]}

#same for this shelly isnt active so for now its placeholder for setting on the system
async def set_system_active(db: aiosqlite.Connection, active: bool) -> None:
    """Set the system active flag."""
    await db.execute(
        "UPDATE system_state SET active = ? WHERE id = 1", (int(active),)
    )
    await db.commit()

#all below funcitons rely on the shelly being present to work so as of now they are implemented but not tested for their functions.
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
    """Delete all temperature and pH readings atomically."""
    await db.execute("DELETE FROM readings")
    await db.execute("DELETE FROM ph_readings")
    await db.commit()
