# Validation record

Prepared 25 October 2026. This file separates observed software checks from tasks requiring hardware/accounts. No human accuracy claim is made.

## Automated checks newly reproduced in this workspace

- **Date:** 25 October 2026
- **Environment:** macOS 15+ (Darwin arm64), Python 3.12.15, pytest 8.3.5, SciPy 1.18.1 (updated per D14).
- **Command:** `.venv/bin/python -m pytest`
- **Result:** **34 passed in 1.27s**, 0 failures, 0 errors.
  - Upstream warning: Starlette `BlockingPortal` deprecation notice.
  - Non-fatal warnings: SciPy SOS filter divide/overflow on deliberate flat/zero signals in test cases.
- **Coverage:**
  - Clean synthetic 72 BPM: returns `72 BPM`, `100%` checks passed, `accepted_experimental`.
  - Frequency range (48, 60, 90, 120, 150, 168 BPM): all within ±2 BPM.
  - Conflicting patches & flat signals: correctly withheld (`bpm: null`, `insufficient_quality`).
  - Noise: withheld.
  - Missing/irregular frame gaps (>0.2s): withheld.
  - Short signal (<20s): withheld.
  - High clipping (>0.05): withheld.
  - Invalid data (duplicate timestamps, reverse timestamps, NaN, length mismatch, out-of-range RGB, too short): returns HTTP 422 / ValueError.
  - Receipt hash: deterministic and sensitive to single-value perturbation.
  - Documented limitation: common-mode artifact verified.
  - API endpoints: headers, cache-control, CSP `frame-ancestors 'none'`, 2MB payload cap (HTTP 413), 404 on missing fixtures.
  - Provider fallback & auth: no-key deterministic fallback, 401 on wrong demo token, mock provider success/failure, 4 malformed provider shape regressions.

- **JavaScript Syntax Check:** `node --check web/app.js` -> **PASSED**.

## Interactive server verification (local 127.0.0.1:8080)

- `GET /api/health`: HTTP 200 `{"ok":true,"ai_configured":false}`.
- `GET /api/sample/clean` + `POST /api/analyze`: **72 BPM**, **100% checks passed**, status `accepted_experimental`.
- `GET /api/sample/artifact` + `POST /api/analyze`: **BPM: null**, **86% checks passed**, status `insufficient_quality`.
- `GET /api/sample/flat` + `POST /api/analyze`: **BPM: null**, **64% checks passed**, status `insufficient_quality`.

## Historical browser verification (prior workspace)

- Clean synthetic sample: **72 BPM**, **100%** checks passed, synthetic/not-a-person label visible, waveform and spectrum rendered.
- Artifact comparison: original **72 BPM / 100%**; modified copy **BPM withheld / 79%**.
- Artifact sample: **BPM withheld / 86%** checks passed.
- Flat sample: **BPM withheld / 64%** checks passed.
- Clear session: results reset and export/explanation buttons disabled.

## Required manual checks status

| Check | Expected | Status in this Workspace |
|---|---|---|
| Automated unit & API test suite | 34 passed | VERIFIED (34 passed, 1.27s) |
| JavaScript syntax check | Passes node --check | VERIFIED |
| Sample analyze endpoints | 72 BPM / null withholding | VERIFIED |
| Desktop webcam, steady light, 30 s | Completion, observed gates, honest output | NOT RUN (pending M2) |
| Phone browser over HTTPS | Camera permission and timed capture | NOT RUN (pending deployment) |
| Camera denial | Useful message, samples remain available | NOT RUN (pending M2) |
| Stop during capture | Tracks stopped, incomplete trace discarded | NOT RUN (pending M2) |
| Hide tab during capture | Abort; no stale estimate | NOT RUN (pending M2) |
| Local video supported codec | Process first <=30 s, maintain timestamps | NOT RUN (pending M2) |
| JSON load and export round trip | Same meaningful receipt/hash after normalization | NOT RUN (pending M3) |
| Mobile/narrow viewport | Readable controls, no clipped cards | NOT RUN (pending M5) |
| Actual Gemma 4 provider | Correct provider/model, no unsupported interpretation | NOT RUN (pending M4 credentials) |
| Actual provider timeout/quota | Labelled deterministic fallback | NOT RUN (mock verified) |
| Docker build | Starts as non-root on 8080 | NOT RUN (pending M6) |
| DigitalOcean health and HTTPS | `/api/health` and interactive samples work | NOT RUN (pending M6) |
| Human/reference comparison | Synchronized documented interval comparison | NOT RUN |

## Known limitations / risks

- Heuristic quality gates are not calibrated medical confidence. Common periodic lighting can pass every check.
- Fixed patches can capture non-skin/background without detection. No face landmarks or motion tracking.
- Simple GREEN is sensitive to illumination, compression, camera settings and skin appearance.
- Spectrum/autocorrelation can share errors; window estimates are not independent validation.
- Client-declared source and unsigned hash are reproducibility aids, not authenticated provenance.
- AI commentary is strictly secondary; deterministic numerical result remains authoritative.
