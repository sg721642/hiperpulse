# HiperPulse — Start Here

Welcome to **HiperPulse: Evidence before estimates**.

## Key Documentation Guide

1. `AGENTS.md` — Invariant rules, safety boundaries, and persistent context.
2. `MASTER_IMPLEMENTATION.md` — Complete specification, signal processing contract, and architecture.
3. `docs/FINAL_AUDIT_AND_EXECUTION.md` — Binding execution contract, release gates, and GitHub policy.
4. `docs/PROJECT_STATE.md` — Live verification state, tested commands, and next concrete task.
5. `docs/DECISIONS.md` — Architectural decision log (D01–D13).
6. `docs/VALIDATION.md` — Automated test results and manual device matrix.
7. `docs/SUBMISSION.md` — Presentation slides outline, demo video script, and release checklist.
8. `THIRD_PARTY_NOTICES.md` — Academic and library attributions.

## Core Invariants

- **BPM is nullable:** If any quality check fails, `bpm: null` and `status: insufficient_quality`. Waveform and spectrum remain visible.
- **Inspectable quality score:** Percentage of 14 heuristic checks passed. Not a clinical confidence or accuracy probability.
- **Fixed patches:** Two fixed cheek patches at normalized coordinates (left: 32%, right: 56%, y: 48%, 12%x12%). Manual alignment aids, not landmark detectors.
- **Client privacy:** Video frames never leave the browser; only derived RGB means are transmitted to the backend.
- **Secondary AI commentary:** Gemma 4 explains calculated evidence; it never computes or alters numeric results.

## Execution Milestones

- [x] **M0: Context & Workspace Recovery** — Reconstructed project files, established dependencies, validated layout.
- [x] **M1: Baseline Verification** — 34 unit/API tests passing, JS syntax check passing, synthetic samples verified (clean 72 BPM / 100%, artifact withheld / 86%, flat withheld / 64%).
- [ ] **M2: Camera/Video Validation** — Test desktop webcam, cancellation, tab-hide, supported video files.
- [ ] **M3: Evidence UX & Receipts** — SHA-256 evidence receipt verification, artifact stress comparison, export/reimport.
- [ ] **M4: Live Gemma 4 Integration** — Server-side API key configuration, model verification with `scripts/check_model.py`, live explanations.
- [ ] **M5: Robustness & Manual Matrix** — Negative paths, error recovery, device and viewport checks.
- [ ] **M6: Docker & DigitalOcean Deployment** — Container build and live HTTPS deployment.
- [ ] **M7: Final Submission** — Public GitHub repository, presentation slides, <=5 min demo video.
