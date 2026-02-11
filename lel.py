#!/usr/bin/env python3
import smbus2
import time
import json
import os
from datetime import datetime

ADDRESS = 99
bus = smbus2.SMBus(1)
LOG_FILE = "ph_calibration_log.json"

# Load or create log file
def load_log():
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r") as f:
            return json.load(f)
    return []

def save_log(log):
    with open(LOG_FILE, "w") as f:
        json.dump(log, f, indent=4)

# Send I2C command
def send_command(cmd):
    data = list(cmd.encode("utf-8"))
    bus.write_i2c_block_data(ADDRESS, data[0], data[1:])

# Read EZO response
def read_response(delay=0.3):
    time.sleep(delay)

    try:
        response = bus.read_i2c_block_data(ADDRESS, 0, 20)
    except:
        return None, "I2C read error"

    code = response[0]

    chars = []
    for byte in response[1:]:
        if byte == 0:
            break
        chars.append(chr(byte))

    return code, "".join(chars)

# Decode EZO status code
def decode_status(code):
    return {
        1: "Success",
        2: "Failed",
        254: "Pending",
        255: "No Data"
    }.get(code, f"Unknown code: {code}")

# Take reading and return float
def take_reading():
    send_command("R")
    code, data = read_response(0.815)
    try:
        return float(data)
    except:
        return None

# Log calibration event
def log_calibration(step, buffer_val, before, after):
    log = load_log()
    log.append({
        "timestamp": datetime.now().isoformat(),
        "step": step,
        "buffer": buffer_val,
        "reading_before": before,
        "reading_after": after
    })
    save_log(log)

# Calibration routine
def calibration_mode():
    print("\n=== Calibration Mode ===")
    print("Follow steps exactly. Rinse probe between buffers.\n")

    # ---- MID CAL (7.00) ----
    input("Place probe in pH 7.00 buffer and press ENTER...")
    before = take_reading()
    print(f"Reading before calibration: {before}")

    send_command("Cal,mid,7.00")
    code, _ = read_response(1.0)
    print(decode_status(code))

    after = take_reading()
    print(f"Reading after calibration: {after}")
    log_calibration("mid", 7.00, before, after)

    # ---- LOW CAL (4.00) ----
    input("Rinse probe, place in pH 4.00 buffer, then press ENTER...")
    before = take_reading()
    print(f"Reading before calibration: {before}")

    send_command("Cal,low,4.00")
    code, _ = read_response(1.0)
    print(decode_status(code))

    after = take_reading()
    print(f"Reading after calibration: {after}")
    log_calibration("low", 4.00, before, after)

    # ---- OPTIONAL HIGH CAL ----
    choice = input("Do high calibration at pH 10? (y/n): ").lower()
    if choice == "y":
        input("Rinse, place in pH 10.00 buffer, press ENTER...")
        before = take_reading()

        send_command("Cal,high,10.00")
        code, _ = read_response(1.0)
        print(decode_status(code))

        after = take_reading()
        print(f"Reading after calibration: {after}")
        log_calibration("high", 10.00, before, after)

    print("\nCalibration Complete.")

import csv

# Continuous logging function
def continuous_logging(interval=2):
    print(f"Starting continuous logging every {interval} seconds.")
    print("Press CTRL+C to stop.")

    filename = "ph_continuous_log.csv"
    file_exists = os.path.isfile(filename)

    with open(filename, "a", newline="") as csvfile:
        writer = csv.writer(csvfile)

        if not file_exists:
            writer.writerow(["timestamp", "pH_reading"])

        try:
            while True:
                reading = take_reading()
                timestamp = datetime.now().isoformat()
                writer.writerow([timestamp, reading])
                csvfile.flush()
                print(f"{timestamp}  pH={reading}")
                time.sleep(interval)
        except KeyboardInterrupt:
            print("Continuous logging stopped.")

# Main interactive loop
def main():
    print("Atlas Scientific pH EZO — Raspberry Pi Mode")
    print("Commands: normal commands (R, Sleep, etc.) or type 'cal' for calibration mode.")

    while True:
        cmd = input("> ").strip()

        if cmd.lower() == "cal":
            calibration_mode()
            continue

        # Normal command handling
        if cmd.lower().startswith("c") or cmd.lower().startswith("r"):
            delay = 0.815
        else:
            delay = 0.25

        send_command(cmd)

        if cmd.lower() == "sleep":
            print("Sleeping—no response expected.")
            continue

        code, data = read_response(delay)
        print(decode_status(code))
        if data:
            print(data)

if __name__ == "__main__":
    main()
