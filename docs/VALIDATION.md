# Validation record

Prepared 25 October 2026. This file separates observed software checks from tasks requiring hardware/accounts. No human accuracy claim is made.

## Automated checks newly reproduced in this workspace

- **Date:** 25 October 2026
- **Environment:** macOS 15+ (Darwin arm64), Python 3.12.15, pytest 8.3.5, SciPy 1.18.1 (updated per D14).
- **Command:** `.venv/bin/python -m pytest`
- **Result:** **46 passed in 4.01s**, 0 failures, 0 errors.
  - 34 baseline unit and API tests (`tests/test_api.py`, `tests/test_pipeline.py`)
  - 7 video regression tests (`tests/test_video_regression.py`)
  - 5 M5 robustness and security boundary tests (`tests/test_m5_robustness.py`):
    - All 14 quality gates verified present and failure of any single gate enforces `bpm: null`
    - Waveform and spectrum generation preserved for inspectable failed signals
    - Pydantic trace boundary enforcement (150-7200 frames, extra fields forbidden, invalid source rejected)
    - Gemma prompt sanitization verified (zero raw biometric/timestamp/waveform data sent to Gemini API)
    - Receipt immutability verified during client artifact stress comparison

- **JavaScript Syntax Check:** `node --check web/app.js` and `node --check scripts/test_browser_acceptance.js` -> **PASSED**.

## Automated Browser Acceptance Suite (Brave CDP Runner)

- **Runner:** `scripts/test_browser_acceptance.js` driving headless Brave (`/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`) via Chrome DevTools Protocol (CDP).
- **Results:** **17/17 Checks Passed**:
  1. Security headers & `.env` exclusion: CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; `/.env` returns HTTP 404.
  2. Consent gate enforcement: Camera button and trace upload disabled until consent checkbox is checked.
  3. Clean synthetic sample: 72 BPM, 100% checklist (14/14 checks passed), `accepted_experimental`.
  4. Artifact synthetic sample: BPM null, 86% checklist, status `insufficient_quality`.
  5. Flat synthetic sample: BPM null, 64% checklist, status `insufficient_quality`.
  6. Artifact stress comparison lab: Original sample preserved (72 BPM / 100%); modified copy withheld (BPM null / 79%, 3 failed gates).
  7. Evidence receipt & trace reimport: Trace reimported into fresh session produces deterministic SHA-256 match and identical 72 BPM / 100% output.
  8. Camera lifecycle & stop/discard: Capturing from camera, clicking Stop cleanly stops all MediaStream tracks and discards incomplete trace without submitting to backend.
  9. Tab-hide visibility interruption: Dispatching `visibilitychange` (`hidden`) aborts active capture and clears buffer to prevent stale estimation.
  10. Clear session UI reset: Clears all waveform, spectrum, BPM, quality metrics, and disabled export/explanation buttons.
  11. Synthetic 30s WebM browser playback: Real-time 30-second playback through native `requestVideoFrameCallback` over `HTMLVideoElement`; 900 frames extracted, 0 gaps (`largest_gap_seconds: 0.034s`, `timing_variation: 0.0141`), **72 BPM**, **100% checks passed**, status `accepted_experimental`, provenance `SYNTHETIC DEMO · NOT A PERSON`.
  12. Short 12s video browser withholding: Real-time 12-second playback extracts 360 frames; backend withholds BPM (`null`), fails `duration_seconds` gate (93% checks passed), status `insufficient_quality`.
  13. Gemma 4 AI consent gate and demo token enforcement: Verifies UI blocks explanation when summary sharing is unchecked, and returns HTTP 401 if demo password is missing or invalid.
  14. Real Gemma 4 clean synthetic explanation in browser: Live call to `gemma-4-26b-a4b-it` renders in browser with exact model tag, synthetic provenance attribution, 72 BPM confirmation, and non-clinical disclaimer.
  15. Real Gemma 4 failed-quality explanation in browser: Live call to `gemma-4-26b-a4b-it` renders in browser explaining withheld BPM and identifying specific failed gates (`patch_difference_bpm` and `estimator_difference_bpm`).
  16. Clear session clears AI explanation, password input, and consent: Confirms `#explanation` resets to default placeholder, token input is cleared from memory, and checkboxes are unchecked.
  17. Console errors audit: 0 unhandled JavaScript exceptions, 0 network errors, 0 runtime warnings during entire suite execution.

## Milestone M5: Robustness, Security & Local Docker Readiness Audit

- **Date:** 25 October 2026
- **Signal-Processing Invariants:** Verified that the 14 quality thresholds in `app/signal.py` remain unchanged. Frequencies outside biological range, noise, synthetic gaps, and uneven illumination strictly withhold BPM (`bpm: null`).
- **Physical Camera Capture (Historical Evidence):** Owner provided verification of a successful 30-second physical webcam recording on macOS Brave (Source: `camera`, Experimental BPM: 49, 14/14 checks passed, duration ~30s). Captured evidence is preserved; physical hardware checks remain marked `NOT RUN` during automated headless runs to prevent fabrication.
- **Local Docker Readiness:**
  - Audit: `docker` command line utility is not installed on this local macOS development environment (`command not found`).
  - Static Dockerfile Verification: Multi-stage slim image (`python:3.12-slim`), non-root execution (`appuser:10001`), bind address `0.0.0.0:8080`, concurrency capped at 20.
  - Context Security: Whitelist `.dockerignore` (`*` ignore-all default) strictly excludes `.env`, secrets, `.git`, `tests/`, `samples/`, and logs.
- **DigitalOcean App Platform Deployment Readiness:**
  - Deployment specification created: `deploy/digitalocean/app.yaml`.
  - Deployment guide and cost breakdown: `docs/DEPLOYMENT_DIGITALOCEAN.md` ($5.00/mo basic-xxs container).
  - Pre-Deployment Security Gate: Gemini API key used in development is marked `EXPOSED / ROTATION REQUIRED BEFORE PUBLIC DEPLOYMENT`. Must be revoked and replaced before production launch.
  - Mandatory Owner Gate: Deployment is `BLOCKED_PENDING_UI_REVIEW_AND_OWNER_AUTHORIZATION`.

## Required manual checks status

| Check | Expected | Status in this Workspace |
|---|---|---|
| Automated unit & API test suite | 46 passed | VERIFIED (46 passed in 4.01s) |
| JavaScript syntax check | Passes node --check | VERIFIED (app.js and test_browser_acceptance.js) |
| Sample analyze endpoints | 72 BPM / null withholding | VERIFIED (Clean 72/100%, Artifact null/86%, Flat null/64%) |
| Artifact comparison lab | Original preserved, copy withheld | VERIFIED (Original 72/100%, Copy null/79%, 3 failed gates) |
| JSON load and export round trip | Same meaningful receipt/hash after normalization | VERIFIED (Deterministic SHA-256 match, 14 checks preserved) |
| Desktop viewport layout | Dual-column cards, no overlap | VERIFIED (1280x1024 screenshot inspected via Brave headless) |
| Mobile/narrow viewport | Readable controls, no clipped cards | VERIFIED (375x812 single-column responsive layout inspected) |
| Public GitHub repository | Code, lock, docs synchronized | VERIFIED (https://github.com/sg721642/hiperpulse) |
| Desktop webcam, steady light, 30 s | Completion, observed gates, honest output | HISTORICAL PASS (Owner Brave capture: 49 BPM, 14/14 passed; NOT RUN automated) |
| Phone browser over HTTPS | Camera permission and timed capture | NOT RUN (pending deployment) |
| Camera denial / consent | Useful message, samples remain available | VERIFIED (Automated in CDP acceptance test 2) |
| Stop during capture | Tracks stopped, incomplete trace discarded | VERIFIED (Automated in CDP acceptance test 8) |
| Hide tab during capture | Abort; no stale estimate | VERIFIED (Automated in CDP acceptance test 9) |
| Local video supported codec | Process first <=30 s, maintain timestamps | VERIFIED (Automated in CDP acceptance tests 11 & 12) |
| Actual Gemma 4 provider | Correct provider/model, no unsupported interpretation | VERIFIED (Live calls to gemma-4-26b-a4b-it in CDP tests 14 & 15 and verify_gemma_live.py) |
| Actual provider timeout/quota | Labelled deterministic fallback | VERIFIED (Mocked + live transient retry and cooldown fallback verified) |
| Local Docker build & runtime | Starts as non-root on 8080 | BLOCKED (Docker CLI not installed on host; Dockerfile & context statically verified) |
| DigitalOcean health and HTTPS | `/api/health` and interactive samples work | BLOCKED (Pending UI customization and owner authorization) |
| Human/reference comparison | Synchronized documented interval comparison | NOT RUN |

## Known limitations / risks

- Heuristic quality gates are not calibrated medical confidence. Common periodic lighting can pass every check.
- Fixed patches can capture non-skin/background without detection. No face landmarks or motion tracking.
- Simple GREEN is sensitive to illumination, compression, camera settings and skin appearance.
- Spectrum/autocorrelation can share errors; window estimates are not independent validation.
- Client-declared source and unsigned hash are reproducibility aids, not authenticated provenance.
- AI commentary is strictly secondary; deterministic numerical result remains authoritative.
