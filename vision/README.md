# Leather defect inspection

A camera check for finished (or in-process) hides. The model learns what **good** leather looks like and
flags anything that differs, with a heatmap of where. No defect labelling is needed to train it. The app's
**Inspection** page sends it photos, shows how accurate it is, counts the defects people confirm, and links
them to each run's temperature and pH.

The ESP32 controller can't run an image model, so this runs on a laptop or mini PC on the same Wi-Fi as
the phone.

```
Phone (Inspection page) ──photo──►  service.py :8770  ──►  model.onnx (PatchCore)
                         ◄─score, heatmap──   │
                                             └─ data/ (SQLite + photos)
```

## What's here

| File | What it does |
|---|---|
| `train.py` | Trains PatchCore (Anomalib) on photos of good leather and exports it to ONNX |
| `evaluate.py` | Scores the held-back test photos: `metrics.json`, heatmap samples, contact sheet |
| `inspector.py` | Runs the ONNX model on one photo, draws the heatmap. Needs no PyTorch |
| `service.py` | The inspection server the app talks to |

`models/`, `datasets/`, `data/` and `.venv/` are git-ignored: the model is about 250 MB, so each machine
trains its own (about 10 minutes on a fast desktop CPU).

## Set up and train (once)

Uses Python 3.12. With [uv](https://docs.astral.sh/uv/):

```bash
cd vision
uv venv --python 3.12 .venv
uv pip install --python .venv -r requirements-train.txt
```

Download the MVTec AD **leather** set (about 525 MB) from
<https://www.mvtec.com/company/research/datasets/mvtec-ad/downloads> and extract it so you have
`datasets/MVTecAD/leather/{train,test,ground_truth}`. Then:

```bash
.venv/Scripts/python train.py mvtec --out models/mvtec-leather      # Windows paths; .venv/bin/python on Linux/macOS
.venv/Scripts/python evaluate.py models/mvtec-leather
```

On Windows set `PYTHONUTF8=1` first: PyTorch's exporter prints characters the default console encoding
can't write. If export fails after training, rerun `train.py` with
`--ckpt models/mvtec-leather/lightning/Patchcore/MVTecAD/leather/v0/weights/lightning/model.ckpt` to skip
training.

## Run the server

```bash
.venv/Scripts/python service.py            # model from models/mvtec-leather, listens on 0.0.0.0:8770
```

In the app: **Connection → Inspection server**, enter this computer's LAN address and port 8770, press
**Test**, then **Save inspection server**. Open **Inspection**.

The server only needs `requirements.txt` (no PyTorch). To run it on another machine, copy `service.py`,
`inspector.py` and the model folder across.

## Results on MVTec AD leather (Nov 2026)

Trained on 245 photos of good leather. Half of the 124 test photos were used to pick the threshold; the
other 62 (16 good, 46 defective) were only used for these numbers:

| | |
|---|---|
| Defects caught | 46 / 46 (color 11/11, cut 11/11, fold 6/6, glue 8/8, poke 10/10) |
| False alarms on good leather | 0 / 16 |
| Image AUROC / pixel AUROC | 1.000 / 0.992 |
| Speed | about 85 ms a photo on a desktop CPU (Ryzen 7 9800X3D, 8 cores) |

`models/mvtec-leather/contact-sheet.jpg` shows photos and heatmaps side by side.

**These numbers do not carry over to our leather.** MVTec leather is a well-known easy benchmark
photographed under ideal, fixed conditions. Different leather, camera and lighting change everything.
Treat this as proof that the pipeline works, then retrain on our own photos.

## Train on our own leather (next step)

1. Build a simple fixed rig: camera at a fixed height and angle, diffuse LED light, same background. A
   wandering light source makes good leather look like a defect.
2. Take 100–300 photos of **good** finished leather into `photos/good/`. Put a few dozen defective ones
   into `photos/defect/<type>/` (for example `photos/defect/fold/`). These are only used for testing.
3. Train, evaluate and point the server at the new model:

   ```bash
   .venv/Scripts/python train.py folder --good photos/good --defect photos/defect --out models/dava-leather
   .venv/Scripts/python evaluate.py models/dava-leather
   .venv/Scripts/python service.py --model models/dava-leather
   ```

4. In the app, answer **What is it really?** on photos as you go. The "On your photos" box then shows how
   often the model agrees with people on our leather, which is the number that matters.

## How the app uses it

- **Check a hide**: take a photo and tie it to a tumbler, run and stage. The app shrinks it to 1600 px before
  sending.
- **How good is the model**: catch rate and false alarms on the test photos at any sensitivity. Moving the
  slider recalculates them from the stored test scores, so you can see the trade-off before saving it on
  the server.
- **What's showing up**: defects by type (as confirmed by people) and the defective share run by run.
- **What to change in the process**: once 6 or more finished runs have photos, the app compares each run's
  stage temperature, pH, drum speed and pH checks with how many of its hides came out defective. It shows
  readings that went with clearly more defects, and warns when a batch running now is on the wrong side
  of one. These are correlations from a few runs, not causes, so check them against what you know of the
  chemistry.

Demo Mode uses real model output on 21 MVTec test photos (in `public/vision-demo/`, made with
`evaluate.py --app-demo`), linked to the made-up demo runs.

MVTec AD is © MVTec Software GmbH, licensed CC BY-NC-SA 4.0 (non-commercial). Bergmann et al., "The MVTec
Anomaly Detection Dataset", IJCV 2021.
