# HiperPulse — Explainable Camera Heart Rate & Open-Weight Signal Intelligence

[![CI](https://github.com/sg721642/hiperpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/sg721642/hiperpulse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Python: 3.12](https://img.shields.io/badge/Python-3.12-3ee89f.svg)](requirements-lock.txt)
[![Model: Gemma 4](https://img.shields.io/badge/AI-Gemma_4_(26B--A4B)--IT-blue.svg)](https://ai.google.dev/)
[![Deployment: DigitalOcean Ready](https://img.shields.io/badge/Deploy-DigitalOcean_Ready-0080FF.svg)](deploy/digitalocean/app.yaml)

**Evidence before estimates.** An experimental, evidence-first, browser-based pulse signal analysis prototype developed for **Hacktoberfest Hack Day KodeKurrent S2 Jais × Open Science Labs**.

> **🌐 LIVE INTERACTIVE DEMO:** [european-motion-milwaukee-charger.trycloudflare.com](https://european-motion-milwaukee-charger.trycloudflare.com)  
> **🔑 DEMO ACCESS KEY:** `hiperpulse`

> **IMPORTANT:** Experimental wellness prototype. Not a medical device. No clinical accuracy, diagnosis, blood pressure, or oxygen saturation.

---

### 🏆 Hackathon Challenge Tracks

1. **Best Open-Source AI Project (Build with DigitalOcean):** 
   - 100% transparent, open-source under permissive MIT license.
   - Micro-footprint container architecture ready for DigitalOcean App Platform (`deploy/digitalocean/app.yaml`).
   - 101 automated Python unit tests, 17 browser acceptance tests, and continuous integration workflow.
2. **Best Use of Gemma 4:**
   - Powered by Google DeepMind's open-weight `gemma-4-26b-a4b-it` multimodal reasoning model.
   - Interprets optical telemetry, harmonic frequencies, and noise artifacts into human-readable scientific commentary.
   - Strict architectural guardrail: Gemma explains calculated evidence; it never hallucinates pulse numbers or diagnoses.

---

## Core Workflow

Camera recording / local video / synthetic sample / JSON trace → timestamped two-patch RGB signals → GREEN signal-processing baseline → pulse-like waveform and spectrum → transparent quality checks → estimated BPM only when all required gates pass → evidence receipt → Gemma 4 explanation of calculated results.

## Key Technical Innovations

- **100% Client-Side Privacy:** Zero raw camera video or facial imagery leaves the browser. Only micro-averaged RGB color channels ($320 \times 240$ bilateral spatial binning) are processed.
- **14-Gate Signal Integrity Console:** Evaluates duration, sample rate, timing variation, skin luminance exposure ($[20, 235]$), pixel clipping, spectral peak concentration ($\ge 0.40$), bilateral cheek consensus ($\le 8.0\text{ BPM}$), and cross-estimator agreement ($\le 10.0\text{ BPM}$).
- **Honest Null Withholding (`BPM: null`):** Refuses to hallucinate heart rate numbers when optical noise, lighting flicker, or motion corruption violates scientific thresholds.
- **Challenge Lab:** Interactive stress-test suite simulating camera stutters, illumination conflicts, and shadows to prove robust rejection of corrupted signals.
- **Verifiable SHA-256 Receipts:** Every session generates an immutable cryptographic receipt enabling third-party audit and reproducible evaluation.

## Prerequisites

- **Python:** 3.12+ (tested on Python 3.12.15)
- **Node.js:** Node 20+ runtime compatible (CI uses Node 22 LTS; for syntax checks and automated browser acceptance runner)
- **Chromium-based Browser:** Brave, Google Chrome, or Chromium (configurable via `BROWSER_BIN`)

## Quick Start (macOS / Linux)

```bash
# 1. Create and activate Python 3.12 virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# 2. Install locked dependencies (includes scipy 1.18.1 and imageio-ffmpeg for cross-platform FFmpeg)
pip install -r requirements-lock.txt

# 3. Run automated tests
python -m pytest

# 4. Generate deterministic synthetic fixture files
python scripts/export_samples.py
python scripts/export_video_fixtures.py

# 5. Launch the application
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Open `http://localhost:8080` in Chrome, Edge, or Brave.

### Automated Browser Acceptance Runner

```bash
# Run headless acceptance tests against local instance
node scripts/test_browser_acceptance.js

# Custom browser binary and port can be specified:
# BROWSER_BIN="/path/to/chrome" PORT=8080 node scripts/test_browser_acceptance.js
```

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
