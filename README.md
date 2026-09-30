# AquaTrace AI: prototype

**From detecting marine debris to predicting its next move.** Bay of Bengal pilot (Phase 1).

AquaTrace AI finds *potential* floating-debris hotspots in NASA and ESA satellite data. It forecasts where
each one will drift over the next 24 and 48 hours using ocean currents and wind, back-tracks where it came
from, ranks everything into a cleanup-priority list, and plans a vessel route to intercept it. It all runs
on an interactive map.

```
OBSERVE ─▶ DETECT ─▶ FUSE ─▶ FORECAST ─▶ PRIORITIZE ─▶ ACT
PACE OCI    AI model   OSCAR     particle      risk score    route planner
Sentinel-2  + FDI      MERRA-2   drift model   + source      + shoreline alerts
```

## Getting started on a new machine

Requirements: **Python 3.11+** (developed on 3.14, macOS). Node.js 18+ is optional, because a built copy of
the web app is included in `frontend/dist`.

```bash
./setup.sh                    # creates .venv, installs Python packages, rebuilds the web app if npm exists
./run_demo.sh                 # serves the API + web app at http://localhost:8000
```

That's enough for the full demo: the saved runs (live + two replays), metrics, what-if forecasts and route
planning all work offline from the files included here. On Windows, create the venv manually
(`python -m venv .venv`, `.venv\Scripts\pip install -r requirements.txt`) and start the server with
`cd backend` then `..\.venv\Scripts\uvicorn aquatrace.api:app --port 8000`.

### What is included, and what isn't

| Included | Not included (and how to get it) |
|---|---|
| All source code (`backend/`, `frontend/src`) and the built web app (`frontend/dist`) | `.venv/` and `node_modules/`: recreated by `./setup.sh` |
| Saved pipeline runs, overlays and validation results (`outputs/`) | Raw satellite downloads (~10 GB): fetched automatically when you re-run the pipeline |
| Model metrics, calibration and experiment results (`models/*.json`) | The trained model file `models/marida_rf.joblib` (~700 MB): retrain it in ~1 minute (below) |
| Cached currents/wind for the saved runs and the buoy validation (`data/processed/*.nc`) | Sentinel-2 scene cache: re-downloaded on demand |
| Coastline data and NOAA drifter tracks (`data/raw/naturalearth`, `data/raw/drifters`) | Your Earthdata login: each person uses their own (below) |
| Pitch deck with results (`presentation/`) and app screenshots (`docs/screenshots/`) | |

### Retraining the debris classifier (needed only to run the detection pipeline)

```bash
mkdir -p data/raw/marida && cd data/raw/marida
curl -L -o MARIDA.zip "https://zenodo.org/records/5151941/files/MARIDA.zip?download=1"   # 1.2 GB
unzip -q MARIDA.zip && cd ../../../backend
../.venv/bin/python -m aquatrace.marida        # ~1 min; writes models/marida_rf.joblib + metrics
../.venv/bin/python -m aquatrace.calibration
```

## Quick start (demo)

```bash
./run_demo.sh                 # builds the web app if needed, serves http://localhost:8000
```

In the app:
- **Run selector:** `LIVE` runs use the latest satellite passes and forecast from *now*. `replay` runs are
  past dates we can check against what actually happened.
- **Click a hotspot:** risk breakdown, recommended action, and a purple back-track showing **where it came from**.
- **Time bar ▶:** animate the particle ensemble to +48 h.
- **Plan cleanup route:** pick a port. The vessel is routed to where each patch *will be* when it arrives.
- **What-if:** click anywhere on the sea to forecast a spill or litter patch released there.

## Running the pipeline

```bash
cd backend
../.venv/bin/python -m aquatrace.pipeline --live                  # near-real-time: latest passes → now → +48 h
../.venv/bin/python -m aquatrace.pipeline --date 2026-03-14       # replay a past date (NASA data)
../.venv/bin/python -m aquatrace.marida                           # train the debris classifier
../.venv/bin/python -m aquatrace.calibration                      # confidence calibration check
../.venv/bin/python -m aquatrace.experiments                      # model selection on the validation split
../.venv/bin/python -m aquatrace.validate --start 2025-01-01 --end 2025-02-24             # buoy validation
../.venv/bin/python -m aquatrace.validate --start 2025-01-01 --end 2025-02-24 --calibrate-windage
```

For a daily live map, run `--live` about 3 hours after the Bay pass (~16:00 IST), when NASA publishes the
near-real-time PACE product.

### NASA Earthdata login (for the datasets named in the deck)

1. Create a free account at https://urs.earthdata.nasa.gov
2. In your profile, open **Applications → Authorized Apps** and approve **NASA GESDISC DATA ARCHIVE** (needed for MERRA-2).
3. Save the login once: `.venv/bin/python -c "import earthaccess; earthaccess.login(strategy='interactive', persist=True)"`

## Data sources

| Stage | Dataset | Notes |
|---|---|---|
| Observe (regional) | **NASA PACE OCI L2 SFREFL**: hyperspectral, 122 bands, ~1.2 km | near-real-time product online ~3 h after each daily pass |
| Observe (coastal) | **ESA Sentinel-2 L2A**, 10–20 m | Earth Search STAC, no login |
| Currents | **NASA OSCAR v2.0**, 0.25°, daily | Open-Meteo Marine (Mercator SMOC) for live forecasts |
| Wind | **NASA MERRA-2** 10 m wind, hourly (Bay subset via NASA cloud OPeNDAP) | Open-Meteo GFS/ECMWF for live forecasts |
| AI training | **MARIDA**: labelled Sentinel-2 marine-debris dataset | 15 classes, official splits |
| Validation | **NOAA Global Drifter Program** buoys | 6-hourly QC tracks |
| Coast / land | Natural Earth 10 m | beaching and routing |

## Results

### Detection: Extra Trees classifier, MARIDA test split (scored once)

| Metric | First model | **Final model** |
|---|---|---|
| Overall accuracy (15 classes) | 79.5 % | **91.9 %** |
| Floating material F1 (debris + sargassum) | 0.89 | **0.94** (P 0.91, R 0.97) |
| Marine debris F1 | 0.62 | **0.75** (P 0.67, R 0.86) |
| Macro F1 | 0.58 | **0.74** |

What changed, chosen on the **validation** split (`models/experiments_val.json`):
- **Neighbourhood texture features** (3×3 and 7×7 mean, std and contrast). Debris lines, ships, waves and foam
  differ in shape as well as colour. This alone added about 8 points of accuracy.
- **Extra Trees** instead of Random Forest. Gradient boosting had slightly higher overall accuracy on
  validation (90.0 vs 88.1 %) but lower debris F1 (0.77 vs 0.84). We optimise for finding debris.
- **Background-relative spectra** (each pixel minus its surrounding water). A raw-reflectance model mistook
  ordinary Bay water for clouds and wakes, because MARIDA and Sentinel-2 L2A are processed differently.

**Confidence calibration** (`models/calibration.json`, the deck's "TRUST" metric): expected calibration error
0.9 % for floating material and 0.6 % for debris. In the mid range the model is slightly *under*-confident
(it says 65 % and is right 83 % of the time), which is the safe direction for a cleanup tool.

### Forecast: drift model vs 235 real buoy tracks (NOAA drifters, Bay of Bengal, 1 Jan – 24 Feb 2025)

| NASA OSCAR + MERRA-2 forcing | 24 h error (median) | 48 h error (median) |
|---|---|---|
| **AquaTrace (currents + 1–3 % wind)** | **15.7 km** | **28.7 km** |
| Currents only (no wind) | 20.4 km | 37.0 km |
| "Debris stays where it was seen" | 39.3 km | 76.9 km |
| Improvement over the snapshot | **60 %** | **63 %** |

**Wind + current fusion is measurably better** than currents alone. **Windage calibration**
(`outputs/windage_calibration.json`): 48 h error is lowest at 2 % of wind speed (28.6 km) and worse at 0 % (36.8 km)
or 4 % (31.7 km). Our 1–3 % ensemble is centred on the data's optimum.

## How each part works

- **Detect** (`detect.py`): PACE's 122 bands are resampled to Sentinel-2-equivalent bands so one model serves both
  sensors. Land, cloud (+ buffer), glint, bright objects, the shoreline strip and inland water are masked. Pixels are
  scored by the Floating Debris Index (FDI) against their local water background, then checked by the classifier
  (ships, wakes, waves and clouds rejected). Hotspot confidence = anomaly strength + size + ML probability
  (the ML weight is lower on PACE's 1.2 km pixels).
- **Forecast** (`drift.py`): 300 particles per hotspot move with `current + windage × wind` (RK4, hourly) plus a
  random walk. The spread is the **uncertainty cone**. Particles reaching land are **beached**.
- **Nowcast** (live mode): each detection is moved from its satellite time to *now*, so the map stays current between
  passes and under clouds.
- **Source tracking** (`source.py`): the same model run **backwards** 72 h. Back-tracked particles that reach land
  point to a coastal or river source (12 named river mouths around the Bay).
- **Prioritize** (`risk.py`): risk = 35 % confidence + 25 % proximity to sensitive sites / coast + 15 % beaching +
  15 % recurrence across passes + 10 % forecast certainty. Tiers: High ≥ 60, Medium ≥ 40. Plain-language actions
  (intercept by vessel / send a shoreline team / monitor).
- **Route** (`route.py`): greedy moving-target interception from a port. Each stop is aimed at the forecast position at
  the boat's arrival time. Legs over land and stops beyond the 48 h forecast are skipped.

## Honest limitations (say these before a judge asks)

- **No satellite shows every piece of plastic live.** PACE passes once a day (~1.2 km pixels), Sentinel-2 every few days
  near the coast, and clouds block both. We show *potential* floating-material hotspots with confidence, and the
  drift model carries them forward between passes.
- **MARIDA scenes are not from the Bay of Bengal.** Detection scores are on MARIDA's test split. Local ground truth
  (drones, beach surveys, fishermen reports) is Phase 2.
- **NASA OSCAR / MERRA-2 arrive days to weeks late**, so NASA runs are replays. Live runs use forecast currents and wind.
- The buoy validation checks the current/wind field with surface drifters, a proxy for debris, not debris itself.
- Routes are straight lines between waypoints (no detailed sea-lane routing).

## Project layout

```
backend/aquatrace/
  config.py          region, forecast and model settings
  sources/           nasa.py (PACE, OSCAR, MERRA-2) · openmeteo.py · sentinel2.py · coast.py
  forcing.py         common gridded velocity field + interpolation
  detect.py          indices, texture features, anomaly, hotspots, map overlays
  marida.py          classifier training + metrics      experiments.py  model selection (validation split)
  calibration.py     reliability curve / ECE
  drift.py           Lagrangian particle model (forward and backward)
  source.py          source back-tracking               route.py        cleanup route planner
  risk.py            risk score + recommended action
  validate.py        buoy validation + windage calibration
  pipeline.py        replay (--date) and live (--live) runs → outputs/runs/<id>/run.json
  api.py             FastAPI: runs, metrics, what-if forecasts, routes, and the web app
frontend/            React + Vite + Leaflet map app (dist/ = built copy)
models/              classifier metrics, calibration, experiment log (+ trained model once retrained)
outputs/             pipeline runs (runs/<id>/run.json + overlays), buoy validation, windage calibration
data/                processed forcing caches, coastline, drifter tracks (raw satellite data is downloaded on demand)
docs/screenshots/    app screenshots used in the deck + shoot.sh to recapture them
presentation/        Innothon'26 pitch deck with the results slides
DEMO.md              4-minute demo script and judge Q&A
CLAUDE.md            guide for AI coding assistants (Claude Code) working on this repo
```
