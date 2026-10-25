# Project state — read this at the start of every chat

Last updated: 25 October 2026. Package version: 1.1. Algorithm: `green-evidence-1.1`.

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
  - Demo password rotated to secure randomly generated secret in `.env` and server daemon restarted (`task-1010`).
  - Local Docker readiness audit completed: `docker` CLI not installed on host machine; Dockerfile single-stage non-root container and `.dockerignore` context statically verified.
  - DigitalOcean App Platform spec created (`deploy/digitalocean/app.yaml`) and deployment guide documented (`docs/DEPLOYMENT_DIGITALOCEAN.md`).
  - Release gates established:
- **Independent Audit Remediation & Evidence Features (F01–F11):** VERIFIED.
  - **F01 (Credential Hygiene):** Rotated `DEMO_TOKEN` to a cryptographically strong 48-char random hex token in local `.env`; sanitized all documentation.
  - **F02 (Dependencies):** Aligned `requirements.txt` to `scipy==1.18.1` and added `imageio-ffmpeg==0.6.0`; configured dynamic browser runner parameters.
  - **F03 (Browser Test False-Pass):** Pre-registered 17 tests with strict PASS/FAIL/SKIP/BLOCKED statuses; added negative timeout regression verification.
  - **F05 (Both-Patch Exposure):** Upgraded algorithm version to `green-evidence-1.1`; both patches independently enforced in biological range `[20, 235]`.
  - **F06 (Signal Identity):** Introduced canonical `signal_sha256` computed over raw numeric signal data; added `ingestion` metadata field; verified browser trace reimport round trip.
  - **F07 & F09 (Deadline & Abuse Limits):** Bounded server generation budget to 60.0s (below client 95s timeout); early demo token authentication; concurrency limited to `asyncio.Semaphore(2)`.
  - **F08 (Assertions & Invariants):** True PTS extraction required; boundary tests for exact 7199, 7200, and 7201 frames; verified corruption of each gate individually withholds BPM.
  - **F10 (CI & License):** Created `.github/workflows/ci.yml` and MIT `LICENSE` preserving third-party attribution.
  - **F11 (Evidence Ledger):** Established `docs/EVIDENCE_LEDGER.md` with complete audit and verification tracking.
  - **Differentiator 1 (Guided Retake):** Rule-based actionable advice by failure category; transient in-memory session comparison with score and gate deltas.
  - **Differentiator 2 (Artifact Challenge Lab):** Challenge A (timing dropout), Challenge B (conflicting patch), Challenge C (shared periodic illumination demonstrating optical rPPG limits).
  - **Differentiator 3 (Judge Evidence Card):** Verifiable download of `hiperpulse-judge-evidence.json` with commit SHA, canonical signal hash, checklist, and disclaimers.
  - **Milestone F (Post-Audit Consistency Fixes & Pre-UI Verification):** VERIFIED.
    - Synchronized all 14 quality check IDs in `getRetakeAdvice()` and added deterministic category mapping.
    - Implemented dynamic Git commit provenance via `/api/health` and `/api/meta` with regression test asserting no stale SHA.
    - Corrected Challenge A continuity rule to `<= 0.20 s` and refactored explanations to dynamic receipt analysis.
    - Implemented dashed amber plot overlays (`plotOverlay`) for original vs challenge visual comparison.
    - Solved CI collection failure via `pythonpath = .` and expanded `.github/workflows/ci.yml` into 3 jobs: `test`, `browser-acceptance`, and `docker-smoke`.
  - **Milestone G (Technical Hardening & Pre-UI Verification Completion):** VERIFIED.
    - Eliminated all filename regex matching (`/^(test_video|synthetic|fixture)/i`).
    - Implemented cryptographic SHA-256 fixture manifest (`scripts/build_manifest.py`, `samples/trusted_fixtures.json`, `web/trusted_fixtures.json`) for deterministic synthetic attribution. Unknown local videos classified as `LOCAL VIDEO (UNVERIFIED ORIGIN) · EXPERIMENTAL` (`source: 'video'`, `ingestion: 'local_video'`).
    - Added 11 mandatory regression tests A through K in `tests/test_audit_remediation.py`.
    - Parameterized all 14 quality gates in `app/signal.py`, validating isolated gates (`duration_seconds`, `largest_gap_seconds`, `mean_green`, `clipped_pixel_fraction`, `search_boundary_bpm`) with exact 93% score and coupled gates.
    - Upgraded browser acceptance test T07: real browser download of trace and judge evidence card to disk, reading and validating downloaded bytes from filesystem, reimport via native CDP `DOM.setFileInputFiles`, and asserting round-trip signal hash invariance (`signal_sha256`) and `ingestion: 'json_import'`. Verified negative timeout regression (`TEST_NEGATIVE_TIMEOUT=1`).
    - Added fault-injection & security tests for Gemma deadline budget, transient 500 retry, malformed responses, Semaphore(2) concurrency bounding, and unauthenticated 401 gate. Confirmed zero API key leakage.
    - Reconciled documentation: Node 22 LTS CI / Node 20+ runtime compatibility, single-stage slim Docker image, qualified DigitalOcean hosting estimates, tier-dependent Gemini quotas, process-local cooldown vs cloud budget alerts, and heuristic pass percentage quality score.
    - Validated package reproducibility with `scripts/build_bundle.py` and extracted `HiperPulse_Implementation_Kit.zip`, running all 78 tests cleanly with zero leaked secrets.
  - **Milestone H (Astra Re-Verification Remediation R1–R6 & Final Pre-UI Checkpoint):** VERIFIED.
    - **R1 (True End-to-End Gemma Monotonic Deadline & Concurrency Hardening):** Enforced a single monotonic deadline budget (`60.0s`) in `app/main.py` covering semaphore queue admission, signal recomputation, and HTTPX provider execution/retries. Configurable `AI_COOLDOWN_SECONDS`. Replaced weak `ai_semaphore._value <= 2` check with 12 deterministic concurrent/mocked-provider tests in `tests/test_audit_remediation.py`.
    - **R2 (Artifact Challenge Overlay Separate X/Y Axes):** Refactored `plotOverlay(id, xs1, ys1, xs2, ys2, color1, color2)` in `web/app.js` to compute shared domain bounds `[xMin, xMax]` and `[low, high]` and plot each curve against its own timestamps/frequencies with `Number.isFinite` checks, eliminating `NaN` coordinates and canvas draw errors for disparate array lengths (e.g. 450 vs 455 points in Challenge A).
    - **R3 (Source & Ingestion Labels & Evidence Provenance):** Refined `render(r)` in `web/app.js` to distinguish source declaration from ingestion method (`IMPORTED TRACE · DECLARED SYNTHETIC ORIGIN`, `IMPORTED TRACE · DECLARED CAMERA ORIGIN`, `IMPORTED TRACE · DECLARED VIDEO ORIGIN`, `SAMPLE · ORIGIN UNVERIFIED`, `LIVE CAMERA · EXPERIMENTAL`, `LOCAL VIDEO · ORIGIN UNVERIFIED`). Updated `evidenceCard` to mark generic sample as `is_synthetic: false`, set `unverified_origin: true`, and document 5-decimal canonical hash rounding in `provenance_note`.
    - **R4 (Strict Release Mode & verify_gemma_live.py Cooldown Assertion):** Added `REQUIRE_LIVE_AI=1` strict release mode in `scripts/test_browser_acceptance.js` that fails closed if credentials, demo token, model `gemma-4-26b-a4b-it`, or live Gemma response are missing or fallback to deterministic. Fixed `scripts/verify_gemma_live.py` lines 97–106 to immediately make a second call `r2` within 10s and assert `'AI cooldown: wait ten seconds'` is returned with HTTP 200 and deterministic provider.
    - **R6 (CI Lockfile Standardization & Negative Timeout Assertion):** Standardized `.github/workflows/ci.yml` on `pip install -r requirements-lock.txt` across all jobs to match Dockerfile. Added automated step verifying that `TEST_NEGATIVE_TIMEOUT=1` exits with non-zero code. Reconciled documentation across markdown files.
  - **Milestone I (Final Pre-UI Engineering Verification & Professional Polish):** VERIFIED.
    - **True Deadline Fallback Safety:** Refactored `/api/explain` in `app/main.py` so that when recomputation times out or errors before a receipt exists, it returns a controlled `unavailable` response rather than executing an unbounded synchronous `analyze()` call outside the timeout scope. Added unit test `test_r1_analysis_failure_before_receipt_exists_returns_unavailable`.
    - **Structured Negative Timeout CI Assertion:** Enhanced `scripts/test_browser_acceptance.js` to write machine-readable summary JSON and updated `.github/workflows/ci.yml` to parse and assert that T11 failed specifically due to forced timeout while all other mandatory tests passed.
    - **Repository Cleanup & Comment Polish:** Removed conversational F-tags and redundant comments from source and test files. Synchronized version badge (`v1.1`) and architectural decisions (D01–D27).
  - **Milestone J (Final Astra Re-Audit Corrections & CI Stability):** VERIFIED.
    - **Fix 1 (Live Gemma Verification Decoupling & Unit Tests):** In `scripts/verify_gemma_live.py`, removed the live cooldown assertion that relied on `time.sleep(0.15)` to guarantee request admission order, preserving live Gemma explanation and authentication tests. Relied on the 3 deterministic mocked cooldown unit tests in `tests/test_audit_remediation.py` as authoritative (`test_cooldown_request_inside_window_returns_deterministic_fallback`, `test_cooldown_request_after_window_proceeds`, `test_cooldown_slow_provider_response_cooldown_starts_at_lock_entry`). Suite expanded to 94 tests.
    - **Fix 2 (Browser Acceptance Startup Hardening & CI Diagnostics):** Enhanced `scripts/test_browser_acceptance.js` with `launchBrowserWithRetry` (2 attempts), piped and sanitized stderr ring buffer, child exit detection, CDP `/json/version` polling readiness, `/json/new` target creation fallback, and dynamic CDP port fallback. Added artifact upload step in `.github/workflows/ci.yml` capturing `test-results/browser-startup-diagnostics.json` if startup fails.
    - **Fix 3 (Documentation & Historical Provenance Correction):** Replaced typographical SHA `3c790d0bcece7a7b8e1f0e4b8ee34681577ffcba` with exact git commit SHA `3c790d088b4345b62c6017101c51a1002309b427` (CI run `40151348462`). Accurately documented offline browser test counts as 13 passed, 4 skipped (17 registered/accounted for). Documented both historical runs at `fdb86b8` (`40151615140` PASS and `40151612925` browser startup failure).
    - **Fix 4 (Judge Evidence Card Honest Provenance Classification):** Added explicit 8-scenario provenance matrix in `web/app.js` and `scripts/test_browser_acceptance.js`. Unauthenticated trace imports from camera/video receive `unverified_origin: true` and `provenance_status: 'declared_not_authenticated'`. Verified downloaded evidence card and trace files from disk.
    - **Fix 5 (Guided Retake Percentage Points Clarification & Canvas Overlay Robustness):** Updated retake comparison delta string to `(+X percentage points)` or `(-X percentage points)` with disclaimer. In `plotOverlay`, prevented call-stack overflows with loop-based bound calculations and lifted pen across timing gaps (`> 0.25s`) on waveform overlay. In browser acceptance T06, asserted actual finite canvas coordinates, original/transformed endpoints, 450-vs-455 waveform points, timing-gap segmentation, and unequal-length spectrum coordinates (150 vs 175 points).
    - **Fix 6 (Deterministic Concurrency & Cancellation Tests):** Replaced arbitrary sleep delays in `tests/test_audit_remediation.py` with `asyncio.Event` barriers across `test_r1_cancelled_task_releases_semaphore`, `test_r1_concurrency_simultaneous_requests_admitted`, and `test_r1_concurrency_max_active_provider_calls_strictly_bounded`.
    - **Fix 7 (Source & Repository Hygiene):** Zero required files deleted; zero secrets in Git; clean professional engineering documentation.
  - **Milestone K (Premium Immersive Frontend/UI Redesign — Vizo × Active Theory):** VERIFIED.
    - **Visual Design System:** Implemented authentic Vizo-inspired dark emerald/black palette (`#030907`, `#071310`, `#10251d`, `#244d2e`, `#3ee89f` luminous accent, `#f1cc8b` amber warning), fine hairline borders, optical grid background textures, and SIL Open Font License typography (Syne, Instrument Sans, IBM Plex Mono).
    - **Active Theory Motion Choreography:** Created interactive hero optical wave canvas simulation with mouse repulsion/parallax, throttled rendering, and `IntersectionObserver` / `visibilitychange` resource-pausing; added scanning laser sweep animation on `.capture-stage` during active recording; integrated reduced-motion media query support.
    - **Modular Lab Cockpit:** Built high-hierarchy 2-column layout (Left: Viewport station with technical cheek reticles, corner brackets, CHEEK_L/CHEEK_R badges, scanning sweep, and status ticker; Right: Floating telemetry cards for BPM, heuristic quality pass rate, and signal provenance).
    - **Scientific Signal Analytics:** Rendered high-precision oscilloscope waveform and periodicity spectrum monitors with fine glowing traces, decibel/amplitude grids, and dual original (solid mint) vs challenge (dashed amber) overlay plotting.
    - **14 Quality Gates & Guided Retake:** Integrated 14 heuristic checks into an expandable telemetry drawer; implemented Guided Retake comparison card computing `(+X percentage points)` deltas without clinical accuracy claims.
    - **Artifact Challenge Lab & Evidence Drawer:** Styled 3 interactive challenge modules (Module A: Timing Dropout, Module B: Conflicting Patch, Module C: Shared Periodic Light) and verification receipt drawer with Gemma 4 commentary engine.
    - **Preserved Compatibility:** Preserved all 38 DOM element IDs, 14 quality checks, `green-evidence-1.1` baseline, and export contracts. Zero regressions in test suite.
    - **Verification & Previews:** Captured 5 high-resolution screenshots across desktop (1440x900) and mobile (390x844); passed all 94 Python tests, 0 JS syntax errors, and 13 PASS / 4 SKIP browser acceptance tests (17 registered/accounted for).
  - **Automated Test Status:** **94 / 94 Python tests passing** in 7.32s; **13 passed, 4 skipped (17 registered/accounted for)** in offline browser acceptance tests; structured negative timeout regression verified.

## Scope and implementation

Complete local source: Python/FastAPI/SciPy backend; premium Vizo × Active Theory dark emerald frontend; fixed-patch browser camera/video RGB extraction; JSON input; three synthetic fixtures; all-checks quality gate (v1.1); waveform/spectrum; 3-challenge artifact lab; guided retake analysis; downloadable receipts, traces, and judge evidence card; live Gemma 4 REST explanation with deterministic fallback; Docker packaging for DigitalOcean. No neural rPPG, face tracking, database or clinical output.

## Git Status

- Git repository: `https://github.com/sg721642/hiperpulse.git`.
- Working branch: `main` / `remediation/audit-hardening`.
- Latest verified historical commits: `3c790d088b4345b62c6017101c51a1002309b427`, `fdb86b8f01e160ce1f378599e8fcc42b3cac2415`, and `8ac073d1741e6facea6df9875e2f1e2e2a748653`.
- Latest verified audit-polish baseline: `b10c5cbe524fc6c0d310787d5cc92cc396276a36` (Docs sync: `451e17849e7bdf8f237f37477b79d8ce8646b1eb`).
- Redesigned frontend verified and staged for owner review.

## Mandatory Release Gates

1. `NEXT_STAGE: OWNER_VISUAL_UI_REVIEW_AND_FINAL_APPROVAL` — The redesigned frontend is implemented, tested, and visually captured. Hard stop enforced awaiting owner visual review and approval before cloud deployment.
2. `DIGITALOCEAN_DEPLOYMENT: BLOCKED_PENDING_UI_APPROVAL_AND_OWNER_AUTHORIZATION`
3. `API_KEY_ROTATION: REQUIRED_BEFORE_PUBLIC_DEPLOYMENT` — The development Gemini API key is marked for local use only and must be revoked and rotated before any public production deployment.

## Immediate Next Smallest Task

Hard stop at Owner Visual Review Checkpoint. Present the implemented Vizo × Active Theory frontend, desktop/mobile screenshots, typography licensing, and test verification results to the project owner for their visual approval.
