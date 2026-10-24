# Submission package and presentation plan

The PDF requires all three: presentation (PPT), public source repository, and a demo video no longer than five minutes. This file is their preparation guide; an actual PPT/video/publication is not claimed to be completed.

## Eight-slide outline

1. **HiperPulse — Evidence before estimates.** Problem: consumer camera color traces can look periodic even when unreliable. Target: controlled experimental exploration, not healthcare decisions.
2. **One honest core loop.** Input -> pulse-like waveform -> quality gates -> nullable BPM -> explanation. Show actual UI with synthetic provenance label.
3. **Our contribution.** Transparent refusal, artifact comparison and reproducible receipt. Attribute established GREEN/rPPG work; do not claim new physiological science or universal novelty.
4. **Architecture.** Browser retains video; FastAPI/SciPy computes; Gemma 4 explains structured evidence; DigitalOcean serves application. Only claim deployed/provider-tested components once verified.
5. **How measurement works.** Two fixed cheek patches, timestamped green means, bandpass, spectrum, consistency and autocorrelation. Explain shared-artifact failure mode and heuristic thresholds.
6. **Actual results.** Clean synthetic target 72 -> observed result; artifact and flat -> withheld. Include automated test count and real device/reference observations only if actually collected. Synthetic agreement is software verification, not human accuracy.
7. **Limitations and responsible scope.** Manual alignment, lighting/motion, skin/camera variability, false acceptance, no clinical validity, no BP/SpO2. Explain source of Gemma commentary and fallback behavior.
8. **Try it / next work.** Public repo, live HTTPS demo, test evidence. Next: device-diverse evaluation, stronger ROI tracking and validated quality calibration, subject to consent and scope.

Use screenshots from actual runs. Keep the permanent disclaimer and synthetic source label visible. Never include API keys, demo password or private footage in slides. Add short reference links to final slide/notes.

## Demo script (target 4 min 35 sec)

| Time | On-screen action | Spoken point |
|---|---|---|
| 0:00–0:25 | Homepage + scope notice | “HiperPulse explores pulse-like signals under controlled conditions. It is not clinically validated.” |
| 0:25–1:00 | Click clean synthetic sample | “This generated signal has a known 72 BPM periodicity. This verifies software behavior, not a person's heart rate.” |
| 1:00–1:35 | Expand quality checks; download receipt | “The result comes with evidence and a versioned input hash. The score counts checks passed.” |
| 1:35–2:10 | Artifact comparison; then artifact sample | “A deliberately conflicting patch causes withholding. We report failure rather than inventing a plausible number.” |
| 2:10–2:40 | Flat sample | “No changing signal means no supported estimate.” |
| 2:40–3:20 | Actual Gemma explanation | “Gemma 4 explains calculated evidence. It never calculates or overrides the measurement.” Show actual provider/model badge; if unavailable disclose fallback. |
| 3:20–3:50 | Optional already-tested camera/video clip | Show only consented capture; explicitly state supported conditions and whether it was accepted. Skip if not verified. |
| 3:50–4:15 | Deployed HTTPS URL and repository | Show DigitalOcean deployment evidence only if completed. |
| 4:15–4:35 | Tests/limitations slide | “Shared flicker can still pass checks. Next work is broader evaluation, not medical claims.” |

Rehearse once with a timer, then record a continuous understandable demo. Keep a local sample fallback ready. Do not splice a synthetic result into camera footage as if measured from that footage.

## Release/submission checklist

- [ ] Team ownership/original contributions are clear; only HiperPulse selected.
- [ ] Tests run on final commit; failed/skipped/unrun checks disclosed.
- [ ] Actual Gemma call succeeded if entering that category; model attribution correct.
- [ ] Actual DigitalOcean HTTPS deployment verified if claiming that category.
- [x] Public repository includes code, lock, setup, test instructions and attribution: https://github.com/sg721642/hiperpulse
- [ ] Team chooses appropriate license for its original code and retains dependency licenses.
- [ ] No `.env`, API keys, passwords, private recordings or unrelated parent-project files.
- [ ] PPT includes problem, solution, architecture, sponsors, actual results and limitations.
- [ ] Demo duration <=5 minutes; screenshots and labels match real execution.
- [ ] Public repository/PPT/video links open in an incognito browser.
- [ ] Required app access/token shared appropriately with evaluators, not publicly embedded.
- [ ] Organizer event date/timezone and submission deadline confirmed.

## Honest positioning

Say: “An original evidence-oriented prototype combining established signal processing with transparent quality refusal and Gemma explanations.”

Do not say: “world's first,” “100% accurate,” “clinical-grade,” “detects disease,” “blood pressure without a cuff,” “oxygen from the camera,” or “tested across all skin tones.”
