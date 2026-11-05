"""Run the exported leather model on one photo: anomaly score, defect map and a heatmap overlay.

Only needs onnxruntime, numpy, Pillow and OpenCV, so the same code runs on a laptop, a Pi or a mini PC
without PyTorch or Anomalib installed.

Scores come out of the model already scaled so that 0.5 is the threshold Anomalib picked on the
validation photos. The threshold the app sets is in the same 0-1 scale.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

# a pixel counts toward the defect area when its scaled anomaly value is at or above this
PIXEL_THRESHOLD = 0.5


@dataclass
class Result:
    score: float
    anomaly_map: np.ndarray  # H x W, 0-1 scale, at the model's input size
    defect_area: float  # share of the photo at or above PIXEL_THRESHOLD
    ms: float


class Inspector:
    def __init__(self, model_dir: Path):
        self.model_dir = Path(model_dir)
        onnx_path = next(self.model_dir.glob("**/model.onnx"), None)
        if onnx_path is None:
            raise FileNotFoundError(f"No model.onnx under {self.model_dir}. Run train.py first.")
        self.session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        inp = self.session.get_inputs()[0]
        self.input_name = inp.name
        h, w = inp.shape[2], inp.shape[3]
        self.size = (int(w) if isinstance(w, int) else 256, int(h) if isinstance(h, int) else 256)
        self.outputs = [o.name for o in self.session.get_outputs()]
        info = self.model_dir / "train_metrics.json"
        self.info = json.loads(info.read_text()) if info.exists() else {}

    def inspect(self, image: Image.Image) -> Result:
        img = ImageOps.exif_transpose(image).convert("RGB").resize(self.size, Image.BILINEAR)
        x = np.asarray(img, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        t0 = time.perf_counter()
        out = dict(zip(self.outputs, self.session.run(None, {self.input_name: x})))
        ms = (time.perf_counter() - t0) * 1000
        amap = np.squeeze(out["anomaly_map"]).astype(np.float32)
        score = float(np.squeeze(out["pred_score"]))
        return Result(score=score, anomaly_map=amap, defect_area=float((amap >= PIXEL_THRESHOLD).mean()), ms=ms)


def fit_width(image: Image.Image, max_side: int) -> Image.Image:
    img = ImageOps.exif_transpose(image).convert("RGB")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return img


def overlay(image: Image.Image, anomaly_map: np.ndarray, max_side: int = 640) -> Image.Image:
    """The photo with the anomaly map laid over it: clear where it looks normal, hot where it doesn't."""
    img = fit_width(image, max_side)
    w, h = img.size
    amap = cv2.resize(np.clip(anomaly_map, 0, 1), (w, h), interpolation=cv2.INTER_LINEAR)
    colour = cv2.applyColorMap((amap * 255).astype(np.uint8), cv2.COLORMAP_JET)[:, :, ::-1].astype(np.float32)
    # fade the colour in from 0.25 up, so normal leather stays readable under the map
    alpha = (np.clip((amap - 0.25) / 0.5, 0, 1) * 0.65)[:, :, None]
    base = np.asarray(img, dtype=np.float32)
    blended = base * (1 - alpha) + colour * alpha
    # outline the defect area
    mask = (amap >= PIXEL_THRESHOLD).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.ascontiguousarray(blended.clip(0, 255).astype(np.uint8))
    cv2.drawContours(out, contours, -1, (255, 255, 255), max(1, w // 320))
    return Image.fromarray(out)
