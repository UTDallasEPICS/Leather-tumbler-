"""Run Schemathesis against a disposable mock API and save complete outputs."""

import base64
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import httpx
from security.config import AuthSettings
from security.service import AuthService


def main():
    root = Path(__file__).resolve().parents[2]
    reports = root / "docs/security/reports"
    with tempfile.TemporaryDirectory(prefix="dava-schema-") as directory:
        key = secrets.token_bytes(32)
        db_path = str(Path(directory) / "schema.db")
        auth = AuthService(db_path, AuthSettings(signing_key=key))
        password = secrets.token_urlsafe(24)
        auth.seed("schema-admin@example.com", "Schema Admin", password)
        token = auth.login("schema-admin@example.com", password, "seed")["access_token"]
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = {
            **os.environ,
            "AUTH_JWT_KEY": base64.b64encode(key).decode(),
            "SCHEMA_TEST_DB": db_path,
            "PYTHONPATH": str(root / "backend"),
        }
        # Fixed executable/arguments; no shell or user-supplied command.
        with (reports / "schemathesis-server.txt").open("w") as server_log:
            server = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "tests.schema_server:create",
                    "--factory",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                    "--no-proxy-headers",
                ],
                env=env,
                cwd=root / "backend",
                stdout=server_log,
                stderr=subprocess.STDOUT,
            )  # nosec B603
            try:
                base = f"http://127.0.0.1:{port}"
                for _ in range(100):
                    try:
                        schema = httpx.get(base + "/openapi.json", timeout=1)
                        if schema.status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.1)
                else:
                    raise RuntimeError("Schema server did not start")
                (reports / "openapi.json").write_text(
                    json.dumps(schema.json(), indent=2) + "\n"
                )
                codes = {}
                for mode in ("anonymous", "authenticated"):
                    command = [
                        str(Path(sys.executable).with_name("schemathesis")),
                        "run",
                        base + "/openapi.json",
                        "--phases",
                        "examples,coverage,fuzzing",
                        "--max-examples",
                        "20",
                        "--seed",
                        "9106",
                        "--workers",
                        "1",
                        "--checks",
                        "not_a_server_error,status_code_conformance,response_schema_conformance,content_type_conformance,negative_data_rejection,ignored_auth",
                        "--generation-database",
                        ":memory:",
                    ]
                    if mode == "authenticated":
                        # Logout/reuse is covered by pytest; do not revoke this run's shared credential.
                        command += [
                            "--header",
                            f"Authorization: Bearer {token}",
                            "--exclude-path",
                            "/api/auth/logout",
                        ]
                    with (reports / f"schemathesis-{mode}.txt").open("w") as output:
                        result = subprocess.run(
                            command,
                            env=env,
                            cwd=root,
                            stdout=output,
                            stderr=subprocess.STDOUT,
                            timeout=300,
                        )  # nosec B603
                    report = reports / f"schemathesis-{mode}.txt"
                    report.write_text(
                        report.read_text().replace(token, "<REDACTED_TEST_TOKEN>")
                    )
                    codes[mode] = result.returncode
                    print(mode, result.returncode, flush=True)
                (reports / "schemathesis-exit-codes.json").write_text(
                    json.dumps(codes, indent=2) + "\n"
                )
            finally:
                server.terminate()
                server.wait(timeout=15)


if __name__ == "__main__":
    main()
