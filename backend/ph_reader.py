"""Atlas Scientific analog pH sensor via ADS1115 ADC over I2C.

Signal chain: pH probe -> Atlas Scientific analog board (0-3V output) ->
ADS1115 ADC (I2C 0x48) -> Raspberry Pi.
"""

import logging
import random

log = logging.getLogger(__name__)

ADS1115_ADDRESS = 0x48
ADS1115_CHANNEL = 0  # 0=A0, 1=A1, 2=A2, 3=A3
PH_VOLTAGE_MIN = 0.0
PH_VOLTAGE_MAX = 3.0
PH_MIN = 0.0
PH_MAX = 14.0


class PhReader:
    """Read pH from an Atlas analog board via ADS1115.

    If hardware is unavailable (or mock=True), values are simulated.
    """

    def __init__(self, mock: bool = False):
        self.mock = mock
        self.auto_mock = False
        self._ads = None
        self._channel = None
        self._mock_ph = 7.0

        if mock:
            log.info("pH sensor running in MOCK mode")
            return

        try:
            import board
            import busio
            import adafruit_ads1x15.ads1115 as ADS
            from adafruit_ads1x15.analog_in import AnalogIn

            i2c = busio.I2C(board.SCL, board.SDA)
            self._ads = ADS.ADS1115(i2c, address=ADS1115_ADDRESS)
            self._ads.gain = 1  # +/- 4.096V range
            self._channel = AnalogIn(self._ads, ADS1115_CHANNEL)
            log.info(
                "pH sensor initialized via ADS1115 at 0x%02X, channel A%d",
                ADS1115_ADDRESS, ADS1115_CHANNEL,
            )
        except (ImportError, OSError, IOError, ValueError) as exc:
            log.error(
                "pH sensor setup failed: %s. Falling back to mock mode.",
                exc,
            )
            self.mock = True
            self.auto_mock = True

    def read_ph(self) -> float | None:
        """Return current pH, or None on read/parse failure."""
        if self.mock:
            return self._mock_read()
        return self._hardware_read()

    def _hardware_read(self) -> float | None:
        try:
            voltage = self._channel.voltage
            # Atlas analog board mapping used in the reference commit:
            # 0V -> pH 14, 3V -> pH 0.
            ph = PH_MAX - ((voltage - PH_VOLTAGE_MIN) / (PH_VOLTAGE_MAX - PH_VOLTAGE_MIN)) * (PH_MAX - PH_MIN)
            ph = max(PH_MIN, min(PH_MAX, ph))
            return round(ph, 2)
        except (OSError, IOError) as exc:
            log.error("ADS1115 read failed for pH sensor: %s", exc)
            return None
        except (ValueError, IndexError) as exc:
            log.error("Failed to convert pH voltage: %s", exc)
            return None

    def _mock_read(self) -> float:
        drift = random.uniform(-0.1, 0.1)
        self._mock_ph = max(PH_MIN, min(PH_MAX, self._mock_ph + drift))
        return round(self._mock_ph, 2)
