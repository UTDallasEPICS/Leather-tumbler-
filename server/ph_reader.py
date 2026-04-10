"""Atlas Scientific analog pH sensor via ADS1115 ADC over I2C.

Signal chain: pH probe → Atlas Scientific analog board (0-3V output) → ADS1115 ADC (I2C 0x48) → Pi
The analog board outputs a voltage proportional to pH: 0V = pH 0, 3V = pH 14.
"""

import logging
import random

log = logging.getLogger(__name__)

ADS1115_ADDRESS = 0x48  # I2C address of ADS1115
ADS1115_CHANNEL = 0  # A0 by default (0=A0, 1=A1, 2=A2, 3=A3)
# Atlas Scientific analog board: 0V = pH 0, ~3.0V = pH 14
PH_VOLTAGE_MIN = 0.0  # voltage at pH 0
PH_VOLTAGE_MAX = 3.0  # voltage at pH 14
PH_MIN = 0.0
PH_MAX = 14.0


class PhReader:
    """Reads pH from an Atlas Scientific analog board via ADS1115 ADC.

    If no hardware is available (or mock=True), generates simulated
    pH values that drift realistically around neutral (7.0).
    """

    def __init__(self, mock: bool = False):
        self.mock = mock
        self.auto_mock = False  # True if mock was triggered by hardware failure
        self._ads = None
        self._channel = None
        self._mock_ph = 7.0  # starting simulated pH

        if mock:
            log.info("pH sensor running in MOCK mode (explicitly requested)")
            return

        try:
            import board
            import busio
            import adafruit_ads1x15.ads1115 as ADS
            from adafruit_ads1x15.analog_in import AnalogIn

            i2c = busio.I2C(board.SCL, board.SDA)
            self._ads = ADS.ADS1115(i2c, address=ADS1115_ADDRESS)
            # Set gain to ±4.096V range (GAIN_1) for 0-3V readings
            self._ads.gain = 1

            # Select the configured channel (use integer 0-3 for A0-A3)
            self._channel = AnalogIn(self._ads, ADS1115_CHANNEL)

            log.info(
                "pH sensor initialized via ADS1115 at 0x%02X, channel A%d",
                ADS1115_ADDRESS, ADS1115_CHANNEL,
            )
        except (ImportError, OSError, IOError, ValueError) as e:
            log.error(
                "pH sensor hardware FAILED: %s — falling back to mock. "
                "Check: I2C enabled (dtparam=i2c_arm=on), user in i2c group, ADS1115 wired to 0x48",
                e,
            )
            self.mock = True
            self.auto_mock = True

    def read_ph(self) -> float | None:
        """Read current pH value. Returns None on failure."""
        if self.mock:
            return self._mock_read()
        return self._hardware_read()

    def _hardware_read(self) -> float | None:
        """Read voltage from ADS1115 and convert to pH."""
        try:
            voltage = self._channel.voltage

            # Convert voltage to pH (inverted linear mapping)
            # Atlas analog board: 0V = pH 14 (alkaline), 3V = pH 0 (acidic)
            ph = PH_MAX - ((voltage - PH_VOLTAGE_MIN) / (PH_VOLTAGE_MAX - PH_VOLTAGE_MIN)) * (PH_MAX - PH_MIN)
            ph = max(PH_MIN, min(PH_MAX, ph))
            return round(ph, 2)

        except (OSError, IOError) as e:
            log.error("ADS1115 read failed for pH sensor: %s", e)
            return None
        except (ValueError, IndexError) as e:
            log.error("Failed to convert pH voltage: %s", e)
            return None

    def _mock_read(self) -> float:
        """Generate a simulated pH with gradual drift around neutral."""
        drift = random.uniform(-0.1, 0.1)
        self._mock_ph = max(0.0, min(14.0, self._mock_ph + drift))
        return round(self._mock_ph, 2)
