import asyncio
import aiohttp
import random
import json
from datetime import datetime

BACKEND_URL = "http://localhost:8000"

async def send_reading(session, sensor_type):
    """Send a simulated sensor reading to the backend"""
    
    # Simulate realistic sensor data
    if sensor_type == "heat":
        # Heat in Celsius, varying around 16°C with small fluctuations
        base_heat = 16
        variation = random.gauss(0, 0.5)  # Normal distribution with std dev of 0.5
        value = base_heat + variation
        value = round(value, 1)
        unit = "°C"
        sensor_name = "Heat"
    elif sensor_type == "ph":
        # pH level, typically neutral around 5-7, with small variations
        base_ph = 5
        variation = random.gauss(0, 0.2)  # Normal distribution with std dev of 0.2
        value = base_ph + variation
        value = round(value, 2)
        # Keep pH within valid range (0-14)
        value = max(0, min(14, value))
        unit = ""
        sensor_name = "pH"
    else:
        value = round(random.uniform(0, 100), 2)
        unit = "units"
        sensor_name = "Generic Sensor"
    
    data = {
        "type": sensor_type,
        "name": sensor_name,
        "value": value,
        "unit": unit
    }
    
    try:
        async with session.post(f"{BACKEND_URL}/api/readings", json=data) as resp:
            if resp.status == 200:
                print(f"✓ [{datetime.now().strftime('%H:%M:%S')}] {sensor_name}: {value}{unit}")
            else:
                print(f"✗ Failed to send {sensor_type} reading: {resp.status}")
    except Exception as e:
        print(f"✗ Error sending {sensor_type}: {e}")

async def simulate_readings(interval=5):
    """Continuously send simulated sensor readings"""
    print(f"🌡️  Starting sensor simulation (interval: {interval}s)")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Sending Heat and pH sensor data...\n")
    
    async with aiohttp.ClientSession() as session:
        try:
            while True:
                await send_reading(session, "heat")
                await send_reading(session, "ph")
                await asyncio.sleep(interval)
        except KeyboardInterrupt:
            print("\n\n⏹️  Simulation stopped")

if __name__ == "__main__":
    try:
        asyncio.run(simulate_readings(interval=5))
    except KeyboardInterrupt:
        print("\nExiting...")
