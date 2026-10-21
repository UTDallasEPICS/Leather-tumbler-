"""Disposable backend for browser integration verification; no real SMTP/hardware."""

import json
from pathlib import Path
import secrets
import tempfile
import uvicorn
from app import create_app
from security.config import AuthSettings
from security.service import AuthService

with tempfile.TemporaryDirectory(prefix="dava-browser-") as directory:
    settings = AuthSettings(signing_key=secrets.token_bytes(32))
    db_path = str(Path(directory) / "browser.db")
    password = secrets.token_urlsafe(24)
    auth = AuthService(db_path, settings)
    auth.seed("browser-admin@example.com", "Browser Admin", password)
    credentials = Path("/tmp/tumbler-auth-browser.json")
    credentials.touch(mode=0o600)
    credentials.write_text(
        json.dumps({"email": "browser-admin@example.com", "password": password})
    )
    try:
        uvicorn.run(
            create_app(mock=True, db_path=db_path, auth_settings=settings),
            host="127.0.0.1",
            port=8766,
            proxy_headers=False,
            log_level="warning",
        )
    finally:
        credentials.unlink(missing_ok=True)
