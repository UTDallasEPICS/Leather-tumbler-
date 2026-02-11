# ph_sensor.py
# Low-level code to read pH from Atlas Surveyor pH analog board via ADS1115

import board
import busio
from adafruit_ads1x15.analog_in import AnalogIn
from adafruit_ads1x15.ads1115 import ADS1115, ADS

# Voltage (V) values from Atlas Scientific Surveyor pH Meter V3.0 datasheet
# Each entry in V_POINTS matches the same index in PH_POINTS.
PH_POINTS = [0, 1, 2, 3, 4, 5, 6, 7,
             8, 9, 10, 11, 12, 13, 14]

V_POINTS = [2.745, 2.570, 2.390, 2.210, 2.030,
            1.855, 1.680, 1.500, 1.330, 1.155,
            0.975, 0.800, 0.620, 0.445, 0.265]


def voltage_to_ph(v):
    """
    Convert analog voltage from the Surveyor pH board to pH
    using linear interpolation between datasheet points.

    v: voltage in volts (float)
    returns: pH value (float)
    """

    # If voltage is above highest point (very acidic water)
    if v >= V_POINTS[0]:
        return PH_POINTS[0]  # ~pH 0

    # If voltage is below lowest point (very basic water)
    if v <= V_POINTS[-1]:
        return PH_POINTS[-1]  # ~pH 14

    # Find two points in table that bracket this voltage.
    # Note: voltage decreases as pH increases.
    for i in range(len(V_POINTS) - 1):
        v_high = V_POINTS[i]        # higher voltage (lower pH)
        v_low = V_POINTS[i + 1]     # lower voltage (higher pH)

        if v_high >= v >= v_low:
            ph_low = PH_POINTS[i]
            ph_high = PH_POINTS[i + 1]

            # Linear interpolation between (v_high, ph_low) and (v_low, ph_high)
            if v_high == v_low:
                return (ph_low + ph_high) / 2.0

            fraction = (v_high - v) / (v_high - v_low)
            ph = ph_low + fraction * (ph_high - ph_low)
            return ph

    # Fallback (should not happen)
    return 7.0


class PHSensor:
    """
    Simple class to read pH from ADS1115 channel connected
    to the Surveyor pH board analog output.
    """

    def __init__(self, channel=ADS.P0, gain=1):
        # Create I2C bus on Raspberry Pi
        i2c = busio.I2C(board.SCL, board.SDA)

        # Create ADS1115 ADC object
        self.ads = ADS1115(i2c)

        # Set ADC gain: 1 ≈ 0–4.096 V, good for this board (0.265–3.0 V)
        self.ads.gain = gain

        # Create analog input channel (default: A0 / P0)
        self.channel = AnalogIn(self.ads, channel)

    def read_voltage(self):
        """Return sensor voltage in volts (float)."""
        return self.channel.voltage

    def read_ph(self):
        """Read voltage and convert to pH."""
        v = self.read_voltage()
        return voltage_to_ph(v)
