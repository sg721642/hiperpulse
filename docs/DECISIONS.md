# Architectural decisions

Final-audit addendum (25 October 2026): use the final single-file plan as portable handoff; require live Gemma 4 and DigitalOcean release evidence; keep runtime fallback; commit/push each verified milestone after establishing the intended GitHub destination. Hardened malformed provider-response shapes with four regression tests. These changes preserve numerical algorithm version 1.0.

| ID | Decision | Reason and tradeoff |
|---|---|---|
| D01 | Sample-first MVP with optional browser capture | Brief explicitly permits sample signals; reliable hack-day path without pretending camera robustness |
| D02 | GREEN baseline using NumPy/SciPy | Small CPU-only implementation; established method; weak against lighting/motion is explicitly disclosed |
| D03 | Reference rPPG-Toolbox, do not vendor entire training stack | Suggested resource, not mandatory runtime; no GPU/model checkpoint/license copying burden |
| D04 | Two manually aligned cheek patches | Easy implementation and inspectable geometry; not face detection/tracking, alignment can fail |
| D05 | Browser keeps frames; backend receives traces | Avoid video uploads/storage; traces remain potentially sensitive and leave the device with consent |
| D06 | All gates required; score is checklist fraction | Transparent withholding; no invented “confidence”; uncalibrated thresholds documented |
| D07 | Gemma 4 explains recomputed evidence | Sponsor alignment; numerical source of truth cannot be overwritten by client/AI |
| D08 | Single FastAPI origin, vanilla JS, no database | Minimal deploy complexity; suitable for supervised prototype, not scale-ready service |
| D09 | App Platform Docker web service | Explicit reproducible port/bind and portable runtime; deployment still requires team action |
| D10 | Persist AGENTS/master/state files | Context survives chat changes; avoids relying on transient reasoning or obsolete workflows |
| D11 | Source hash is provenance aid, not signature | Enables repeat-input comparison; does not authenticate the capture or prevent tampering |
| D12 | Whole-frame resizing and fixed normalized ROIs | Bounded browser cost, consistent guide geometry; loses spatial detail, requires validation |
| D13 | Keep sample source labels client-declared | Honest UI provenance convention; not a verified chain of custody |
| D14 | Update scipy to 1.18.1 on macOS arm64 | scipy 1.15.2 prebuilt wheel fails on macOS arm64 due to binary linker constraint in _spropack. Upgraded to 1.18.1; all 34 tests pass with identical numerical behavior. |

Future changes must record date, triggering evidence, chosen alternative, rejected alternatives and tests. Do not broaden scope to POS/neural rPPG before all existing acceptance gates and sponsor integration are complete. POS can be a future comparison baseline, with paper attribution, reference parity tests and new validation; it is not implemented here.
