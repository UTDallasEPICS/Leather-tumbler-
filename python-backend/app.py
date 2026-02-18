from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from collections import deque

app = FastAPI()

# Enable CORS for your Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store simulated sensor readings (keep last 100 readings)
readings_history = deque(maxlen=100)

@app.get("/api/readings")
async def get_readings():
    """Get all stored sensor readings"""
    return {"readings": list(readings_history)}

@app.get("/api/readings/latest")
async def get_latest_reading():
    """Get the most recent sensor reading"""
    if readings_history:
        return {"latest": readings_history[-1]}
    return {"latest": None}

@app.post("/api/readings")
async def post_reading(reading: dict):
    """Store a new sensor reading"""
    timestamp = datetime.now().isoformat()
    reading["timestamp"] = timestamp
    readings_history.append(reading)
    return {"status": "success", "data": reading}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "readings_count": len(readings_history)}
