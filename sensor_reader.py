import sqlite3
import time
import glob
from datetime import datetime

BASE_DIR = '/sys/bus/w1/devices/'
DEVICE_FOLDER = glob.glob(BASE_DIR + '28*')[0]
DEVICE_FILE = DEVICE_FOLDER + '/w1_slave'

DB_PATH = '/home/tumbler/temperature.db'

TEMP_WARN = 30.0
TEMP_CRIT = 40.0


def read_temp_raw():
    with open(DEVICE_FILE, 'r') as f:
        return f.readlines()


def read_temp():
    lines = read_temp_raw()
    while lines[0].strip()[-3:] != 'YES':
        time.sleep(0.2)
        lines = read_temp_raw()
    equals_pos = lines[1].find('t=')
    if equals_pos != -1:
        temp_string = lines[1][equals_pos + 2:]
        return float(temp_string) / 1000.0
    return None


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS temperature_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            celsius REAL NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()


def store_reading(celsius):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT INTO temperature_readings (celsius, timestamp) VALUES (?, ?)',
        (celsius, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


def log_event(level: str, message: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
        (level, message, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


if __name__ == '__main__':
    init_db()
    print("Reading temperature every 10 seconds...")
    while True:
        temp = read_temp()
        if temp is not None:
            store_reading(temp)
            log_event('info', f'Reading recorded: {temp:.2f}°C')

            if temp >= TEMP_CRIT:
                log_event('critical', f'CRITICAL: Temperature {temp:.2f}°C exceeds {TEMP_CRIT}°C!')
            elif temp >= TEMP_WARN:
                log_event('warning', f'Warning: Temperature {temp:.2f}°C exceeds {TEMP_WARN}°C')

        time.sleep(10)
