"""SQLite database operations for SensorHub."""

import aiosqlite
from datetime import datetime


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

        CREATE TABLE IF NOT EXISTS recovery_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            phone TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        INSERT OR IGNORE INTO system_state (id, active, cycles) VALUES (1, 0, 0);
        INSERT OR IGNORE INTO recovery_config (id, phone) VALUES (1, '');
    """)
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


async def set_recovery_phone(db: aiosqlite.Connection, phone: str) -> None:
    """Set the registered recovery phone number."""
    await db.execute("UPDATE recovery_config SET phone = ? WHERE id = 1", (phone,))
    await db.commit()


async def get_recovery_phone(db: aiosqlite.Connection) -> str:
    """Get the registered recovery phone number."""
    cursor = await db.execute("SELECT phone FROM recovery_config WHERE id = 1")
    row = await cursor.fetchone()
    return (row[0] if row and row[0] else "").strip()


async def create_otp(db: aiosqlite.Connection, phone: str, code: str, expires_at: str) -> None:
    """Create a new OTP code entry."""
    await db.execute(
        "INSERT INTO otp_codes (phone, code, expires_at, consumed) VALUES (?, ?, ?, 0)",
        (phone, code, expires_at),
    )
    await db.commit()


async def verify_and_consume_otp(db: aiosqlite.Connection, phone: str, code: str, now_iso: str) -> bool:
    """Verify a valid OTP and mark it consumed if found."""
    cursor = await db.execute(
        """
        SELECT id
        FROM otp_codes
        WHERE phone = ?
          AND code = ?
          AND consumed = 0
          AND expires_at > ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (phone, code, now_iso),
    )
    row = await cursor.fetchone()
    if not row:
        return False

    await db.execute("UPDATE otp_codes SET consumed = 1 WHERE id = ?", (row[0],))
    await db.commit()
    return True


async def cleanup_old_otps(db: aiosqlite.Connection, now_iso: str) -> None:
    """Delete expired and consumed OTP entries."""
    await db.execute(
        "DELETE FROM otp_codes WHERE consumed = 1 OR expires_at <= ?",
        (now_iso,),
    )
    await db.commit()
