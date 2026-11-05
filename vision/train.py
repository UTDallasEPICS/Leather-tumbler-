"""Train a PatchCore leather-defect model and export it to ONNX.

PatchCore learns what good leather looks like from photos of good leather only, then scores new photos by
how far each patch is from anything it saw. No defect labelling is needed to train.

    # prove the pipeline on the public MVTec AD leather set
    python train.py mvtec --root datasets/MVTecAD --out models/mvtec-leather

    # train on our own photos (good/ is required, defect/ is optional but needed for honest metrics)
    python train.py folder --good photos/good --defect photos/defect --out models/dava-leather

Writes into --out:
    model.onnx          the model, with resizing, normalising and score scaling built in
    split.json          which test photos were held back for evaluate.py (never used to pick the threshold)
    train_metrics.json  Anomalib's own test metrics (image and pixel AUROC, F1)
Then run evaluate.py on the same --out folder to get metrics.json and the heatmap samples the app shows.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

IMAGE_SIZE = (256, 256)


def build_datamodule(args: argparse.Namespace):
    from anomalib.data import Folder, MVTecAD

    # num_workers=0: Windows has no fork, and the dataset is small enough that loading is not the bottleneck.
    # Half the test photos pick the threshold and score scaling (validation), the other half are only used
    # to judge the model, so the reported numbers are not tuned to the photos they are measured on.
    common = dict(train_batch_size=16, eval_batch_size=16, num_workers=0, val_split_mode="from_test", val_split_ratio=0.5, seed=42)
    if args.source == "mvtec":
        return MVTecAD(root=args.root, category=args.category, **common)
    return Folder(
        name="dava-leather",
        normal_dir=args.good,
        abnormal_dir=args.defect,
        # without defect photos, hold back 20% of the good ones so there is something to test on
        normal_split_ratio=0.2,
        test_split_mode="from_dir" if args.defect else "synthetic",
        **common,
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="source", required=True)
    m = sub.add_parser("mvtec", help="MVTec AD category (default: leather)")
    m.add_argument("--root", type=Path, default=Path("datasets/MVTecAD"))
    m.add_argument("--category", default="leather")
    f = sub.add_parser("folder", help="our own photos")
    f.add_argument("--good", type=Path, required=True, help="folder of photos of good leather")
    f.add_argument("--defect", type=Path, help="folder of photos of defective leather (subfolders = defect types)")
    for s in (m, f):
        s.add_argument("--out", type=Path, required=True)
        s.add_argument("--backbone", default="wide_resnet50_2")
        s.add_argument("--coreset", type=float, default=0.1, help="share of training patches kept in memory")
        s.add_argument("--ckpt", type=Path, help="skip training: test and export this checkpoint from an earlier run")
    args = p.parse_args()

    from anomalib.engine import Engine
    from anomalib.models import Patchcore

    out: Path = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)

    dm = build_datamodule(args)
    model = Patchcore(
        backbone=args.backbone,
        coreset_sampling_ratio=args.coreset,
        pre_processor=Patchcore.configure_pre_processor(image_size=IMAGE_SIZE),
    )
    engine = Engine(default_root_dir=out / "lightning", accelerator="cpu", devices=1, logger=False)

    fit_s = None
    if args.ckpt:
        results = engine.test(model=model, datamodule=dm, ckpt_path=args.ckpt)[0]
    else:
        t0 = time.time()
        engine.fit(model=model, datamodule=dm)
        fit_s = round(time.time() - t0, 1)
        results = engine.test(model=model, datamodule=dm)[0]

    test = dm.test_data.samples
    split = {
        "source": args.source,
        "dataset": str(args.root if args.source == "mvtec" else args.good.parent),
        "category": getattr(args, "category", "own photos"),
        "train_images": len(dm.train_data.samples),
        "val_images": len(dm.val_data.samples),
        "test": [{"path": str(Path(r.image_path).resolve()), "label": int(r.label_index)} for r in test.itertuples()],
    }
    (out / "split.json").write_text(json.dumps(split, indent=1))
    (out / "train_metrics.json").write_text(
        json.dumps(
            {
                "backbone": args.backbone,
                "coreset_sampling_ratio": args.coreset,
                "image_size": IMAGE_SIZE,
                "fit_seconds": fit_s,
                "metrics": {k: float(v) for k, v in results.items()},
            },
            indent=1,
        )
    )
    print(f"\nAnomalib test metrics: {results}" + (f" (trained in {fit_s:.0f}s)" if fit_s else ""))

    # last, as it is the step most likely to need an extra package; the checkpoint survives a failure here.
    # A dynamic batch comes out pinned to the tracing example's size (2), so export a fixed batch of one photo,
    # which is how the server and an edge device use it.
    onnx_path = engine.export(
        model=model,
        export_type="onnx",
        export_root=out,
        input_size=IMAGE_SIZE,
        ckpt_path=args.ckpt,
        onnx_kwargs={"dynamic_shapes": None},
    )
    print(f"Exported {onnx_path}")


if __name__ == "__main__":
    main()
