# HiperPulse — Experimental Camera Heart Rate

**Evidence before estimates.** An experimental, evidence-first, browser-based pulse signal analysis prototype.

> **IMPORTANT:** Experimental wellness prototype. Not a medical device. No clinical accuracy, diagnosis, blood pressure, or oxygen saturation.

## Core Workflow

Camera recording / local video / synthetic sample / JSON trace → timestamped two-patch RGB signals → GREEN signal-processing baseline → pulse-like waveform and spectrum → transparent quality checks → estimated BPM only when all required gates pass → evidence receipt → Gemma 4 explanation of calculated results.

## Quick Start (macOS / Linux)

```bash
# 1. Create and activate Python 3.12 virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# 2. Install locked dependencies
pip install -r requirements-lock.txt

# 3. Run automated tests (34 tests)
python -m pytest

# 4. Generate deterministic synthetic fixture files
python scripts/export_samples.py

# 5. Launch the application
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Open `http://localhost:8080` in Chrome or Edge.

## Quick Start (Windows PowerShell)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe scripts/export_samples.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

## AI Configuration (Gemma 4 via Gemini API)

1. Copy `.env.example` to `.env`
2. Set `GEMINI_API_KEY` and choose a private `DEMO_TOKEN`
3. Default model: `GEMMA_MODEL=gemma-4-26b-a4b-it`
4. Run `python scripts/check_model.py` to verify model availability for your account
5. In the UI, enter the demo password and request an explanation

*Note: If Gemma is unconfigured or unavailable, HiperPulse falls back to transparent deterministic commentary. Pulse calculation remains fully functional.*

## Deployment

Docker container targeting DigitalOcean App Platform:
```bash
docker build -t hiperpulse .
docker run --rm -p 8080:8080 --env-file .env hiperpulse
```

## Attribution & References

See `THIRD_PARTY_NOTICES.md` for full citations and licensing details.
- GREEN baseline: Verkruysse et al. (2008), *Remote plethysmographic imaging using ambient light*.
- rPPG-Toolbox (ubicomplab): Methodological reference for remote photoplethysmography.
