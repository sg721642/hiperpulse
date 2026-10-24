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
- **Milestone M4 (Real Gemma 4 AI Explanation & Security Integration):** VERIFIED.
  - API Credentials: Securely loaded via server-side `.env` (strictly Git-ignored).
  - Server health: `/api/health` returns `{"ok":true,"ai_configured":true}`.
  - Model discovery (`scripts/check_model.py`): Account confirmed access to `models/gemma-4-26b-a4b-it` supporting `['generateContent', 'countTokens']`.
  - Reasoning model tuning (D17): Increased `maxOutputTokens` to 4096 and timeout to 90s to accommodate internal reasoning (`thought: True`) before final text output. Added transient 500/503 retry.
  - Test A (Clean Synthetic): Live Gemma 4 explanation renders with model tag `Gemma 4 / gemma-4-26b-a4b-it`, confirms 72 BPM and synthetic provenance, disclaims biological pulse.
  - Test B (Failed Quality Artifact): Live Gemma 4 explanation correctly explains withheld BPM and identifies failed checks (`patch_difference_bpm` and `estimator_difference_bpm`).
  - Test C (Security & Fallbacks): Unchecked consent blocks AI request; missing/invalid demo token returns HTTP 401; cooldown gate (<10s) returns deterministic fallback; clear session cleanly wipes state and credentials.
  - Browser Acceptance Suite: **17/17 browser acceptance tests passing** in headless Brave via CDP.
- **Milestone M5 (Robustness & Security Validation, Local Docker Readiness Audit & Cloud Spec):** VERIFIED.
  - Signal-Processing Invariants: Confirmed that all 14 quality gates in `app/signal.py` remain unmodified and authoritative; corruption of any single gate enforces `bpm: null`.
  - Robustness Test Suite (`tests/test_m5_robustness.py`): Added 5 comprehensive invariant and boundary tests:
    1. `test_all_fourteen_quality_gates_present_and_enforced`: Verifies presence and withholding across every gate.
    2. `test_waveform_and_spectrum_preserved_when_bpm_withheld`: Confirms failed signals retain diagnostic waveform and spectrum plots.
    3. `test_pydantic_trace_boundary_enforcement`: Tests 150-frame minimum, 7200-frame maximum, `extra='forbid'`, and enum validation.
    4. `test_gemma_prompt_sanitization_and_privacy`: Confirms zero raw timestamps, raw RGB, or waveform arrays are sent to the Gemini API prompt.
    5. `test_receipt_immutability_during_artifact_comparison`: Confirms original receipt and SHA-256 remain unmutated by client stress tests.
  - Full Python suite: **46 / 46 passing in 4.01s** (`.venv/bin/python -m pytest`).
  - Browser Acceptance Suite: **17 / 17 checks passing** in headless Brave via CDP (`scripts/test_browser_acceptance.js`).
  - Demo password updated to `hiperpulse` in `.env` and server daemon restarted (`task-854`).
  - Local Docker readiness audit completed: `docker` CLI not installed on host machine; Dockerfile multi-stage non-root container and `.dockerignore` context statically verified.
  - DigitalOcean App Platform spec created (`deploy/digitalocean/app.yaml`) and deployment guide documented (`docs/DEPLOYMENT_DIGITALOCEAN.md`).
  - Release gates established:
    1. `NEXT_STAGE: FRONTEND_UI_CUSTOMIZATION` — Owner explicitly requested frontend/UI revisions before cloud deployment.
    2. `DIGITALOCEAN_DEPLOYMENT: BLOCKED_PENDING_UI_REVIEW_AND_OWNER_AUTHORIZATION` — No cloud resources will be provisioned until UI is customized and approved.
    3. `API_KEY_ROTATION: REQUIRED_BEFORE_PUBLIC_DEPLOYMENT` — Development Gemini API key is marked exposed and must be rotated prior to public release.

## Scope and implementation

Complete local source: Python/FastAPI/SciPy backend; fixed-patch browser camera/video RGB extraction; JSON input; three synthetic fixtures; all-checks quality gate; waveform/spectrum; artifact comparison; downloadable receipts/traces; live Gemma 4 REST explanation with deterministic fallback; Docker packaging for DigitalOcean. No neural rPPG, face tracking, database or clinical output.

## Git Status

- Git repository initialized (`main` branch).
- Remote: `https://github.com/sg721642/hiperpulse.git` (Public repository synchronized).
- Local branch: `main`
- Milestone M5 changes staged/committed: `tests/test_m5_robustness.py`, `deploy/digitalocean/app.yaml`, `docs/DEPLOYMENT_DIGITALOCEAN.md`, `AGENTS.md`, `docs/VALIDATION.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`.

## Mandatory Release Gates

1. `NEXT_STAGE: FRONTEND_UI_CUSTOMIZATION`
2. `DIGITALOCEAN_DEPLOYMENT: BLOCKED_PENDING_UI_REVIEW_AND_OWNER_AUTHORIZATION`
3. `API_KEY_ROTATION: REQUIRED_BEFORE_PUBLIC_DEPLOYMENT`

## Immediate Next Smallest Task

Hard stop at Frontend UI Customization Checkpoint. Present the Milestone M5 verification report to the project owner and request their UI design requirements, screenshots, mockups, or styling preferences before proceeding to deployment.
