from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3

from switch_controller import get_controller, SWITCHES

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down to your Next.js domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = '/home/tumbler/temperature.db'

# Single shared controller instance
controller = get_controller()


# ─── DB Helpers ──────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─── Temperature Endpoints ───────────────────────────────────────────────────

@app.get("/temperature/latest")
def get_latest():
    conn = get_db()
    row = conn.execute(
        'SELECT * FROM temperature_readings ORDER BY id DESC LIMIT 1'
    ).fetchone()
    conn.close()
    return dict(row) if row else {"error": "No data yet"}


@app.get("/temperature/history")
def get_history(limit: int = 50):
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM temperature_readings ORDER BY id DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/temperature/stats")
def get_stats():
    conn = get_db()
    row = conn.execute('''
        SELECT
            MIN(celsius) as min_temp,
            MAX(celsius) as max_temp,
            AVG(celsius) as avg_temp,
            COUNT(*) as total_readings
        FROM temperature_readings
    ''').fetchone()
    conn.close()
    return dict(row)


@app.get("/logs")
def get_logs(limit: int = 100, level: str = None):
    conn = get_db()
    if level:
        rows = conn.execute(
            'SELECT * FROM logs WHERE level = ? ORDER BY id DESC LIMIT ?',
            (level, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            'SELECT * FROM logs ORDER BY id DESC LIMIT ?', (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Tumbler Control Endpoints ───────────────────────────────────────────────

class SwitchCommand(BaseModel):
    switch_id: str
    state: bool  # True = ON, False = OFF


@app.get("/tumbler/state")
def get_tumbler_state():
    """Get current ON/OFF state of all 4 switches."""
    try:
        return controller.get_state()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tumbler/switch")
def set_switch(cmd: SwitchCommand):
    """
    Set a single switch ON or OFF.
    Safety logic (mutex pairs) is handled in the controller —
    e.g. turning on rotation_fwd will automatically turn off rotation_rev.
    """
    if cmd.switch_id not in SWITCHES:
        raise HTTPException(status_code=400, detail=f"Invalid switch. Valid: {SWITCHES}")
    try:
        state = controller.set_switch(cmd.switch_id, cmd.state)
        return {"success": True, "state": state}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tumbler/stop")
def emergency_stop():
    """Turn off all switches immediately."""
    try:
        state = controller.all_off()
        return {"success": True, "state": state}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
