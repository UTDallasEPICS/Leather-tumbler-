"""SensorHub server entrypoint.

Thin wrapper around uvicorn that preserves the legacy CLI surface:

    python main.py --mock
    python main.py --config config.json
    python main.py --port 9000

Real API lives in `app.py` (FastAPI). `/api/*` for request/response, `/ws` for
broadcast-only sensor streaming.
"""

import argparse

import uvicorn

from app import create_app
from config import load_config


def main() -> None:
    parser = argparse.ArgumentParser(description="SensorHub server")
    parser.add_argument("--host", default=None, help="Bind address")
    parser.add_argument("--port", type=int, default=None, help="Server port")
    parser.add_argument("--mock", action="store_true", help="Use mock sensor/relay")
    parser.add_argument("--db", default="sensorhub.db", help="SQLite database path")
    parser.add_argument("--config", default=None, help="Path to config.json")
    parser.add_argument("--shelly-ip", default=None, help="Shelly Pro 2 IP address")
    args = parser.parse_args()

    cfg = load_config(args.config)
    host = args.host or cfg.get("server_host", "0.0.0.0")
    port = args.port or cfg.get("server_port", 8765)

    app = create_app(
        config_path=args.config,
        mock=args.mock,
        shelly_ip=args.shelly_ip,
        db_path=args.db,
    )

    uvicorn.run(app, host=host, port=port, log_config=None)


if __name__ == "__main__":
    main()
