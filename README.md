# Leather Tumbler — pH sensor code inventory

This README documents the purpose and roles of the code and data files included in this workspace for the Leather Tumbler project. It also provides quick run instructions, dependency notes, and recommendations for consolidating and cleaning up the repository.

## Project summary

This repository contains multiple scripts to read and log pH from Atlas Scientific pH hardware. There are two main hardware approaches used in these files:

- Atlas EZO pH circuit using I2C (digital). Example scripts: `lel.py`, `phsensorcode.py`.
- Analog pH output read through an ADS1115 ADC (analog). Example scripts: `PHsensor.py`, `message (2).py`, `sensorPh.py`.

Additionally there are Arduino-style microcontroller sketches included (misnamed with `.py` extension) that convert analog readings to pH and print over serial.

## Files and roles

- `lel.py`
  - Role: Fully-featured Raspberry Pi CLI for Atlas Scientific EZO pH circuit (I2C address 99).
  - Key behavior: send/receive EZO I2C commands, parse responses, interactive commands, calibration routine (`calibration_mode()`), calibration logging (`ph_calibration_log.json`), continuous logging to `ph_continuous_log.csv`.
  - Use when: you have the EZO pH circuit connected to a Raspberry Pi and want calibration + logging + interactive control.

- `phsensorcode.py`
  - Role: Simpler Raspberry Pi CLI for Atlas EZO pH circuit using `smbus2`.
  - Key behavior: similar send/read I2C functions and interactive loop; fewer features than `lel.py` (no JSON calibration log or continuous CSV logging shown in the attached copy).
  - Use when: you want a minimal interactive tool for EZO communication.

- `message (2).py` (contains `ph_sensor.py`-style module)
  - Role: ADS1115-based analog pH conversion module for CircuitPython.
  - Key behavior: provides `voltage_to_ph(v)` using a datasheet lookup + linear interpolation and `PHSensor` class that wraps `adafruit_ads1x15` to get voltage and pH.
  - Use when: you have an Atlas Surveyor analog pH board connected to an ADS1115 ADC on a Raspberry Pi or CircuitPython environment.

- `PHsensor.py`
  - Role: Duplicate / near-duplicate of the ADS1115-based analog pH conversion module (same `voltage_to_ph` and `PHSensor` class).
  - Recommendation: consolidate with `message (2).py` into a single canonical module (e.g., `ph_ads1115.py`).

- `sensorPh.py`
  - Role: Minimal demo/test script using CircuitPython `ADS1115` to read `P0` and compute pH using a fixed formula: `pH = 7 + ((2.5 - voltage) / 0.18)`.
  - Use when: quick live testing or debugging of analog wiring and ADC readings.

- `pH_sensor2.py` and `pH_sensor (1).py`
  - Role: Microcontroller (Arduino-style) sketches written in embedded C/C++ style (they have `setup()` and `loop()`), but saved with `.py` extension.
  - Key behavior: read analog pin `A0`, convert raw ADC to voltage, use a formula to map voltage -> pH and print over serial.
  - Recommendation: rename these to `.ino` (or move them into a `firmware/` folder) so they don't get confused with Python scripts.

- `ph_sensor.py` (not attached separately)
  - Role: Appears in the workspace listing; likely another copy of the analog ADS1115 implementation. The content included in attachments seems to be duplicated across files. Consider opening it and confirming.

- `sensor.py` (listed, not attached)
  - Role: Not available in attachments. Open the file to confirm its role (could be higher-level orchestration or utilities).

- `temp_data.csv`
  - Role: Data file (CSV), likely contains logged temperature or experiment data. Not attached; open to preview if needed.

- `EPICS final report - Design_Document_Template_Su24 (1).pdf`
  - Role: Final project report / design document. Use it to cross-reference goals, hardware, and experimental results.

## Where scripts write data

- `ph_continuous_log.csv` — appended by `lel.py`'s `continuous_logging()` function when continuous logging is used.
- `ph_calibration_log.json` — written by `lel.py` via `log_calibration()` to record calibration events.

## Quick run instructions

Notes: these instructions assume the code runs on a Raspberry Pi or similar Linux SBC for the Python examples. Microcontroller sketches require their own toolchain (Arduino IDE / PlatformIO).

1. Atlas EZO (I2C) scripts — `lel.py`, `phsensorcode.py`

- Enable I2C on the Raspberry Pi (raspi-config → Interface Options → I2C).
- Install OS packages and Python dependencies:

```bash
# on Raspberry Pi (bash)
sudo apt update
sudo apt install -y python3-smbus i2c-tools
python3 -m pip install --user smbus2
```

- Run the interactive controller:

```bash
python3 lel.py
# or (minimal)
python3 phsensorcode.py
```

- Typical usage: type `R` to read, `Cal,mid`/`Cal,low`/`Cal,high` to calibrate, or type `cal` in `lel.py` to start guided calibration. Use CTRL+C to stop continuous logging.

2. ADS1115 analog scripts — `PHsensor.py`, `message (2).py`, `sensorPh.py`

- Install CircuitPython ADS1x15 library:

```bash
python3 -m pip install --user adafruit-circuitpython-ads1x15
```

- Run the test or module:

```bash
python3 PHsensor.py
# or import from another script
from message_2 import PHSensor  # or from ph_ads1115 import PHSensor (after consolidation)
```

- Wiring: ADS1115 connected via I2C to the Pi; analog pH board output to ADS1115 A0.

3. Microcontroller sketches — `pH_sensor2.py`, `pH_sensor (1).py`

- These are Arduino-style sketches. Rename to `pH_sensor.ino` and use the Arduino IDE or PlatformIO to build and flash to your microcontroller (ESP32/Arduino compatible board).
- Expect serial prints of pH once the board is powered and the probe is connected.

## Recommendations & next steps

1. Consolidation
   - Keep one canonical EZO/I2C script (recommend: `lel.py` since it has calibration logging and continuous logging). Consider renaming to `ph_ezo.py` and adding a short header and CLI usage.
   - Consolidate ADS1115 analog scripts into a single module `ph_ads1115.py` (export `PHSensor` and `voltage_to_ph`). Use `sensorPh.py` for a small example or CLI wrapper.

2. Rename microcontroller files
   - Move `pH_sensor2.py` and `pH_sensor (1).py` to `firmware/pH_sensor.ino` (or similar) so they are properly recognized as Arduino sketches.

3. Add dependency manifest
   - Add `requirements.txt` with at least:

```
smbus2
adafruit-circuitpython-ads1x15
```

4. Add a small top-level `README.md` (this file) — done.

5. Optionally: write a small wrapper script `read_and_log.py` that imports the appropriate sensor backend depending on detected hardware (I2C EZO vs ADS1115), so you have one canonical entrypoint.

6. Confirm missing files
   - If you want, I can open `sensor.py`, `ph_sensor.py` (if present separately), and `temp_data.csv` to include exact contents and merge duplicates.

## Hardware notes

- Atlas EZO pH circuit address: `99` (as used in `lel.py` and `phsensorcode.py`). Confirm yours with `i2cdetect -y 1`.
- Surveyor pH board analog output expected range used in `voltage_to_ph` tables and formulas: roughly 0.265–2.745 V in the provided datasheet values. The conversion differs by code file: table-based interpolation (preferred) vs simple linear formula (quick & dirty).

## Where to go from here

Tell me which of the following you'd like next and I will carry it out:

- Consolidate and rename duplicate files into a small canonical set and create `requirements.txt`.
- Rename Arduino sketches to `.ino` and create a `firmware/` folder.
- Add a small `read_and_log.py` wrapper that detects hardware and logs pH the same way across sensors.
- Open and summarize any file I didn't have content for (`sensor.py`, `ph_sensor.py`, `temp_data.csv`).

---
