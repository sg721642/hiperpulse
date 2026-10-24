# Validation record

Prepared 25 October 2026. This file separates observed software checks from tasks requiring hardware/accounts. No human accuracy claim is made.

## Automated checks newly reproduced in this workspace

- **Date:** 25 October 2026
- **Environment:** macOS 15+ (Darwin arm64), Python 3.12.15, pytest 8.3.5, SciPy 1.18.1 (updated per D14).
- **Command:** `.venv/bin/python -m pytest`
- **Result:** **41 passed in 1.86s**, 0 failures, 0 errors.
  - 34 baseline unit and API tests (`tests/test_api.py`, `tests/test_pipeline.py`)
  - 7 video regression tests (`tests/test_video_regression.py`):
    - Constant 30s WebM trace passes all 14 gates (72 BPM, 100% quality checklist)
    - 12s short video fails duration gate (`duration_seconds`, 93% score, BPM null)
    - Gapped video (2s pause) fails `largest_gap_seconds` and `timing_variation` (BPM null)
    - Timing jitter fails `timing_variation`
    - Duplicate timestamps / callbacks rejected (HTTP 422 / ValueError)
    - Non-monotonic timestamps rejected (HTTP 422 / ValueError)
    - Out-of-bounds duration (>60s) rejected (HTTP 422 / ValueError)

- **JavaScript Syntax Check:** `node --check web/app.js` -> **PASSED**.

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

## Milestone M4: Real Gemma 4 Integration Verification

- **Date:** 25 October 2026
- **Configured Model ID:** `gemma-4-26b-a4b-it` via Google Gemini REST API (`https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent`).
- **Account Model Discovery (`scripts/check_model.py`):**
  - Confirmed available model listing: `models/gemma-4-26b-a4b-it` supporting `['generateContent', 'countTokens']`.
- **Reasoning Model Architecture & Tuning (Decision D17):**
  - Diagnosis: `gemma-4-26b-a4b-it` is an instruction-tuned Mixture-of-Experts reasoning model. It outputs internal reasoning tokens (`thought: True`) consuming ~800–1500 tokens before emitting the user-facing text part. The initial 500-token cap caused `MAX_TOKENS` truncation before non-thought text was emitted.
  - Solution: Increased `maxOutputTokens` to 4096, backend `httpx` timeout to 90s, frontend fetch timeout to 95s, and added a 2-second retry for transient 500/503 errors.
- **Live Provider Evidence:**
  - **Test A (Clean Synthetic Input):**
    - Status: HTTP 200 (live provider `Gemma 4 / gemma-4-26b-a4b-it`)
    - Notice: `AI commentary; the calculated receipt remains authoritative.`
    - Text: *"This report uses synthetic data, not a person. The recorded BPM is 72. All signal quality checks passed. Note that a passed check does not establish a real pulse. To improve future recordings, try to reduce motion and lighting changes."*
  - **Test B (Failed-Quality Artifact Input):**
    - Status: HTTP 200 (live provider `Gemma 4 / gemma-4-26b-a4b-it`)
    - Notice: `AI commentary; the calculated receipt remains authoritative.`
    - Text: *"This is synthetic data, not a person. The signal quality is insufficient, and the BPM is withheld. The most relevant failed checks are patch_difference_bpm (38.6719) and estimator_difference_bpm (54.4922). To improve the recording, keep both patches on the cheeks. Note that a passed check does not establish a real pulse."*
  - **Test C (Security & Fallback):**
    - Invalid demo token: HTTP 401 `{"detail":"Enter the demo password to use Gemma."}`.
    - Missing demo token: HTTP 401 `{"detail":"Enter the demo password to use Gemma."}`.
    - AI cooldown: Request within 10s returns deterministic fallback (`"AI cooldown: wait ten seconds."`).
    - Server-side fallback: Deterministic explanation returned if key unconfigured or transient error unresolvable.
- **Standalone Verification Runner:** `scripts/verify_gemma_live.py` passed all assertions.

## Root-Cause Diagnosis: Synthetic WebM Timestamp Discontinuity

- **Observed Defect:** `samples/test_video_30s.webm` previously contained 703 frames instead of 900, with a 5.346-second timestamp gap between Frame 10 (`pts_time: 0.330s`) and Frame 11 (`pts_time: 5.676s`).
- **Bit-Level Container Diagnosis:** EBML block analysis and FFmpeg `showinfo` confirmed the gap was baked directly into the encoded WebM file's SimpleBlocks.
- **Root Cause:** In Chromium/Brave headless mode, `--virtual-time-budget` accelerates DOM execution, but `MediaRecorder` runs on an asynchronous OS/encoder thread relying on `base::TimeTicks`. The encoder thread stalled during initialization, resulting in a ~5.3s jump between early frames before stabilizing.
- **Correction:** Implemented deterministic FFmpeg raw-pipe generation (`scripts/export_video_fixtures.py`) piping exact raw RGB24 frames into `libvpx-vp9` and `libx264`. Result: exactly 900 frames at constant 30 fps, maximum delta 0.034s, 0 gaps > 0.2s, timing variation 0.0141.
- **Gate Vindicated:** `app/signal.py` gates `largest_gap_seconds <= 0.20s` and `timing_variation <= 0.20` correctly caught and withheld the defective file as designed.

## Required manual checks status

| Check | Expected | Status in this Workspace |
|---|---|---|
| Automated unit & API test suite | 41 passed | VERIFIED (41 passed in 1.86s) |
| JavaScript syntax check | Passes node --check | VERIFIED |
| Sample analyze endpoints | 72 BPM / null withholding | VERIFIED (Clean 72/100%, Artifact null/86%, Flat null/64%) |
| Artifact comparison lab | Original preserved, copy withheld | VERIFIED (Original 72/100%, Copy null/79%, 3 failed gates) |
| JSON load and export round trip | Same meaningful receipt/hash after normalization | VERIFIED (Deterministic SHA-256 match, 14 checks preserved) |
| Desktop viewport layout | Dual-column cards, no overlap | VERIFIED (1280x1024 screenshot inspected via Brave headless) |
| Mobile/narrow viewport | Readable controls, no clipped cards | VERIFIED (375x812 single-column responsive layout inspected) |
| Public GitHub repository | Code, lock, docs synchronized | VERIFIED (https://github.com/sg721642/hiperpulse) |
| Desktop webcam, steady light, 30 s | Completion, observed gates, honest output | NOT RUN (pending physical host webcam test; lifecycle automated via fake media) |
| Phone browser over HTTPS | Camera permission and timed capture | NOT RUN (pending deployment) |
| Camera denial / consent | Useful message, samples remain available | VERIFIED (Automated in CDP acceptance test 2) |
| Stop during capture | Tracks stopped, incomplete trace discarded | VERIFIED (Automated in CDP acceptance test 8) |
| Hide tab during capture | Abort; no stale estimate | VERIFIED (Automated in CDP acceptance test 9) |
| Local video supported codec | Process first <=30 s, maintain timestamps | VERIFIED (Automated in CDP acceptance tests 11 & 12) |
| Actual Gemma 4 provider | Correct provider/model, no unsupported interpretation | VERIFIED (Live calls to gemma-4-26b-a4b-it in CDP tests 14 & 15 and verify_gemma_live.py) |
| Actual provider timeout/quota | Labelled deterministic fallback | VERIFIED (Mocked + live transient retry and cooldown fallback verified) |
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
