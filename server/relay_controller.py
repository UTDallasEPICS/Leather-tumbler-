"""Shelly Pro 2 relay controller for motor start/stop.

Uses the Shelly Gen2 RPC API over HTTP. Falls back to mock mode
when no Shelly IP is configured (for development).
"""
#this whole code is for the shelly that connects to the main electrical system of the tumbler, main suse is start and stop oof the motor.

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

SHELLY_TIMEOUT = 5.0  # seconds
SHELLY_RETRIES = 2


class RelayController:
    """Controls the tumbler motor via a Shelly Pro 2 relay (channel 0)."""

    def __init__(self, shelly_ip: str | None = None):
        self.shelly_ip = shelly_ip
        self.is_on: bool = False
        self._mock = not shelly_ip

        if self._mock:
            log.info("Relay running in MOCK mode (no Shelly IP configured)")
        else:
            log.info("Relay configured for Shelly at %s", shelly_ip)

    async def start(self) -> bool:
        """Turn the relay ON (start motor)."""
        if self._mock:
            self.is_on = True
            log.info("Relay ON (mock) — motor started")
            return True
        return await self._set_switch(True)

    async def stop(self) -> bool:
        """Turn the relay OFF (stop motor)."""
        if self._mock:
            self.is_on = False
            log.info("Relay OFF (mock) — motor stopped")
            return True
        return await self._set_switch(False)

    async def get_status(self) -> dict:
        """Query Shelly for actual relay status."""
        if self._mock:
            return {"output": self.is_on, "source": "mock"}

        url = f"http://{self.shelly_ip}/rpc/Switch.GetStatus?id=0"
        try:
            async with httpx.AsyncClient(timeout=SHELLY_TIMEOUT) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    self.is_on = data.get("output", False)
                    return {"output": self.is_on, "source": "shelly"}
                log.warning("Shelly status returned %d", resp.status_code)
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            log.error("Cannot get Shelly status: %s", e)

        return {"output": self.is_on, "source": "cached", "error": True}

    async def _set_switch(self, on: bool) -> bool:
        """Send switch command to Shelly with retries on timeout."""
        url = f"http://{self.shelly_ip}/rpc/Switch.Set?id=0&on={'true' if on else 'false'}"

        for attempt in range(SHELLY_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=SHELLY_TIMEOUT) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        self.is_on = on
                        log.info("Relay %s via Shelly", "ON" if on else "OFF")
                        return True
                    log.warning("Shelly returned %d", resp.status_code)
            except httpx.TimeoutException:
                log.warning(
                    "Shelly timeout (attempt %d/%d)",
                    attempt + 1, SHELLY_RETRIES + 1,
                )
                await asyncio.sleep(0.5)
            except httpx.ConnectError:
                log.warning(
                    "Cannot reach Shelly at %s (attempt %d/%d)",
                    self.shelly_ip, attempt + 1, SHELLY_RETRIES + 1,
                )
                await asyncio.sleep(0.5)
                continue

        return False

    @property
    def state(self) -> bool:
        """Return current relay state."""
        return self.is_on
