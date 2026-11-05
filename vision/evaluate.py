"""Judge a trained model on the photos train.py held back, and save heatmap samples.

    python evaluate.py models/mvtec-leather [--app-demo]

Writes into the model folder:
    metrics.json        what the app's "How good is it" panel reads: AUROC and every held-back photo's score,
                        so the app can show catch rate and false alarms for any sensitivity setting
    samples/            photo + heatmap pairs per defect type, and index.json describing them
    contact-sheet.jpg   the samples side by side, for a quick look
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from sklearn.metrics import roc_auc_score

from inspector import Inspector, fit_width, overlay

SAMPLE_SIDE = 320


def kind_of(path: Path, label: int) -> str:
    return "good" if label == 0 else path.parent.name.lower()


def spread(items: list, n: int) -> list:
    """n items evenly spaced through a sorted list (always including both ends)."""
    if len(items) <= n:
        return items
    idx = np.linspace(0, len(items) - 1, n).round().astype(int)
    return [items[i] for i in dict.fromkeys(idx)]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("model_dir", type=Path)
    p.add_argument("--per-type", type=int, default=3, help="samples kept per defect type")
    p.add_argument("--good", type=int, default=6, help="samples kept of good leather")
    p.add_argument("--app-demo", action="store_true", help="also copy metrics + samples into the app's public/vision-demo for Demo Mode")
    args = p.parse_args()

    model_dir: Path = args.model_dir.resolve()
    split = json.loads((model_dir / "split.json").read_text())
    train = json.loads((model_dir / "train_metrics.json").read_text())
    insp = Inspector(model_dir)

    rows = []
    for item in split["test"]:
        path = Path(item["path"])
        with Image.open(path) as im:
            r = insp.inspect(im)
        rows.append({"path": path, "type": kind_of(path, item["label"]), "label": item["label"], "score": r.score, "area": r.defect_area, "ms": r.ms, "map": r.anomaly_map})

    labels = [r["label"] for r in rows]
    scores = [r["score"] for r in rows]
    auroc = roc_auc_score(labels, scores) if len(set(labels)) == 2 else None

    t = 0.5
    tp = sum(1 for r in rows if r["label"] == 1 and r["score"] >= t)
    fn = sum(1 for r in rows if r["label"] == 1 and r["score"] < t)
    fp = sum(1 for r in rows if r["label"] == 0 and r["score"] >= t)
    tn = sum(1 for r in rows if r["label"] == 0 and r["score"] < t)

    metrics = {
        "model": {
            "name": "PatchCore",
            "backbone": train.get("backbone"),
            "trainedOn": "MVTec AD leather" if split["source"] == "mvtec" else "DAVA leather photos",
            "trainImages": split["train_images"],
            "imageSize": train.get("image_size"),
            "fitSeconds": train.get("fit_seconds"),
            "trainedAt": datetime.fromtimestamp((model_dir / "split.json").stat().st_mtime, timezone.utc).isoformat(),
        },
        "defaultThreshold": t,
        "test": {"images": len(rows), "good": labels.count(0), "defect": labels.count(1), "thresholdPickedOn": split["val_images"]},
        "imageAUROC": auroc,
        "pixelAUROC": train["metrics"].get("pixel_AUROC"),
        "inferenceMs": round(statistics.median(r["ms"] for r in rows[1:] or rows), 1),
        "scores": [{"type": r["type"], "score": round(r["score"], 4)} for r in rows],
    }
    (model_dir / "metrics.json").write_text(json.dumps(metrics, indent=1))

    # ---- samples: a spread of scores for every type, so the demo shows hits and misses honestly
    out = model_dir / "samples"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.jpg"):
        old.unlink()
    picked = []
    for kind in sorted({r["type"] for r in rows}):
        group = sorted((r for r in rows if r["type"] == kind), key=lambda r: -r["score"])
        picked += spread(group, args.good if kind == "good" else args.per_type)
    index = []
    for r in picked:
        stem = f"{r['type']}-{r['path'].stem}"
        with Image.open(r["path"]) as im:
            fit_width(im, SAMPLE_SIDE).save(out / f"{stem}.jpg", quality=82)
            overlay(im, r["map"], SAMPLE_SIDE).save(out / f"{stem}-heat.jpg", quality=82)
        index.append({"id": stem, "type": r["type"], "score": round(r["score"], 4), "area": round(r["area"], 4)})
    (out / "index.json").write_text(json.dumps(index, indent=1))

    # ---- contact sheet
    cell = 200
    sheet = Image.new("RGB", (cell * 4, (len(index) + 1) // 2 * (cell + 22)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, s in enumerate(index):
        x, y = (i % 2) * cell * 2, (i // 2) * (cell + 22)
        for j, suffix in enumerate(("", "-heat")):
            with Image.open(out / f"{s['id']}{suffix}.jpg") as im:
                sheet.paste(im.resize((cell, cell)), (x + j * cell, y))
        verdict = "DEFECT" if s["score"] >= t else "ok"
        draw.text((x + 4, y + cell + 4), f"{s['type']}  score {s['score']:.2f}  -> {verdict}", fill="black")
    sheet.save(model_dir / "contact-sheet.jpg", quality=85)

    # ---- console summary
    print(f"Held-back photos: {len(rows)} ({labels.count(0)} good, {labels.count(1)} defective)")
    if auroc is not None:
        print(f"Image AUROC {auroc:.3f}   pixel AUROC {metrics['pixelAUROC']:.3f}")
    print(f"At threshold {t}: caught {tp}/{tp + fn} defects, {fp}/{fp + tn} false alarms on good leather")
    for kind in sorted({r["type"] for r in rows} - {"good"}):
        g = [r for r in rows if r["type"] == kind]
        print(f"  {kind:8s} caught {sum(r['score'] >= t for r in g)}/{len(g)}")
    print(f"Median inference {metrics['inferenceMs']} ms per photo (CPU)")

    if args.app_demo:
        demo = Path(__file__).resolve().parent.parent / "public" / "vision-demo"
        demo.mkdir(parents=True, exist_ok=True)
        for old in demo.glob("*.jpg"):
            old.unlink()
        for f in out.glob("*.jpg"):
            shutil.copy2(f, demo / f.name)
        shutil.copy2(out / "index.json", demo / "index.json")
        shutil.copy2(model_dir / "metrics.json", demo / "metrics.json")
        print(f"Copied {len(index)} samples and metrics.json to {demo}")


if __name__ == "__main__":
    main()
