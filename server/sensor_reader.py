"""DS18B20 1-Wire temperature sensor reader."""

import glob
import logging
import random

log = logging.getLogger(__name__)

W1_DEVICES_PATH = "/sys/bus/w1/devices/"


class DS18B20Reader:
    """Reads temperature from a DS18B20 sensor via the 1-Wire interface.

    If no hardware sensor is found (or mock=True), generates simulated
    temperature values that drift realistically between 20-65 °C.
    """

    def __init__(self, device_id: str | None = None, mock: bool = False, gpio_pin: int = 4):
        self.mock = mock
        self.device_path: str | None = None
        self._mock_temp = 25.0  # starting simulated temperature

        if mock:
            log.info("Sensor running in MOCK mode")
            return

        log.info("Configured for 1-Wire on GPIO pin %d", gpio_pin)

        # Auto-detect sensor
        if device_id:
            self.device_path = f"{W1_DEVICES_PATH}{device_id}/w1_slave"
        else:
            matches = glob.glob(f"{W1_DEVICES_PATH}28-*")
            if matches:
                self.device_path = f"{matches[0]}/w1_slave"
                log.info("Auto-detected sensor: %s", matches[0])
            else:
                log.warning("No DS18B20 sensor found — falling back to mock mode")
                self.mock = True

    def read_temperature(self) -> float | None:
        """Read current temperature in °C. Returns None on failure."""
        if self.mock:
            return self._mock_read()
        return self._hardware_read()

    def _hardware_read(self) -> float | None:
        """Read the real hardware sensor file."""
        try:
            with open(self.device_path, "r") as f:
                lines = f.readlines()

            # Line 1 must end with "YES" (valid CRC)
            if not lines[0].strip().endswith("YES"):
                log.warning("CRC check failed")
                return None

            # Line 2 contains t=XXXXX (millidegrees)
            pos = lines[1].find("t=")
            if pos == -1:
                log.warning("Temperature value not found in sensor output")
                return None

            raw = int(lines[1][pos + 2 :])
            return round(raw / 1000.0, 2)

        except (IOError, IndexError, ValueError) as e:
            log.error("Failed to read sensor: %s", e)
            return None

    def _mock_read(self) -> float:
        """Generate a simulated temperature with gradual drift."""
        drift = random.uniform(-0.5, 0.7)  # slight upward bias (heating)
        self._mock_temp = max(15.0, min(70.0, self._mock_temp + drift))
        return round(self._mock_temp, 2)
