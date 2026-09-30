"""Project-wide settings for the AquaTrace AI prototype."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
OUTPUTS = ROOT / "outputs"
MODELS = ROOT / "models"

for _d in (RAW, PROCESSED, OUTPUTS, MODELS):
    _d.mkdir(parents=True, exist_ok=True)

# Phase 1 pilot region: Bay of Bengal (+ Andaman Sea edge)
BBOX = {"lon_min": 79.0, "lon_max": 96.0, "lat_min": 4.0, "lat_max": 23.0}

# Drift forecast
FORECAST_HOURS = 48
DT_HOURS = 1.0
PARTICLES_PER_HOTSPOT = 300
# Share of 10 m wind speed transferred to floating debris ("windage"). Floating plastics
# are typically modelled with 1-3 %; sampling the range per particle expresses the
# unknown debris type as forecast uncertainty.
WINDAGE_RANGE = (0.01, 0.03)
# Horizontal eddy diffusivity (m^2/s) for the random-walk term.
DIFFUSIVITY = 20.0
RANDOM_SEED = 42

EARTH_RADIUS_M = 6_371_000.0
M_PER_DEG_LAT = 111_320.0
