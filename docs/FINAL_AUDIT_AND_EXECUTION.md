# Final audit and binding execution contract

Audited: 25 October 2026. This section is the latest user-requested execution policy. It resolves any weaker wording in the embedded earlier guide. Read it first.

## A. Executive decision

**Ready to start implementation/verification in a fresh Antigravity project. NOT yet ready to claim a fully deployed, device-validated, sponsor-verified final submission.**

The supplied code is a functioning sample-based prototype with automated and browser evidence. This final document contains the whole plan, source, dependencies, handoff context, prompts and submission instructions. You can carry this ONE Markdown file into a new chat. It does not require that chat to remember the earlier conversation or have the original ZIP/PDF to understand the defined requirements.

The user wants HiperPulse, a technically feasible original hack-day project with a working camera/sample pulse-like signal and quality indication, Gemma 4, DigitalOcean, deep context for high-thinking Antigravity chats, and continuous GitHub commits/pushes. Treat these as the selected project target. All scope, exclusions, evidence requirements and operational instructions below apply.

## B. Audit verdict by requirement

| Requirement | Strict audit finding | Final action / gate |
|---|---|---|
| Correct brief/project | PASS: HiperPulse only; pages 5–6 mapped in core guide | Do not mix HiperMove/Pose or other challenge requirements |
| Camera recording **or** sample | PASS for sample branch; camera/video code present but hardware checks outstanding | Keep permitted sample fallback; test supported hardware before camera claims |
| Pulse-like waveform / estimate + quality | PASS: plots, nullable BPM, gate details | Preserve honest withholding and source label |
| Technologies in PDF | PASS in design: rPPG-Toolbox reference, Gemma 4, DigitalOcean | Supporting Python/browser libraries are allowed; no unauthorized sponsor substitution |
| Existing research/software reuse | PASS: established GREEN baseline and SciPy DSP | Do not claim a new rPPG algorithm or Toolbox benchmark results |
| Actual Gemma 4 use | PARTIAL: adapter implemented and mocked; official model IDs checked; no live credentials used | REQUIRED release gate: model listing + real successful explanation on clean and failed-quality synthetic inputs |
| DigitalOcean deployment | PARTIAL: Dockerfile/procedure present; no deployed instance evidence | REQUIRED release gate for this user's target: real HTTPS URL, healthy service and external smoke test |
| Originality | Original app integration and evidence workflow documented; global novelty not established | Keep attribution, team contribution history and honest differentiation; no “world first” guarantee |
| Safety/scope | PASS in intended outputs: experimental only; no BP, SpO2, diagnosis | Review real AI outputs; prompting alone cannot guarantee prose correctness |
| Full code | PASS: source and resolved dependencies embedded later | Recover exact files from source appendix if working from only this document |
| One self-contained MD | FIXED in this final artifact | Use this document as the portable canonical entry point |
| Cross-chat memory | PASS with disk context and bootstrap; not automatic omniscience | Read full relevant sections; persist state; do not rely on private chat memory |
| GitHub alongside development | FIXED: milestone policy and commands below | Commit/push after verified coherent changes, verify remote SHA, log failures |
| Error-free guarantee | Cannot be established by any finite audit | 34 current automated tests pass; explicit manual/provider/deploy gates remain |
| Public repo + PPT + <=5-min video | Planned, not completed | Produce and verify all three before submitting |

## C. What the final audit changed

1. **Gemma is mandatory for the selected final project.** Earlier “optional Gemma” means the calculation survives a provider outage. It does NOT mean the team may omit Gemma and claim this user's full target is delivered. Runtime resilience and release requirements are different.
2. **DigitalOcean is the chosen final hosting target.** Earlier “deployment-ready” is not “deployed.” The final acceptance gate requires actual deployment evidence. Billed resource creation requires the team's established account and cost authorization.
3. **Continuous GitHub history is now required.** The earlier one-time publish instructions are supplemented by the incremental workflow below. Routine scoped commits/pushes to an established project repository are part of the requested work; do not ask for permission repeatedly.
4. **Malformed Gemma response parsing was hardened.** Unexpected null/non-object response parts or null text now return the labelled deterministic fallback instead of leaking a server error. Four regression cases were added.
5. **Audit claims are evidence-bounded.** Thirty tests passed in the original baseline run; the current final-audit suite has **34 passing tests**. Final JS syntax check also passed. One upstream deprecation warning remains; it is recorded rather than hidden. Browser results in the validation record are from the previous frontend run, not a new live model or camera test.

No API credentials were used, no GitHub repository was created/pushed and no paid cloud service was provisioned during this document-preparation turn. This request adds a workflow to the plan; the target owner/repository is not specified here. Do not invent those details.

## D. Gemma 4 model selection: exact and verifiable

The application model is **Gemma 4**, while **Gemini API** is its transport/provider interface. The Antigravity coding model is a separate choice. Selecting a high-thinking coding model does not configure the app's model.

Official model documentation checked 25 October 2026 lists `gemma-4-26b-a4b-it` and `gemma-4-31b-it` for hosted access. Use `gemma-4-26b-a4b-it` as the configured starting model. Verify availability with `scripts/check_model.py` using the team's API account. Never silently change to a `gemini-*`, Gemma 3 or another provider. If unavailable, keep the measurement demo running, record the integration blocker and obtain supported Gemma 4 access. Sources: [Gemma API guide](https://gemma.ai/deployment/gemini-api/) and [model discovery](https://ai.google.dev/api/models).

Do not assume the short explanation needs high model thinking. The user's “high thinking” request is about the development chat. If adjusting the application's generation/thinking settings, first check the selected model's current documented support and test latency/output; record the decision. Do not add unsupported knobs by guessing.

Required integration evidence, without secrets:

- Configured model exists and supports `generateContent` for this account.
- Clean synthetic input produces a real Gemma-labelled response referring to the calculated result without medical interpretation.
- Artifact/flat input produces a real explanation of withholding; no invented BPM or diagnosis.
- Network failure, quota failure or malformed response yields explicitly deterministic fallback.
- Key is server-side, absent from Git/browser/receipts/logs. Only structured summary goes to Google.
- Record timestamp, commit, requested model ID, provider result and redacted output excerpt in the validation file. A returned app label alone is not independent proof; verify the actual successful provider request in controlled server-side testing without printing the key.

## E. Continuous GitHub commit and push policy

### Establish the destination once

1. Work in a dedicated HiperPulse folder, not the unrelated parent Few-shot Learning repository. If this document is the only input, create a new dedicated folder and restore the embedded files there.
2. Check `git rev-parse --show-toplevel` and `git remote -v`. If the command reveals an unrelated parent repository, stop Git mutations there and relocate the package into a dedicated directory.
3. Obtain the correct GitHub owner/repository URL from the user or an unambiguous existing project remote. If unknown, ask once for the target; continue local implementation while waiting. Do not select a random account or public destination.
4. Use the repository creation/push procedure in the core guide. The brief ultimately requires a public repo; do not change visibility of an unrelated/private repository. The team must intentionally choose the HiperPulse submission repository and visibility.
5. Configure existing Git credentials through normal authentication. Do not place access tokens in remote URLs or files. If identity is missing, ask for the intended author identity; do not invent it or modify machine-global identity.
6. For an existing repo, use a scoped branch such as `codex/hiperpulse-mvp` and a reviewed merge process. For an empty dedicated repository, initial `main` setup is acceptable. Respect protection rules. Do not force-push, reset teammates' work or bypass required checks.

### After EVERY verified coherent milestone

Do not commit every keystroke or silently batch the whole project into the final hour. A coherent unit can be scaffolding, signal validation, frontend capture, Gemma integration, deployment configuration or final docs. A 30–60 minute checkpoint is a useful reminder, not a reason to push failing code.

1. Inspect `git status --short` and `git diff`. Preserve unrelated work.
2. Run checks relevant to the change. For numerical/API changes run pytest; for frontend changes run syntax validation and the affected browser acceptance path. A documentation-only update needs link/content review, not a full rerun of unchanged numerical tests.
3. Update `docs/PROJECT_STATE.md` with scope, changed files, actual tests and next task. Record decisions as needed. Never add secrets or identifying biometric traces.
4. Regenerate the single-file plan/code snapshot after source changes. Do this before staging so generated code does not lag behind the actual implementation.
5. Stage explicitly named project files or bounded project directories. Avoid blindly staging the parent workspace. Review the staged diff and check whitespace errors.
6. Commit with a precise message describing the behavior, then push the current project branch.
7. Verify the remote branch points to the same commit. Record the result in the next handoff/progress note without creating an infinite “log the log” commit loop.
8. If tests fail, fix them before the verified checkpoint. If a temporary checkpoint is needed, label it WIP and keep it on a dedicated branch; do not describe it as verified or merge it into a release branch.

PowerShell example, from the dedicated repository root after changing backend/tests/state:

```powershell
git status --short
git diff -- app tests docs
.\.venv\Scripts\python.exe -m pytest
# STOP here if tests return a nonzero exit code; do not blindly run the next lines.
node --check web/app.js
# STOP on failure; run affected browser checks as required.
.\.venv\Scripts\python.exe scripts/build_bundle.py
git add app tests docs AGENTS.md FULL_SOURCE.md HIPERPULSE_FINAL_IMPLEMENTATION_PLAN.md
git diff --cached --check
git diff --cached --stat
git diff --cached
# Review for secrets and unintended changes before committing.
git commit -m "fix: handle malformed Gemma responses with labelled fallback"
$hiperBranch = git branch --show-current
git push -u origin $hiperBranch
# Only after push succeeds:
git rev-parse HEAD
git ls-remote origin "refs/heads/$hiperBranch"
```

Adapt the staged file list to the actual milestone. When nothing changed, skip the commit. Compare the local HEAD SHA to the first field of the remote result. Do not claim “pushed” from a local commit alone. If offline/authentication fails, retain the local commit, record `push_pending`, continue independent local work and retry when access returns. No repeated password/key printing. If remote advanced, fetch and review; integrate deliberately, rerun affected checks, then push normally. Do not force overwrite it.

### Suggested commit sequence

| Milestone | Example commit | Required proof before marking done |
|---|---|---|
| Project context/scaffold | `docs: define HiperPulse scope and execution contract` | Correct root, requirements and exclusions |
| Reproduced baseline | `feat: add GREEN pulse pipeline and quality gates` | Generated frequency/failure tests |
| Interface | `feat: add signal plots and quality evidence UI` | Clean/flat/artifact browser checks |
| Camera/video | `feat: add timestamped browser trace capture` | Supported-device/cancellation tests or explicit pending status |
| Evidence workflow | `feat: add artifact comparison and evidence export` | Original preserved; export/reimport behavior reviewed |
| Gemma | `feat: explain calculated evidence with Gemma 4` | Mock tests plus separately recorded live access evidence |
| Deployment | `build: package HiperPulse for DigitalOcean` | Container check; real cloud health tracked separately |
| Release docs | `docs: record validation and submission instructions` | All required deliverables/evidence assessed |

If starting from this supplied baseline, do not manufacture a false historical sequence. Commit the supplied code honestly as the baseline, then commit actual subsequent work incrementally. Credit AI assistance and research sources as appropriate.

## F. One-file Antigravity startup prompt

Attach this complete Markdown file to the new high-thinking chat and paste:

```text
Use the attached HIPERPULSE_FINAL_IMPLEMENTATION_PLAN.md as the complete project handoff. Read its final-audit/execution-contract section, full implementation guide, current validation/state, and relevant embedded source before making changes. Do not assume prior-chat memory.

We are starting HiperPulse in Antigravity. Follow the supplied Hack Day scope strictly: camera/sample pulse-like waveform + experimental nullable BPM + transparent signal quality; Gemma 4 must explain the calculated result; DigitalOcean is the final deployment target. No diagnosis, blood pressure, SpO2 or clinical-accuracy claims. Preserve synthetic labels, honest quality failure and source attribution.

If a matching project already exists, inspect its source and git status and continue it; never overwrite or rebuild it blindly. If only this document exists, materialize the embedded source/config files into a dedicated hiperpulse folder, create the context files from the embedded sections, and generate fixtures using export_samples.py. Do not use an unrelated parent repository.

First give a concise scope/architecture/evidence summary and list only genuinely missing external prerequisites. Then execute the next smallest unfinished milestone: reproduce the baseline, run tests, verify sample UI, and proceed through camera validation, real Gemma verification, DigitalOcean deployment and submission preparation as authorized. Do not call mocked/provider-pending/deployment-pending work complete.

Maintain GitHub throughout: once the correct project owner/repo and credentials are established, automatically commit each coherent verified milestone, push the project branch, verify the remote SHA, and record status. Do not repeatedly ask permission for these routine scoped commits/pushes. If destination is missing, ask once and continue independent local work. Never expose keys, raw captures, unrelated files or overwrite others' work.

Keep AGENTS.md, PROJECT_STATE, DECISIONS and VALIDATION current. Regenerate the final single-file plan after source changes. Before ending or changing chats, write a precise handoff with changed files, commands/results, last commit/push state, blockers and next task. Explain decisions and evidence concisely; do not invent certainty, test results or claims of universal uniqueness.
```

## G. Reading and recovery protocol

This is a long reference artifact, not a guarantee that an AI will automatically retain every line forever. At startup read the policy, architecture, state and validation first; retrieve the relevant code sections as needed. If the chat interface truncates the attachment, place the file in the workspace and have Antigravity read it in sections. The agent must say what it has not read rather than claim complete context.

For a fresh empty folder: create the directories and named files from the source appendix (preserve indentation, UTF-8 and filenames). Create `MASTER_IMPLEMENTATION.md`, `AGENTS.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, `docs/VALIDATION.md`, `docs/SUBMISSION.md`, `docs/ANTIGRAVITY_PROMPTS.md`, `docs/FINAL_AUDIT_AND_EXECUTION.md` and `THIRD_PARTY_NOTICES.md` from their corresponding embedded sections. The embedded sections identify their source filenames. Supporting README/start files may be recreated from the quickstart; synthetic fixture files are generated by `scripts/export_samples.py`, so no external dataset is required. Keep this final file at the project root. Do not install the Markdown as a giant always-on rule; keep AGENTS compact and use explicit section reads.

Persist facts on disk after each milestone: current target, code version, test evidence, supported-device observations, model verification, deployment URL if real, repository/branch, HEAD, pushed SHA, blockers and next task. Another tab's “high thinking” does not transfer unseen state. Use one writer per working tree; separate worktrees for deliberately parallel work.

## H. Final acceptance gates and remaining risks

Proceed through: **baseline tests -> sample UX -> camera/video review -> real Gemma -> container -> DigitalOcean HTTPS -> public repo -> PPT/video -> final link verification**. Keep the permitted sample path as demo fallback. Do not let a camera uncertainty block all unrelated implementation, but do not sell an untested camera feature as validated.

The audit found no basis to certify zero errors or physiological accuracy. Remaining checks include real capture, codecs, browser download/reimport, mobile layout, provider output fidelity, container portability, deployment and realistic load. The exposure gate currently uses the lower of the two patch mean-green values; clipping fraction is an additional check, but this does not independently guarantee both patches are well exposed. Re-review per-patch exposure/ROI robustness before claiming a broader camera-supported release. Do not tune gates solely on the included generated fixtures.

The app's consent checkboxes are UI gates, not authenticated server proof of consent. For the limited demo, operate with consenting users and protect access. Before broad public handling of real biometric traces, add server-side consent/provenance controls, stronger authentication/rate limits, a data-retention policy, dependency review and deployment-specific load tests. Those are future product-hardening requirements, not a reason to pretend the current supervised prototype is clinically ready.

The final quality bar is: no known unresolved blocker in the path being demonstrated, reproducible evidence, truthful limitations, and all required sponsor/submission proofs. Unknown bugs remain possible. This document never converts a requirement or planned test into evidence that it already happened.
