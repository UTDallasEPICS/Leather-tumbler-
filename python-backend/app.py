from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import sqlite3

app = FastAPI()

DB_NAME = "readings.db"

system_active = False

# Enable CORS for your Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    """Initialize the SQLite database and create the table if it doesn't exist"""
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                name TEXT,
                value REAL,
                unit TEXT,
                timestamp TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON readings(timestamp)")
    print("Database initialized successfully.")

# Initialize the database on startup
init_db()

@app.get("/api/system/state")
async def get_state():
    """The Python Simulator calls this to see if it should be working"""
    return {"active": system_active}

@app.post("/api/system/state")
async def set_state(state: dict):
    """The Website calls this when you click Start or Stop"""
    global system_active
    system_active = state.get("active", False)
    status = "STARTED" if system_active else "STOPPED"
    print(f"User changed system state to: {status}")
    return {"status": "ok", "system_active": system_active}

@app.get("/api/readings")
async def get_readings(limit: int = 100):
    """Fetches history for your dashboard charts"""
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row  
        cursor = conn.execute("SELECT * FROM readings ORDER BY timestamp DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()     
        history = [dict(row) for row in rows]
    # Reverse so the chart flows from left (old) to right (new)
    return {"readings": history[::-1]}

@app.get("/api/readings/latest")
async def get_latest_reading():
    """Get the most recent sensor reading from the database"""
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM readings ORDER BY timestamp DESC LIMIT 1")
        row = cursor.fetchone()
        return {"latest": dict(row) if row else None}

@app.post("/api/readings")
async def post_reading(reading: dict):
    """The 'Gatekeeper': Only saves data to SQLite if the switch is ON"""
    if not system_active:
        return {"status": "ignored", "message": "System is stopped. Data discarded."}

    timestamp = datetime.now().isoformat()
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute(
            "INSERT INTO readings (type, name, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)",
            (reading["type"], reading["name"], reading["value"], reading["unit"], timestamp)
        )
    return {"status": "success", "data": reading}

@app.delete("/api/readings/clear")
async def clear_database():
    """Wipes the database and resets the ID counter to 1"""
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("DELETE FROM readings")
        conn.execute("DELETE FROM sqlite_sequence WHERE name='readings'")
    print("History cleared.")
    return {"status": "success", "message": "Database wiped."}

@app.get("/health")
async def health_check():
    """Quick check for the dashboard to see if everything is alive"""
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.execute("SELECT COUNT(*) FROM readings")
        count = cursor.fetchone()[0]
        return {
            "status": "ok", 
            "total_stored_readings": count, 
            "is_system_running": system_active
        }
if __name__ == "__main__":
    import uvicorn
    # '0.0.0.0' allows your phone to connect via your hotspot IP
    # 'port=8000' matches what your frontend is looking for
    uvicorn.run(app, host="0.0.0.0", port=8000)