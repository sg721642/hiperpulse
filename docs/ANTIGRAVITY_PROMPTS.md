# Antigravity prompts for deep, persistent context

Use high thinking/reasoning if available in your selected coding model. Settings are per tool/account; no Markdown file can force a hidden reasoning budget. Persistent context comes from files, accurate state and evidence. Do not ask an agent to reveal private chain-of-thought; request a concise implementation rationale, assumptions and test evidence.

## Fresh chat bootstrap — paste this first

```text
We are building HiperPulse — Experimental Camera Heart Rate for the supplied Hack Day brief. Work in this hiperpulse folder only.

Before editing, read AGENTS.md, MASTER_IMPLEMENTATION.md, docs/PROJECT_STATE.md, docs/DECISIONS.md, docs/VALIDATION.md and THIRD_PARTY_NOTICES.md. Inspect the existing app/, web/ and tests/. Do not start a competing rewrite.

Summarize the current scope, architecture, what is actually verified, and the next smallest unfinished milestone. The core is a camera/sample trace -> experimental pulse-like waveform + nullable BPM + transparent signal quality. Keep Gemma 4 for explanations through Gemini API and DigitalOcean for deployment. Never estimate BP/SpO2 or claim clinical accuracy. Fixed cheek patches are manual, not face detection. Synthetic samples must stay labelled. Quality score is checks passed, not accuracy.

Execute milestone M1: reproduce the existing package with Python 3.12, install requirements-lock.txt in this folder's .venv, run pytest and JS syntax validation, launch localhost and verify clean/artifact/flat flows. Fix concrete defects with focused tests. Do not publish or create billed cloud resources. Update PROJECT_STATE with exact commands/results and unresolved items before finishing.
```

## Resume in a different chat

```text
Continue HiperPulse from disk, not assumptions about another chat. Read AGENTS.md, MASTER_IMPLEMENTATION.md, docs/PROJECT_STATE.md, docs/DECISIONS.md and docs/VALIDATION.md. Inspect git status/diff before changes so you preserve existing work. State the most recent verified milestone and next task. Then perform the next task recorded in PROJECT_STATE, with tests appropriate to the changes. Do not rebuild completed modules or change sponsor technologies. End by updating the state and decision log.
```

## Capture verification (M2)

```text
Read the project context. Review web/app.js capture lifecycle and app/signal.py contracts. Verify camera denial, supported frame timestamps, no duplicated frames, fixed ROI alignment, 30-second completion, Stop/discard, background-tab cancellation, video decoding errors and source labels. Use only authorized camera access and do not record anyone without consent. If hardware is unavailable, record that limit rather than marking camera testing done. Keep samples usable. Fix failures and document device/browser evidence in VALIDATION.
```

## Numerical review

```text
Read the accepted algorithm spec and tests. Review units, sampling irregularity, finite data, filter edges, spectral leakage, harmonics, flat/noisy inputs, patch/half consistency and false acceptance from shared periodic illumination. Do not tune thresholds just to show a plausible BPM. Add meaningful regression tests for demonstrated errors. Preserve nullable BPM and make any threshold/method changes explicit in DECISIONS and algorithm version. Explain what tests can and cannot establish.
```

## Gemma integration (M4)

```text
Review app/main.py and scripts/check_model.py. Configure only the server-side .env via user-provided credentials; never display keys. Verify the configured Gemma 4 model is available to this account. Test a real successful explanation and a provider failure on synthetic inputs. Record provider/model, observed behavior and any unsupported output without secrets. The deterministic fallback is not Gemma evidence. Never let generated text overwrite measurement fields. No silent switch to Gemini or another provider.
```

## Deployment preparation (M6)

```text
Read the DigitalOcean procedure in MASTER_IMPLEMENTATION. Check requirements-lock.txt, Dockerfile, .dockerignore, port 8080, bind 0.0.0.0, health path and runtime secrets. Build/test locally if Docker is available. Prepare a public-source checklist and exact deployment settings. Before performing publication or billed cloud creation, establish the team's authorization and cost scope. After a real deployment, validate the HTTPS app and record URL, commit and checks. Do not claim an unperformed deployment.
```

## UX polish without scope expansion

```text
Preserve all algorithm/API behavior and project constraints. Review responsive UI, labels, keyboard focus, loading/disabled states, quality failures, chart axes, source provenance and clearing. Improve only concrete usability defects. No extra diagnoses, history dashboards, face models or frameworks. Test changed interactions and record evidence.
```

## Handoff — paste before leaving any chat

```text
Prepare a disk-based handoff now. Update docs/PROJECT_STATE.md with the exact current scope, changed files, commands run and actual results, open issues, secrets/configuration still needed (names only), and one next concrete task. Update docs/DECISIONS.md for decisions made. Mark tests not run as NOT RUN. Preserve uncommitted work; do not reset unrelated changes. Regenerate FULL_SOURCE.md with scripts/build_bundle.py if source changed. Give the next chat a short continuation prompt referencing these files.
```

## Release review

```text
Act as a release reviewer for this existing HiperPulse package. Trace each PDF requirement to implementation and evidence. Check public source completeness, licensing/attribution, secret handling, quality refusal, sample honesty, Gemma proof, DigitalOcean proof, PPT and <=5-minute demo requirements. Report blockers separately from improvements. Do not fabricate clinical validation or worldwide novelty. Update VALIDATION and SUBMISSION checklists with observed facts.
```

## If two tabs are necessary

The default is sequential work with shared state. If the team deliberately uses concurrent chats, assign one `app/signal.py + tests/test_pipeline.py`, one `web/*`, and one integration owner for `app/main.py`, docs and merges. Do not edit the same file concurrently. Prefer worktrees on named branches and review each merge. Every chat reads the same contract; the integration owner runs the complete tests after integration. More chat tabs do not automatically mean more reliable work.
