# Project state — read this at the start of every chat

Last updated: 25 October 2026. Package version: 1.0. Algorithm: `green-evidence-1.0`.

## Current Workspace & Verification Status

Reconstructed in dedicated directory `/Users/satyamgupta/Documents/HIPERPULSE` on macOS (Darwin arm64, Python 3.12.15).

- **Milestone M0 (Project context and workspace integrity):** VERIFIED. Complete files recovered from handoff.
- **Milestone M1 (Baseline tests and sample UI):** VERIFIED.
  - Python 3.12 venv created at `.venv/`.
  - Dependencies installed from `requirements-lock.txt` (with `scipy==1.18.1` per D14 for macOS arm64).
  - Automated tests: **34 passed in 1.27s** via `.venv/bin/python -m pytest`.
  - JavaScript syntax: `node --check web/app.js` **PASSED**.
  - Synthetic samples: generated via `scripts/export_samples.py`.
  - Server: running via Uvicorn on `http://127.0.0.1:8080`.
  - `/api/health`: returned `{"ok":true,"ai_configured":false}`.
  - Clean synthetic sample: **72 BPM**, **100% checks passed**, status `accepted_experimental`.
  - Artifact synthetic sample: **BPM withheld (`null`)**, **86% checks passed**, status `insufficient_quality`.
  - Flat synthetic sample: **BPM withheld (`null`)**, **64% checks passed**, status `insufficient_quality`.
- **Milestone M2 (Synthetic Video Root-Cause Fix & Capture Lifecycle):** VERIFIED.
  - Root cause diagnosed and resolved: Bit-level container analysis showed headless Chromium `MediaRecorder` stalled for 5.3s on startup under `--virtual-time-budget`.
  - Fixed via deterministic FFmpeg raw-frame encoding pipeline (`scripts/export_video_fixtures.py`).
  - Added video regression suite (`tests/test_video_regression.py`): **41/41 pytest tests passing in 1.86s**.
  - Automated headless Brave CDP acceptance runner (`scripts/test_browser_acceptance.js`): **13/13 browser checks passed**, including real-time 30-second WebM playback with 0 gaps (`largest_gap_seconds: 0.034s`, `timing_variation: 0.0141`, **72 BPM**, **100% checks**).
  - Web UI provenance tagging: synthetic video files correctly marked `SYNTHETIC DEMO · NOT A PERSON`.
- **Milestone M3 (Receipts & Artifact Comparison Lab):** VERIFIED.
  - Automated browser checks 6 and 7 verify receipt SHA-256 integrity upon reimport and artifact comparison gate withholding (79%, 3 failed gates).

## Scope and implementation

Complete local source: Python/FastAPI/SciPy backend; fixed-patch browser camera/video RGB extraction; JSON input; three synthetic fixtures; all-checks quality gate; waveform/spectrum; artifact comparison; downloadable receipts/traces; optional Gemma 4 REST explanation; Docker packaging for DigitalOcean. No neural rPPG, face tracking, database or clinical output.

## Git Status

- Git repository initialized (`main` branch).
- Remote: `https://github.com/sg721642/hiperpulse.git` (Public repository created and synchronized).
- Local branch: `main`
- Changes pending commit: Video fixture fix, automated browser test suite, video regression tests, documentation updates.

## Pending Work (Next Milestones)

- **M4:** Real Gemma 4 integration (`gemma-4-26b-a4b-it`) via Gemini API with server-side `.env`.
- **M5:** Physical host webcam check and phone HTTPS capture verification.
- **M6:** Docker build validation and DigitalOcean deployment.
- **M7:** Presentation slides (PPT), <=5 min demonstration video, and final repository tag.

## Immediate Next Smallest Task

Commit and push verified Milestone M2/M3 changes to GitHub `origin main`, verify synchronization with `git ls-remote`, and proceed to Milestone M4 live Gemma 4 verification.
