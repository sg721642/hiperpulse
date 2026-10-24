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

