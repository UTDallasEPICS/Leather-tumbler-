"""Config loading — JSON file with sensible defaults."""

import json
import logging
from pathlib import Path

log = logging.getLogger("sensorhub.config")


def load_config(path: str | None) -> dict:
    if path is None:
        return {}
    p = Path(path)
    if not p.exists():
        log.warning("Config file not found: %s", path)
        return {}
    with open(p) as f:
        return json.load(f)
