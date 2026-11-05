"""Leather inspection server for the DAVA app.

The ESP32 controller can't run an image model, so this runs on a laptop or mini PC on the same Wi-Fi.
The app's Inspection page sends it photos and reads the results; set its address under
Connection > Inspection server.

    python service.py --model models/mvtec-leather            # http://0.0.0.0:8770

API (all under /api/vision):
    GET    /status                  model, quality metrics, sensitivity, counts
    PUT    /settings                {"threshold": 0.5}
    POST   /inspect                 multipart: photo, tumblerId?, runId?, stage?, note?
    GET    /inspections?limit=&tumblerId=
    PATCH  /inspections/{id}        {"label": "good" | defect type | null, "runId", "tumblerId", "stage", "note"}
    DELETE /inspections/{id}
    GET    /files/{name}            stored photos and heatmaps
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from inspector import Inspector, fit_width, overlay

HERE = Path(__file__).resolve().parent
MAX_UPLOAD = 15 * 1024 * 1024
LABEL_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")
FILE_RE = re.compile(r"^insp-\d+(-heat)?\.jpg$")
STAGES = {"soaking", "liming", "deliming", "pickling", "tanning", "finish"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS inspections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  INTEGER NOT NULL,
    tumbler_id  INTEGER,
    run_id      TEXT,
    stage       TEXT,
    score       REAL NOT NULL,
    defect_area REAL NOT NULL,
    label       TEXT,
    note        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS inspections_created ON inspections (created_at);
"""


class Store:
    def __init__(self, data_dir: Path):
        self.dir = data_dir
        self.files = data_dir / "images"
        self.files.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(data_dir / "inspections.db", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()
        self.settings_path = data_dir / "settings.json"

    def settings(self) -> dict[str, Any]:
        try:
            return json.loads(self.settings_path.read_text())
        except (OSError, ValueError):
            return {}

    def save_settings(self, s: dict[str, Any]) -> None:
        self.settings_path.write_text(json.dumps(s, indent=1))

    def row(self, id_: int) -> sqlite3.Row | None:
        return self.db.execute("SELECT * FROM inspections WHERE id = ?", (id_,)).fetchone()


def to_json(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "createdAt": r["created_at"],
        "tumblerId": r["tumbler_id"],
        "runId": r["run_id"],
        "stage": r["stage"],
        "score": r["score"],
        "defectArea": r["defect_area"],
        "label": r["label"],
        "note": r["note"],
        "imageUrl": f"/api/vision/files/insp-{r['id']}.jpg",
        "heatmapUrl": f"/api/vision/files/insp-{r['id']}-heat.jpg",
    }


class SettingsIn(BaseModel):
    threshold: float = Field(ge=0.05, le=0.95)


class PatchIn(BaseModel):
    label: str | None = None
    runId: str | None = None
    tumblerId: int | None = None
    stage: str | None = None
    note: str | None = Field(default=None, max_length=500)


def create_app(model_dir: Path, data_dir: Path) -> FastAPI:
    store = Store(data_dir)
    try:
        inspector: Inspector | None = Inspector(model_dir)
        load_error = None
    except Exception as e:  # noqa: BLE001 - reported through /status so the app can say what is wrong
        inspector, load_error = None, str(e)
    metrics_path = model_dir / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else None
    default_t = (metrics or {}).get("defaultThreshold", 0.5)

    app = FastAPI(title="DAVA leather inspection")
    # the app runs from the APK (capacitor://localhost, http://localhost) or a dev server, all on the LAN
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    def threshold() -> float:
        return float(store.settings().get("threshold", default_t))

    @app.get("/api/vision/status")
    def status() -> dict[str, Any]:
        c = store.db.execute(
            "SELECT COUNT(*) n, SUM(score >= ?) flagged, SUM(label IS NOT NULL) labelled FROM inspections", (threshold(),)
        ).fetchone()
        return {
            "ready": inspector is not None,
            "error": load_error,
            "threshold": threshold(),
            "defaultThreshold": default_t,
            "metrics": metrics,
            "counts": {"total": c["n"], "flagged": c["flagged"] or 0, "labelled": c["labelled"] or 0},
        }

    @app.put("/api/vision/settings")
    def put_settings(body: SettingsIn) -> dict[str, Any]:
        s = store.settings()
        s["threshold"] = round(body.threshold, 3)
        store.save_settings(s)
        return status()

    @app.post("/api/vision/inspect")
    async def inspect(
        photo: UploadFile = File(...),
        tumblerId: int | None = Form(None),
        runId: str | None = Form(None, max_length=80),
        stage: str | None = Form(None),
        note: str = Form("", max_length=500),
    ) -> dict[str, Any]:
        if inspector is None:
            raise HTTPException(503, f"No model loaded: {load_error}")
        if stage is not None and stage not in STAGES:
            raise HTTPException(422, f"Unknown stage {stage!r}")
        raw = await photo.read(MAX_UPLOAD + 1)
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "Photo is over 15 MB")
        try:
            image = Image.open(io.BytesIO(raw))
            image.load()
        except (UnidentifiedImageError, OSError):
            raise HTTPException(422, "That file isn't a photo the server can read") from None

        result = inspector.inspect(image)
        with store.lock:
            cur = store.db.execute(
                "INSERT INTO inspections (created_at, tumbler_id, run_id, stage, score, defect_area, note) VALUES (?,?,?,?,?,?,?)",
                (int(time.time() * 1000), tumblerId, runId or None, stage, result.score, result.defect_area, note),
            )
            store.db.commit()
            id_ = cur.lastrowid
        fit_width(image, 1280).save(store.files / f"insp-{id_}.jpg", quality=88)
        overlay(image, result.anomaly_map, 960).save(store.files / f"insp-{id_}-heat.jpg", quality=85)
        return to_json(store.row(id_))

    @app.get("/api/vision/inspections")
    def list_inspections(limit: int = 300, tumblerId: int | None = None) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 2000))
        if tumblerId is None:
            rows = store.db.execute("SELECT * FROM inspections ORDER BY created_at DESC LIMIT ?", (limit,))
        else:
            rows = store.db.execute(
                "SELECT * FROM inspections WHERE tumbler_id = ? ORDER BY created_at DESC LIMIT ?", (tumblerId, limit)
            )
        return [to_json(r) for r in rows]

    @app.patch("/api/vision/inspections/{id_}")
    def patch_inspection(id_: int, body: PatchIn) -> dict[str, Any]:
        if store.row(id_) is None:
            raise HTTPException(404, "No such inspection")
        sent = body.model_dump(exclude_unset=True)
        if "label" in sent and sent["label"] is not None and not LABEL_RE.match(sent["label"]):
            raise HTTPException(422, "Label must be a short lowercase id like 'good' or 'fold'")
        if sent.get("stage") is not None and sent["stage"] not in STAGES:
            raise HTTPException(422, f"Unknown stage {sent['stage']!r}")
        cols = {"label": "label", "runId": "run_id", "tumblerId": "tumbler_id", "stage": "stage", "note": "note"}
        sets = [(cols[k], v if k != "note" else (v or "")) for k, v in sent.items()]
        if sets:
            with store.lock:
                store.db.execute(
                    f"UPDATE inspections SET {', '.join(f'{c} = ?' for c, _ in sets)} WHERE id = ?",  # noqa: S608 - fixed column names
                    (*[v for _, v in sets], id_),
                )
                store.db.commit()
        return to_json(store.row(id_))

    @app.delete("/api/vision/inspections/{id_}")
    def delete_inspection(id_: int) -> dict[str, bool]:
        with store.lock:
            store.db.execute("DELETE FROM inspections WHERE id = ?", (id_,))
            store.db.commit()
        for suffix in ("", "-heat"):
            (store.files / f"insp-{id_}{suffix}.jpg").unlink(missing_ok=True)
        return {"success": True}

    @app.get("/api/vision/files/{name}")
    def file(name: str) -> FileResponse:
        if not FILE_RE.match(name) or not (store.files / name).is_file():
            raise HTTPException(404, "Not found")
        return FileResponse(store.files / name, media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})

    return app


def main() -> None:
    import uvicorn

    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, default=HERE / "models" / "mvtec-leather")
    p.add_argument("--data", type=Path, default=HERE / "data")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8770)
    args = p.parse_args()
    uvicorn.run(create_app(args.model.resolve(), args.data.resolve()), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
