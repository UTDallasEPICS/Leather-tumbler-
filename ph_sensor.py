# Surveyor pH Meter V3.0 with ADS1115 and Raspberry Pi 5
# Using smbus2 only (no Blinka/lgpio)
# Install smbus2: pip install smbus2

import smbus2
import time

# ----- ADS1115 I2C setup -----
ADS1115_ADDRESS = 0x48  # Default I2C address
bus = smbus2.SMBus(1)   # I2C bus 1

# ADS1115 Registers
REG_CONVERSION = 0x00
REG_CONFIG = 0x01

# Config constants (single-ended, AIN0, gain=1)
CONFIG_OS_SINGLE = 0x8000
CONFIG_MUX = {
    0: 0x4000,  # AIN0
    1: 0x5000,  # AIN1
    2: 0x6000,  # AIN2
    3: 0x7000,  # AIN3
}
CONFIG_PGA_4_096V = 0x0200
CONFIG_MODE_SINGLE = 0x0100
CONFIG_DR_128SPS = 0x0080
CONFIG_COMP_DISABLE = 0x0003
CONFIG_DEFAULT = CONFIG_OS_SINGLE | CONFIG_MUX[0] | CONFIG_PGA_4_096V | CONFIG_MODE_SINGLE | CONFIG_DR_128SPS | CONFIG_COMP_DISABLE

# ----- Calibration variables -----
V_OFFSET = 2.5  # Will be calculated
MV_PER_PH = -0.18  # Will be calculated

# ----- Functions -----
def read_adc(channel=0):
    """Read raw ADC value from given channel (0-3)"""
    if channel not in [0, 1, 2, 3]:
        raise ValueError("Channel must be 0-3")
    config = CONFIG_OS_SINGLE | CONFIG_MUX[channel] | CONFIG_PGA_4_096V | CONFIG_MODE_SINGLE | CONFIG_DR_128SPS | CONFIG_COMP_DISABLE
    # Write config
    bus.write_i2c_block_data(ADS1115_ADDRESS, REG_CONFIG, [(config >> 8) & 0xFF, config & 0xFF])
    time.sleep(0.1)  # Wait for conversion
    # Read conversion register
    data = bus.read_i2c_block_data(ADS1115_ADDRESS, REG_CONVERSION, 2)
    raw = (data[0] << 8) | data[1]
    if raw > 0x7FFF:
        raw -= 0x10000
    return raw

def voltage_from_raw(raw):
    """Convert raw ADC to voltage"""
    return raw * 4.096 / 32768  # Gain=1 => ±4.096V

def calibrate_ph():
    """Calibrate pH sensor using at least 2 standard buffers"""
    global V_OFFSET, MV_PER_PH
    print("---- pH Sensor Calibration ----")
    print("You will need standard pH buffers (e.g., 4.0, 7.0, 10.0)")
    buffer_ph_values = []
    buffer_voltages = []

    num_buffers = int(input("How many calibration buffers do you want to use (2 or 3)? "))
    for i in range(num_buffers):
        ph = float(input(f"Enter pH value of buffer {i+1}: "))
        input(f"Place the probe in pH {ph} buffer and press Enter to read voltage...")
        # Average multiple readings
        readings = []
        for _ in range(5):
            raw = read_adc(0)
            readings.append(voltage_from_raw(raw))
            time.sleep(1)
        avg_voltage = sum(readings) / len(readings)
        print(f"Average voltage for pH {ph}: {avg_voltage:.3f} V\n")
        buffer_ph_values.append(ph)
        buffer_voltages.append(avg_voltage)

    # Calculate slope and offset
    if num_buffers >= 2:
        slope = (buffer_voltages[1] - buffer_voltages[0]) / (buffer_ph_values[1] - buffer_ph_values[0])
        offset = buffer_voltages[0] - slope * (buffer_ph_values[0] - 7)
        V_OFFSET = offset
        MV_PER_PH = slope
        print(f"Calibration complete. V_OFFSET: {V_OFFSET:.3f} V, MV_PER_PH: {MV_PER_PH:.3f} V/pH")

def voltage_to_ph(voltage):
    """Convert voltage to pH using calibration"""
    return 7 + ((voltage - V_OFFSET) / MV_PER_PH)

# ----- Run calibration -----
calibrate_ph()

# ----- Main loop -----
try:
    while True:
        raw = read_adc(0)
        voltage = voltage_from_raw(raw)
        ph = voltage_to_ph(voltage)
        print(f"Voltage: {voltage:.3f} V | pH: {ph:.2f}")
        time.sleep(1)

except KeyboardInterrupt:
    print("Exiting program")
