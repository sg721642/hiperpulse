# Developer Workflow & Milestone Handoff Guide

This document defines standard engineering protocols, verification procedures, and milestone handoff contracts for contributors working on HiperPulse.

## 1. Project Overview & Architectural Invariants

HiperPulse is an experimental, evidence-first remote photoplethysmography (rPPG) prototype built for the Hacktoberfest Hack Day brief.

- **Primary Goal:** Extract timestamped two-patch facial skin color traces from video/camera and compute experimental pulse-like waveforms, frequency spectra, and estimated BPM.
- **Invariants:** 
  - BPM is nullable: Any failed quality check must result in `bpm: null`.
  - Quality score is the percentage of heuristic gates passed, not clinical accuracy.
  - Video frames stay client-side; only extracted RGB traces leave the device.
  - Gemma 4 provides explainable commentary on calculated telemetry; it never alters numbers or diagnoses health.

## 2. Environment & Verification Protocol (M1)

For fresh workspace setup and reproduction:
- Python 3.12+ virtual environment using `requirements-lock.txt`.
- Automated test suite execution: `pytest tests/`.
- Client syntax validation: `node --check web/app.js`.
- Local verification on `http://127.0.0.1:8080` covering clean, artifact, and flat signal fixtures.

## 3. Optical Capture & Video Verification (M2)

When verifying camera capture and video ingestion:
- Validate `requestVideoFrameCallback` high-precision timestamping.
- Verify zero duplicated frame intervals and timing jitter tolerances.
- Enforce strict 30-second duration boundaries.
- Verify background-tab visibility handling and clean capture cancellation on tab hide.

## 4. Signal Processing & Numerical Audit (M3)

When auditing algorithm heuristics in `app/signal.py`:
- 3rd-order Butterworth SOS bandpass filtering (0.7–3.0 Hz / 42–180 BPM search band).
- Welch power spectral density estimation with $N_{\text{fft}} \ge 2048$.
- Dual-estimator consensus: Welch peak and autocorrelation peak agreement.
- Threshold adjustments require empirical sensor calibration data and regression tests.

## 5. Gemma 4 Integration Protocol (M4)

When configuring Google DeepMind's open-weight Gemma 4 model:
- Secure server-side credential loading via `.env` (strictly Git-ignored).
- Verify access to `gemma-4-26b-a4b-it` supporting multimodal content generation.
- Bounded timeout budget (80s) with graceful fallback to transparent deterministic commentary.
- Enforce non-biometric prompt sanitization (no raw facial imagery or private timestamps).

## 6. Cloud Deployment & Packaging (M5/M6)

For containerization and cloud release:
- Single-stage non-root container packaging (`python:3.12-slim`, non-root user).
- Health check monitoring via `/api/health`.
- DigitalOcean App Platform specification (`deploy/digitalocean/app.yaml`).

## 7. Collaborative Handoff Protocol

When handing off between distributed engineers or sessions:
- Record exact commands, passed test counts, and updated files in `docs/PROJECT_STATE.md`.
- Document architectural tradeoffs in `docs/DECISIONS.md`.
- Maintain source bundles and plan synchronization using `scripts/build_bundle.py`.

