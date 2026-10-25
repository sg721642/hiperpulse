# HiperPulse Evidence Ledger

**Authoritative Record of Software Verification, Test Evidence, and Environment Audits**  
*Maintained under Phase 0 & Phase 4 of Independent Audit Remediation.*

---

## 1. Environment & Baseline Audit

- **Date:** 25 October 2026
- **Audited Commit:** `06ec6c7cdefa54520fe020f7f0e8faeffe725432`
- **Host OS:** macOS (Darwin arm64)
- **Runtime:** Python 3.12.15, Node v20+
- **Repository Remote:** `https://github.com/sg721642/hiperpulse.git`

---

## 2. Audit Findings Reproduction Ledger

| Finding ID | Subject | Defect Summary | Reproduction Command / Method | Observed Status |
|---|---|---|---|---|
| **F01** | Credential Exposure & Weak Token | Shared demo password `hiperpulse` was present in documentation; dev Gemini key appeared in chat transcripts. | Inspected `docs/PROJECT_STATE.md`, `docs/VALIDATION.md`, `.env`. | **REPRODUCED** — Immediate rotation to strong random local token and documentation sanitization required. |
| **F02** | Fresh-Checkout Dependencies | Lockfile has `scipy==1.18.1` while `requirements.txt` has `1.15.2`. `imageio-ffmpeg` missing from declared dependencies, causing 3 video test failures on fresh environments without global ffmpeg. | Audited `requirements.txt` vs `requirements-lock.txt` and `tests/test_video_regression.py`. | **REPRODUCED** — Discrepancies confirmed; `imageio-ffmpeg==0.6.0` needed in test requirements. |
| **F03** | Browser Acceptance False-Pass | Test 11 in `scripts/test_browser_acceptance.js` only pushed to `results` inside `if (videoProcessed)`. If playback stalled/timed out, Test 11 was omitted from `results`, allowing `results.every(r => r.pass)` to falsely pass. | Inspected `scripts/test_browser_acceptance.js:418-437`. | **REPRODUCED** — Confirmed missing `else` branch and lack of pre-registered test case count. |
| **F05** | Both-Patch Exposure Gate Defect | `mean_light = min(left.mean(), right.mean())` allows a severely overexposed patch (~240) to pass 100% checks if the other patch is normal (~110). | Inspected `app/signal.py:87,96`. Simulated left=110, right=240 -> passed with 72 BPM / 100%. | **REPRODUCED** — Both cheek patches must be independently required to satisfy [20, 235]. |
| **F06** | Camera/Video Reimport Source & Hash | `web/app.js:166` forces reimported non-synthetic traces to `data.source = 'sample'`. Because `input_sha256` hashes `data` including `source`, reimporting an exported camera trace mutates the input hash despite unchanged numerical signals. | Inspected `web/app.js:166` and `app/signal.py:109`. | **REPRODUCED** — Contract needed separating acquisition source, ingestion method, and canonical numerical signal hash. |
| **F07** | End-to-End Gemma Deadline | HTTPX timeout 90s + retry 2s + 90s retry = 182s potential backend duration, exceeding the browser's 95s fetch timeout. | Inspected `app/main.py:126` and `web/app.js:18`. | **REPRODUCED** — Server generation deadline budget must be strictly bounded below client timeout. |
| **F08** | Verification Claims & Assertion Audits | Video decoder substituted 30fps fallback on missing PTS; boundary tests did not check exact 7199/7200/7201 frames; gate isolation was incomplete. | Inspected `tests/test_video_regression.py:48-49` and `tests/test_m5_robustness.py`. | **REPRODUCED** — Tests need precise boundary checks and explicit PTS error handling. |
| **F09** | Abuse Limits & In-Flight Concurrency | 10s cooldown was in-memory only; no authentication check before payload validation; unbounded concurrent requests could overwhelm upstream quota. | Inspected `app/main.py:73-95`. | **REPRODUCED** — Bounded concurrency semaphore and early token validation required. |
| **F10** | Continuous Integration & License | No GitHub Actions workflow configured in repo. No explicit open-source license file. | Checked `.github/workflows/` and root directory. | **REPRODUCED** — CI workflow and MIT license proposal needed. |
| **F11** | Documentation Reconciliation | Outdated 34-test mentions in README; conflicting Docker descriptions; missing evidence ledger. | Cross-checked documentation files against test suite and Dockerfile. | **REPRODUCED** — Full reconciliation required across all markdown documents. |

---

## 3. Verification Log

### Milestone A: Security Hygiene & Reproducibility (F01, F02) — VERIFIED
- **F01 (Credential Remediation):**
  - Generated private cryptographically random 48-hex token (`secrets.token_hex(24)`) in local `.env`.
  - Sanitized `docs/PROJECT_STATE.md`, `docs/VALIDATION.md`, and `.env.example` of all literal demo credentials.
  - Recorded security gates: `DEVELOPMENT_API_KEY: EXPOSED_LOCAL_USE_ONLY`, `PRODUCTION_KEY_ROTATION: REQUIRED_BEFORE_PUBLIC_DEPLOYMENT`.
- **F02 (Dependency & Fresh-Checkout Reproducibility):**
  - Aligned `requirements.txt` and `requirements-lock.txt` to `scipy==1.18.1` and added `imageio-ffmpeg==0.6.0`.
  - Configurable browser runner parameters (`PORT`, `CDP_PORT`, `BROWSER_BIN`) with automated cross-platform binary discovery.
  - Documented Python 3.12+ and Node.js 20+ LTS requirements in `README.md` and `START_HERE.md`.

### Milestone B: Invariant Integrity & Identity (F03, F05, F06) — VERIFIED
- **F05 (Both-Patch Exposure Gate):**
  - Upgraded algorithm version to `green-evidence-1.1`.
  - Fixed both-patch exposure evaluation: both patches independently required in biological range `[20, 235]`.
  - Verified with 6 isolated test cases in `tests/test_audit_remediation.py`: patch 1 ~110 and patch 2 ~240 (which falsely passed in 1.0) now strictly withholds BPM with `insufficient_quality`.
- **F06 (Trace Reimport & Canonical Signal Hash):**
  - Introduced canonical `signal_sha256` hashing raw numeric arrays (`timestamps`, `left`, `right`, `clipping` rounded to 5 decimal places).
  - Preserved verbatim `input_sha256` for backward compatibility.
  - Added `ingestion` field to Pydantic model (`live_capture`, `local_video`, `json_import`, `synthetic_fixture`, `sample`, `direct`).
  - Browser test T07 verified in headless Brave using real file-input reimport (`File` and `DataTransfer`): reimported traces preserve canonical `signal_sha256`.
- **F03 (Browser Test Suite Defect & Pre-Registration):**
  - Pre-registered all 17 tests in `REGISTERED_TESTS`. Explicit status reporting: PASS, FAIL, SKIP, BLOCKED.
  - Verified with negative regression flag `TEST_NEGATIVE_TIMEOUT=1`: correctly fails with code 1.
  - Full browser runner verified: **17 / 17 tests processed, ALL PASS**.

### Milestone C: Server Deadline & Abuse Protection (F07, F08, F09) — VERIFIED
- **F07 (Server Generation Budget):**
  - Set `AI_TIMEOUT_BUDGET_SECONDS = 60.0` in `app/main.py`, strictly bounded below client fetch timeout (95s). Clean deterministic fallback on budget expiry.
- **F08 (Audit Test Assertions):**
  - True PTS extraction required in `tests/test_video_regression.py` (raises `ValueError` on mismatch; no synthetic grids invented).
  - Added boundary tests for exact 7199, 7200, and 7201 frames.
  - Verified all 14 gates individually withhold BPM.
- **F09 (Abuse Protections):**
  - Demo password authenticated early before executing CPU-heavy signal processing.
  - Concurrency limited via `asyncio.Semaphore(2)`.
  - Cooldown gate (10s) verified in automated unit tests.

### Product Differentiators — VERIFIED
- **Differentiator 1 (Guided Retake):**
  - Implemented `getRetakeAdvice(checks)` mapping failed checks into prioritized actionable guidance: Lighting & Exposure, Motion & Stability, Timing & Background Interruptions, and Patch Alignment.
  - Transient in-memory session comparison (`previousSession`): calculates score delta, BPM change, passed gates delta, improved checks, and regressed checks.
  - Clean session wipes comparison state completely.
- **Differentiator 2 (Artifact Challenge Lab):**
  - Three controlled scientific challenges on in-memory trace copies:
    - Challenge A (Timing Dropout): 0.35s PTS gap triggers `largest_gap_seconds` gate failure, withholding BPM.
    - Challenge B (Conflicting Patch): 1.85 Hz sine on right patch triggers `patch_difference_bpm` gate failure, withholding BPM.
    - Challenge C (Shared Periodic Light): 1.2 Hz sine on both patches passes heuristic gates, honestly demonstrating the fundamental limitation of optical rPPG under shared ambient light.
- **Differentiator 3 (Judge Evidence Card):**
  - Downloadable structured JSON record (`hiperpulse-judge-evidence.json`) containing application metadata, git commit SHA, algorithm `green-evidence-1.1`, canonical signal hash, passed/failed gate checklists, exposure metrics, retake advice, and scientific wellness disclaimers.

### Milestone D: CI Workflow & Licensing (F10) — VERIFIED
- **F10 (CI & License):**
  - Created `.github/workflows/ci.yml`: runs Python 3.12 pytest, Node.js 20 syntax checks, FFmpeg system tests, bundle build verification, and secret leakage prevention.
  - Created permissive `LICENSE` (MIT) with third-party notices preserved.

### Milestone E: Documentation Reconciliation & Bundles (F11) — VERIFIED
- Updated `docs/EVIDENCE_LEDGER.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, `docs/VALIDATION.md`.
- Regenerated `FULL_SOURCE.md` and `HIPERPULSE_FINAL_IMPLEMENTATION_PLAN.md` via `scripts/build_bundle.py`.
- Automated test totals: **59 Python unit tests passing**, **17 / 17 browser acceptance tests passing**.

### Milestone F: Post-Audit Consistency Fixes & Pre-UI Verification — VERIFIED
- **Section A (Authoritative Guided Retake Mapping):**
  - Synchronized `getRetakeAdvice()` check identifiers in `web/app.js` with the 14 actual quality gates in `app/signal.py`.
  - Established deterministic priority categorization (`lighting`, `stability`, `alignment`, `timing`, `boundary`, `accepted`).
  - Added test `test_retake_advice_mapping_all_categories` proving each category correctly maps and that clean samples returning 100% checks do not trigger retake recommendations.
- **Section B (Dynamic Build Provenance & Distinct Hash Semantics):**
  - Replaced hardcoded historical commit hash with dynamic `get_git_sha()` endpoint (`/api/health` and `/api/meta`), querying `GIT_SHA` env var, `build_info.json`, `git rev-parse HEAD`, or `"unknown"`.
  - Added regression test `test_build_info_provenance_not_stale` proving provenance matches live repository HEAD and never reports a stale SHA.
  - Formally documented distinction: Canonical `signal_sha256` ensures trace numeric integrity; Git SHA ensures software build traceability; neither proves hardware camera origin.
- **Section C (Artifact Challenge Explanations & Threshold Parity):**
  - Corrected Challenge A continuity rule to `<= 0.20 s` (matching `dt.max() <= 0.2` in `app/signal.py:101`).
  - Refactored Challenge Lab explanations to be dynamically derived from backend returned receipts rather than static assumptions.
  - Stored structured `activeChallenge` metadata in session state and serialized into `hiperpulse-judge-evidence.json`.
- **Section D (Artifact Lab & Canvas Plot Overlays):**
  - Added non-intrusive dashed amber plot overlays (`plotOverlay`) on `#wave` and `#spectrum` canvases allowing direct visual comparison between original and challenge-modified signals.
  - Enforced AI explanation provenance reset on new trace acquisition and session clear.
- **Section E (CI Workflow Hardening & 3-Job Architecture):**
  - Fixed pytest collection error (`ModuleNotFoundError: No module named 'app'`) via `pythonpath = .` in `pytest.ini` and `PYTHONPATH: .` in CI.
  - Expanded `.github/workflows/ci.yml` into 3 jobs: `test` (unit tests & bundle sync), `browser-acceptance` (offline CDP browser runner), and `docker-smoke` (container build, startup, health check & Git SHA verification).
- **Automated Test Totals:** **62 Python unit & integration tests passing** in 4.96s; **17 / 17 browser acceptance tests passing**.

### Milestone G: Technical Hardening & Pre-UI Verification Completion — VERIFIED
- **Section A (Cryptographic Fixture Manifest):**
  - Eliminated all filename regex matching (`/^(test_video|synthetic|fixture)/i`).
  - Implemented cryptographic SHA-256 fixture manifest (`scripts/build_manifest.py`, `samples/trusted_fixtures.json`, `web/trusted_fixtures.json`) for deterministic synthetic attribution. Unknown local videos classified as `LOCAL VIDEO (UNVERIFIED ORIGIN) · EXPERIMENTAL` (`source: 'video'`, `ingestion: 'local_video'`).
- **Section B (Parameterized Gate Testing & CDP Download):**
  - Added 11 mandatory regression tests A through K in `tests/test_audit_remediation.py`.
  - Parameterized all 14 quality gates in `app/signal.py`, validating isolated gates (`duration_seconds`, `largest_gap_seconds`, `mean_green`, `clipped_pixel_fraction`, `search_boundary_bpm`) with exact 93% score and coupled gates.
  - Upgraded browser acceptance test T07: real browser download of trace and judge evidence card to disk, reading and validating downloaded bytes from filesystem, reimport via native CDP `DOM.setFileInputFiles`, and asserting round-trip signal hash invariance (`signal_sha256`) and `ingestion: 'json_import'`. Verified negative timeout regression (`TEST_NEGATIVE_TIMEOUT=1`).
- **Section C (Security & Packaging):**
  - Added fault-injection & security tests for Gemma deadline budget, transient 500 retry, malformed responses, Semaphore(2) concurrency bounding, and unauthenticated 401 gate. Confirmed zero API key leakage.
  - Reconciled documentation: Node 22 LTS CI / Node 20+ runtime compatibility, single-stage slim Docker image, qualified DigitalOcean hosting estimates, tier-dependent Gemini quotas, process-local cooldown vs cloud budget alerts, and heuristic pass percentage quality score.
  - Validated package reproducibility with `scripts/build_bundle.py` and extracted `HiperPulse_Implementation_Kit.zip`, running all 78 tests cleanly with zero leaked secrets.

### Milestone H: Astra Re-Verification Remediation R1–R6 & Final Pre-UI Checkpoint — VERIFIED
- **R1 (True End-to-End Gemma Monotonic Deadline & Concurrency Hardening):**
  - Enforced a single monotonic deadline budget (`60.0s`) in `app/main.py` covering semaphore queue admission, signal recomputation, and HTTPX provider execution/retries.
  - Configured configurable `AI_COOLDOWN_SECONDS` (default 10.0s).
  - Replaced weak internal semaphore checks with 12 deterministic concurrent/mocked-provider tests in `tests/test_audit_remediation.py`.
- **R2 (Artifact Challenge Overlay Separate X/Y Axes):**
  - Refactored `plotOverlay(id, xs1, ys1, xs2, ys2, color1, color2)` in `web/app.js` to compute shared domain bounds `[xMin, xMax]` and `[low, high]` and plot each curve against its own timestamps/frequencies with `Number.isFinite` checks, eliminating `NaN` coordinates and canvas draw errors for disparate array lengths (e.g. 450 vs 455 points in Challenge A).
- **R3 (Source & Ingestion Labels & Evidence Provenance):**
  - Refined `render(r)` in `web/app.js` to distinguish source declaration from ingestion method (`IMPORTED TRACE · DECLARED SYNTHETIC ORIGIN`, `IMPORTED TRACE · DECLARED CAMERA ORIGIN`, `IMPORTED TRACE · DECLARED VIDEO ORIGIN`, `SAMPLE · ORIGIN UNVERIFIED`, `LIVE CAMERA · EXPERIMENTAL`, `LOCAL VIDEO · ORIGIN UNVERIFIED`).
  - Updated `evidenceCard` to mark generic sample as `is_synthetic: false`, set `unverified_origin: true`, and document 5-decimal canonical hash rounding in `provenance_note`.
- **R4 (Strict Release Mode & verify_gemma_live.py Cooldown Assertion):**
  - Added `REQUIRE_LIVE_AI=1` strict release mode in `scripts/test_browser_acceptance.js` failing closed if credentials, demo token, model `gemma-4-26b-a4b-it`, or live Gemma response are missing or fallback to deterministic.
  - Fixed `scripts/verify_gemma_live.py` lines 97–106 to immediately make a second call `r2` within 10s and assert `'AI cooldown: wait ten seconds'` is returned with HTTP 200 and deterministic provider.
- **R5 (Strengthen Product Differentiators & Flat Challenge C):**
  - Added automated browser checks for complete Guided Retake cycle (poor -> retake advice -> improved trace -> delta score comparison `+36%`) and Challenge C flat baseline scenario exhibiting optical rPPG false-consensus limitation without threshold alterations.
  - Added Python unit test `test_challenge_c_optical_flicker_on_flat_baseline_demonstrates_limitation`.
- **R6 (CI Lockfile Standardization & Negative Timeout Assertion):**
  - Standardized `.github/workflows/ci.yml` on `pip install -r requirements-lock.txt` across all jobs to match Dockerfile.
  - Added automated step verifying that `TEST_NEGATIVE_TIMEOUT=1` exits with non-zero code. Reconciled documentation across markdown files.
- **Automated Test Totals:** **91 / 91 Python tests passing** in 7.46s; **17 / 17 browser acceptance tests passing** in headless Brave via CDP; structured negative timeout regression verified.

### Milestone I: Final Pre-UI Engineering Verification & Professional Polish — VERIFIED
- **Section A (True Deadline Fallback Safety):**
  - Updated `/api/explain` in `app/main.py` so that when recomputation times out or encounters an error before an authoritative receipt exists, it returns a controlled `unavailable` response rather than executing an unbounded synchronous `analyze()` call outside the timeout scope.
  - Added unit test `test_r1_analysis_failure_before_receipt_exists_returns_unavailable` and strengthened `test_r1_timeout_during_signal_recomputation` verifying single worker execution and no fabricated BPM or gate results.
- **Section B (Structured Negative Timeout CI Assertion):**
  - Enhanced `scripts/test_browser_acceptance.js` to emit a machine-readable JSON acceptance summary (`test-results/negative-timeout-summary.json`).
  - Updated `.github/workflows/ci.yml` to parse the JSON summary and assert specifically that T11 failed due to forced timeout while pre-tests T01–T10 and subsequent tests T12, T17 passed, guaranteeing that unrelated setup or browser failures cannot masquerade as regression detection.
- **Section C (Code and Documentation Polish):**
  - Removed conversational tags, redundant comments, and internal tracking labels from application and test code.
  - Synchronized documentation, decision records (D01–D27), and version metadata.

### Milestone J: Final Astra Re-Audit Corrections & CI Stability — VERIFIED
- **Fix 1 (Live Gemma Verification Decoupling & Unit Tests):**
  - In `scripts/verify_gemma_live.py`, removed the live cooldown assertion that relied on `time.sleep(0.15)` to guarantee request admission order, preserving genuine live Gemma explanation and authentication tests.
  - Relied on the 3 deterministic mocked cooldown unit tests in `tests/test_audit_remediation.py` as authoritative (`test_cooldown_request_inside_window_returns_deterministic_fallback`, `test_cooldown_request_after_window_proceeds`, `test_cooldown_slow_provider_response_cooldown_starts_at_lock_entry`). Suite expanded to 94 tests.
- **Fix 2 (Browser Acceptance Startup Hardening & CI Diagnostics):**
  - Enhanced `scripts/test_browser_acceptance.js` with `launchBrowserWithRetry` (2 attempts), piped and sanitized stderr ring buffer, child exit detection, CDP `/json/version` polling readiness, `/json/new` target creation fallback, and dynamic CDP port conflict fallback.
  - Added artifact upload step in `.github/workflows/ci.yml` capturing `test-results/browser-startup-diagnostics.json` if browser startup fails.
- **Fix 3 (Documentation & Historical Provenance Correction):**
  - Replaced typographical SHA `3c790d0bcece7a7b8e1f0e4b8ee34681577ffcba` with exact git commit SHA `3c790d088b4345b62c6017101c51a1002309b427` (CI run `40151348462`).
  - Accurately documented offline browser test counts as 13 passed, 4 skipped (17 registered/accounted for).
  - Documented both historical runs at `fdb86b8` (`40151615140` PASS and `40151612925` browser startup failure), baseline `8ac073d` (`40153753168` and `40153755537`), and latest verified baseline `b10c5cb` with successful CI runs `40155642898` (`main`) and `40155645818` (`remediation/audit-hardening`).
- **Fix 4 (Judge Evidence Card Honest Provenance Classification):**
  - Added explicit 8-scenario provenance matrix in `web/app.js` and `scripts/test_browser_acceptance.js`. Unauthenticated trace imports from camera/video receive `unverified_origin: true` and `provenance_status: 'declared_not_authenticated'`.
  - Verified downloaded evidence card and trace files from disk.
- **Fix 5 (Guided Retake Percentage Points Clarification & Canvas Overlay Robustness):**
  - Updated retake comparison delta string to `(+X percentage points)` or `(-X percentage points)` with disclaimer.
  - In `plotOverlay`, prevented call-stack overflows with loop-based bound calculations and lifted pen across timing gaps (`> 0.25s`) on waveform overlay. In browser acceptance T06, asserted actual finite canvas coordinates, original/transformed endpoints, 450-vs-455 waveform points, timing-gap segmentation, and unequal-length spectrum coordinates (150 vs 175 points).
- **Fix 6 (Deterministic Concurrency & Cancellation Tests):**
  - Replaced arbitrary sleep delays in `tests/test_audit_remediation.py` with `asyncio.Event` barriers across `test_r1_cancelled_task_releases_semaphore`, `test_r1_concurrency_simultaneous_requests_admitted`, and `test_r1_concurrency_max_active_provider_calls_strictly_bounded`.
- **Fix 7 (Source & Repository Hygiene):**
  - Zero required files deleted; zero secrets in Git; clean professional engineering documentation.
- **Automated Test Totals:** **94 / 94 Python tests passing** in 7.17s; **13 passed, 4 skipped (17 registered/accounted for)** in offline browser acceptance tests (17 / 17 passed when live AI configured and consent granted); structured negative timeout regression verified.


