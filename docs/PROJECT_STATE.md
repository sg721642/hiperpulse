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

## Scope and implementation

Complete local source: Python/FastAPI/SciPy backend; fixed-patch browser camera/video RGB extraction; JSON input; three synthetic fixtures; all-checks quality gate; waveform/spectrum; artifact comparison; downloadable receipts/traces; optional Gemma 4 REST explanation; Docker packaging for DigitalOcean. No neural rPPG, face tracking, database or clinical output.

## Git Status

- Git repository initialized (`main` branch).
- Remote: `https://github.com/sg721642/hiperpulse.git` (Public repository created and synchronized).
- Local HEAD SHA: `062a1d6847516214381eb7ba84c0f7283b493566`
- Remote main SHA: `062a1d6847516214381eb7ba84c0f7283b493566` (Verified match via `git ls-remote`).
- Staged / Working Tree: Clean.

## Pending Work (Next Milestones)

- **M2:** Camera/video capture, permissions, cancellation and supported-device validation.
- **M3:** Evidence receipt verification, artifact comparison lab, JSON exports and reimport verification.
- **M4:** Real Gemma 4 integration (`gemma-4-26b-a4b-it`) via Gemini API with server-side `.env`.
- **M5:** Manual validation matrix, negative paths, viewport tests.
- **M6:** Docker build validation and DigitalOcean deployment.
- **M7:** Public repository synchronization, presentation slides (PPT), <=5 min demonstration video.

## Immediate Next Smallest Task

Confirm target GitHub repository URL from user, make the initial baseline commit on `main`, and proceed with Milestone M2/M3 browser and capture verification.
