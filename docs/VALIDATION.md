# Validation record

Prepared 25 October 2026. This file separates observed software checks from tasks requiring hardware/accounts. No human accuracy claim is made.

## Automated checks newly reproduced in this workspace

- **Date:** 25 October 2026
- **Environment:** macOS 15+ (Darwin arm64), Python 3.12.15, pytest 8.3.5, SciPy 1.18.1 (updated per D14).
- **Command:** `.venv/bin/python -m pytest`
- **Result:** **94 passed in 7.17s**, 0 failures, 0 errors.
  - 34 baseline unit and API tests (`tests/test_api.py`, `tests/test_pipeline.py`)
  - 7 video regression tests (`tests/test_video_regression.py`)
  - 5 M5 robustness and security boundary tests (`tests/test_m5_robustness.py`)
  - 48 audit remediation, concurrency, and differentiator tests (`tests/test_audit_remediation.py`):
    - Algorithm version bumped to `green-evidence-1.1`
    - Both-patch independent exposure checks `[20, 235]` (6 isolated boundary cases)
    - Canonical `signal_sha256` identity hash and Pydantic `ingestion` tagging
    - Gemma 60s server monotonic deadline budget and structured timeout fallback
    - Strict authentic PTS error enforcement
    - Exact 7199, 7200, 7201 frame boundary tests
    - Individual corruption tests for all 14 quality gates
    - Early authentication and provider concurrency semaphore limit
    - Challenge A (timing dropout <= 0.20s threshold rule), Challenge B (conflicting patch), Challenge C (shared periodic illumination)
    - Judge Evidence Card schema integrity and dynamic Git provenance
    - Dynamic build provenance not stale assertion (`test_build_info_provenance_not_stale`)
    - Authoritative Guided Retake 14-check category mapping assertion (`test_retake_advice_mapping_all_categories`)
    - Challenge A continuity rule threshold check (`test_challenge_a_continuity_rule_and_threshold`)
    - 12 R1 monotonic deadline & concurrency tests: simultaneous request admission, provider concurrency strictly bounded, semaphore queue admission, queue timeout, signal recomputation timeout, HTTPX POST timeout, deadline shared across retries, task cancellation cleanup, cooldown rejection, unauthenticated rejection, invalid model rejection, and unconfigured AI rejection
    - 1 Challenge C flat baseline limitation unit test (`test_challenge_c_optical_flicker_on_flat_baseline_demonstrates_limitation`)
    - 1 Signal analysis failure before receipt verification test (`test_r1_analysis_failure_before_receipt_exists_returns_unavailable`) asserting controlled unavailable response without synchronous recomputation
    - 3 isolated mocked cooldown tests: `test_cooldown_request_inside_window_returns_deterministic_fallback`, `test_cooldown_request_after_window_proceeds`, and `test_cooldown_slow_provider_response_cooldown_starts_at_lock_entry`
    - Deterministic `asyncio.Event` barriers eliminating race conditions and timing flakes in cancellation and concurrency assertions

- **JavaScript Syntax Check:** `node --check web/app.js` and `node --check scripts/test_browser_acceptance.js` -> **PASSED**.

## Automated Browser Acceptance Suite (Brave CDP Runner)

- **Runner:** `scripts/test_browser_acceptance.js` driving headless Brave (`/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`) via Chrome DevTools Protocol (CDP).
- **Hardened Startup:** `launchBrowserWithRetry` (up to 2 attempts) with piped and sanitized stderr ring buffer, child exit detection, CDP `/json/version` polling readiness, `/json/new` target creation fallback, dynamic port conflict fallback, and fatal `test-results/browser-startup-diagnostics.json` artifact emission.
- **Results:**
  - **Offline Suite (`SKIP_LIVE_AI=1`):** **13 passed, 4 skipped (17 registered/accounted for)**.
  - **Live AI Suite (`REQUIRE_LIVE_AI=1` or local with key):** **17 / 17 passed**.
  - **Breakdown of 17 Registered Checks:**
    1. Security headers & `.env` exclusion: CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; `/.env` returns HTTP 404.
    2. Consent gate enforcement: Camera button and trace upload disabled until consent checkbox is checked.
    3. Clean synthetic sample: 72 BPM, 100% checklist (14/14 checks passed), `accepted_experimental`.
    4. Artifact synthetic sample: BPM null, 86% checklist, status `insufficient_quality`, verified Guided Retake action advice rendering.
    5. Flat synthetic sample: BPM null, 64% checklist, status `insufficient_quality`, verified Challenge C on flat baseline triggers the `CRITICAL SCIENTIFIC LIMITATION OBSERVED` analysis notice.
    6. Artifact stress comparison lab: Original sample preserved (72 BPM / 100%); modified copy withheld (BPM null / 79%, 3 failed gates); verified Guided Retake comparison calculates score delta `(+36 percentage points)` (not relative percentage) and gate improvements; verified canvas plot overlay handles disparate point lengths (450 vs 455 points) with gap-lifting, asserting actual finite canvas coordinates, original/transformed endpoints, 450-vs-455 waveform points, timing-gap segmentation, and unequal-length spectrum coordinates (150 vs 175 points).
    7. Evidence receipt & trace reimport: Real CDP file download of trace and judge evidence card to disk; reimport produces deterministic `signal_sha256` match, identical 72 BPM / 100% output, `provenance_note` documenting 5-decimal canonical hash rounding, `is_synthetic === true`; verified 8 distinct provenance card scenarios classifying unauthenticated camera/video JSON imports as `declared_not_authenticated` with `unverified_origin: true`.
    8. Camera lifecycle & stop/discard: Capturing from camera, clicking Stop cleanly stops all MediaStream tracks and discards incomplete trace without submitting to backend.
    9. Tab-hide visibility interruption: Dispatching `visibilitychange` (`hidden`) aborts active capture and clears buffer to prevent stale estimation.
    10. Clear session UI reset: Clears all waveform, spectrum, BPM, quality metrics, and disabled export/explanation buttons.
    11. Synthetic 30s WebM browser playback: Real-time 30-second playback through native `requestVideoFrameCallback` over `HTMLVideoElement`; 900 frames extracted, 0 gaps (`largest_gap_seconds: 0.034s`, `timing_variation: 0.0141`), **72 BPM**, **100% checks passed**, status `accepted_experimental`, provenance `SYNTHETIC DEMO · NOT A PERSON`.
    12. Short 12s video browser withholding: Real-time 12-second playback extracts 360 frames; backend withholds BPM (`null`), fails `duration_seconds` gate (93% checks passed), status `insufficient_quality`.
    13. Gemma 4 AI consent gate and demo token enforcement: Verifies UI blocks explanation when summary sharing is unchecked, and returns HTTP 401 if demo password is missing or invalid. Strict release mode (`REQUIRE_LIVE_AI=1`) fails closed if credentials, demo token, exact model `gemma-4-26b-a4b-it`, or live response are missing.
    14. Real Gemma 4 clean synthetic explanation in browser: Live call to `gemma-4-26b-a4b-it` renders in browser with exact model tag, synthetic provenance attribution, 72 BPM confirmation, and non-clinical disclaimer.
    15. Real Gemma 4 failed-quality explanation in browser: Live call to `gemma-4-26b-a4b-it` renders in browser explaining withheld BPM and identifying specific failed gates (`patch_difference_bpm` and `estimator_difference_bpm`).
    16. Clear session clears AI explanation, password input, and consent: Confirms `#explanation` resets to default placeholder, token input is cleared from memory, and checkboxes are unchecked.
    17. Console errors audit: 0 unhandled JavaScript exceptions, 0 network errors, 0 runtime warnings during entire suite execution.

- **Negative Regression Verification:** `TEST_NEGATIVE_TIMEOUT=1` verified to specifically isolate forced timeout on T11 while T01-T10 and T12, T17 pass; parsed and asserted via machine-readable structured summary JSON.
- **Live Script Verification:** `scripts/verify_gemma_live.py` validates genuine live Gemma 4 explanations and HTTP 401 token enforcement; cooldown logic is authoritatively tested via the 3 deterministic mocked unit tests in `tests/test_audit_remediation.py`.

## Milestone K: Winning-Level Immersive Frontend/UI Redesign (Vizo × Active Theory)

- **Date:** 25 October 2026
- **Creative Inspiration:** Vizo Dashboard by RonDesignLab (neuro-optical telemetry, dark emerald palette, precision typography) × Active Theory (interactive particle constellation, responsive motion, state choreography).
- **Design System Implementation:**
  - Dark emerald obsidian palette: `#030907` (void background), `#071310` (deep surface), `#10251d` (forest panel), `#244d2e` (active emerald), `#3ee89f` / `#8ae8c4` (luminous mint line/glow accents), `#f1cc8b` (amber warning), `#d96b6b` (coral danger).
  - Open-source typography: Cabinet Grotesk / Syne (editorial headlines), Instrument Sans (body & labels), IBM Plex Mono (numerals & code).
  - High-hierarchy modular layout: Optical Viewport Station with laser scan sweep, corner brackets, and coordinate badges (`CHEEK_L`, `CHEEK_R`); Floating Telemetry Cards (BPM, 100% Quality, Provenance, Decision); High-contrast Oscilloscope and Spectrum; 14 Quality Gate Grid in collapsible drawer; Guided Retake Delta Lab (`(+36 percentage points)`); 3 Artifact Challenge Modules (A, B, C); Gemma 4 Commentary Panel.
- **Visual Capture Evidence:**
  - `reference/desktop-redesign.png` (1,634,814 bytes, 1440x900 hero viewport)
  - `reference/desktop-fullpage-redesign.png` (2,604,013 bytes, full-page desktop render)
  - `reference/mobile-redesign.png` (1,018,485 bytes, 390x844 mobile viewport)
  - `reference/mobile-fullpage-redesign.png` (2,572,013 bytes, full-page mobile render)
- **Automated Verification:**
  - 94 / 94 Python tests passing (`tests/`).
  - 0 JavaScript syntax errors (`node --check web/app.js` and `node --check scripts/test_browser_acceptance.js`).
  - 13 PASS, 4 SKIP in offline browser acceptance test suite (17 / 17 registered).
  - Negative timeout regression verified (exits 1 on forced T11 timeout).
  - CSP updated in `app/main.py` allowing fonts from Google Fonts and Fontshare.

## Milestone M5: Robustness, Security & Local Docker Readiness Audit

- **Date:** 25 October 2026
- **Signal-Processing Invariants:** Verified that the 14 quality thresholds in `app/signal.py` remain unchanged. Frequencies outside biological range, noise, synthetic gaps, and uneven illumination strictly withhold BPM (`bpm: null`).
- **Physical Camera Capture (Historical Evidence):** Owner provided verification of a successful 30-second physical webcam recording on macOS Brave (Source: `camera`, Experimental BPM: 49, 14/14 checks passed, duration ~30s). Captured evidence is preserved; physical hardware checks remain marked `NOT RUN` during automated headless runs to prevent fabrication.
- **Local Docker Readiness:**
  - Audit: `docker` command line utility is not installed on this local macOS development environment (`command not found`).
  - Static Dockerfile Verification: Single-stage slim image (`python:3.12-slim`), non-root execution (`appuser:10001`), bind address `0.0.0.0:8080`, concurrency capped at 20.
  - Context Security: Whitelist `.dockerignore` (`*` ignore-all default) strictly excludes `.env`, secrets, `.git`, `tests/`, `samples/`, and logs.
- **DigitalOcean App Platform Deployment Readiness:**
  - Deployment specification created: `deploy/digitalocean/app.yaml`.
  - Deployment guide and cost breakdown: `docs/DEPLOYMENT_DIGITALOCEAN.md` (basic-xxs/xs container, pricing verified at deployment time).
  - Pre-Deployment Security Gate: Gemini API key used in development is marked `EXPOSED / ROTATION REQUIRED BEFORE PUBLIC DEPLOYMENT`. Must be revoked and replaced before production launch.
  - Mandatory Owner Gate: Deployment is `BLOCKED_PENDING_UI_REVIEW_AND_OWNER_AUTHORIZATION`.

## Required manual checks status

| Check | Expected | Status in this Workspace |
|---|---|---|
| Automated unit & API test suite | 94 passed | VERIFIED (94 passed in 7.17s) |
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
