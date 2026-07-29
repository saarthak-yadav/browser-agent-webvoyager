# Plan

## Goal

An autonomous web agent evaluated honestly on the WebVoyager benchmark, with
every claim in the resume bullet backed by a measurement.

This is an **evaluation project wearing an agent costume**. The agent is the
easy half; the measurement discipline is the differentiator. Plenty of people
have built a browser agent. Very few can tell you *why* theirs failed, broken
down by category, with judge-vs-human agreement on the scoring.

## Scope

**In scope:** the agent loop, a bounded action space, two page-serialization
strategies compared by ablation, a deterministic vision fallback, a ~100-task
stratified benchmark run, a hand-labeled failure taxonomy, an episode trace
viewer.

**Out of scope:** beating published state of the art, a UI beyond the trace
viewer, site-specific handling of any kind, bot-detection evasion, training or
fine-tuning anything, running the full 643-task set.

## Milestones

| | Milestone | Why it exists |
|---|---|---|
| **M0** | Gates | Three things can sink this. Test all three before building. |
| **M1** | Browser harness | Playwright, action space, serialization, traces. |
| **M2** | Agent loop | Observe → plan → act, with a bounded retry/replan policy. |
| **M3** | Vision fallback | Deterministic trigger, logged by reason. |
| **M4** | Benchmark run | ~100 tasks, judged, with human agreement on a sample. |
| **M5** | Failure taxonomy | Hand-label every failure. The differentiator. |
| **M6** | Ablation + writeup | a11y vs set-of-marks, vision on/off, trace viewer, README. |

Detail and acceptance checks: `docs/TASKS.md`.

## The three gates (M0)

Answer these in an afternoon, before writing the agent:

1. **Does `glm-5v-turbo` serve images on the z.ai coding plan?** The vision
   fallback bullet depends on it. Send one small image, get a description back.
2. **Can headless Playwright reach the benchmark sites?** Test ~5 of the 15.
   Expect resistance from the commerce and travel sites. If a site blocks,
   record it — do not build evasion.
3. **How much of the 2024 task set still works in 2026?** Sample ~20 tasks and
   check whether the site still supports what the task asks. This number
   determines whether the honest denominator is "attempted" or "reachable", and
   it is itself a reportable finding.

## Decisions taken up front

- **TypeScript + Playwright.** Same language as project 1, and it builds on real
  production experience (Puppeteer, headless Chrome lifecycle, concurrent
  sessions at Adora) rather than starting from nothing.
- **~100 tasks, stratified across all 15 sites.** Enough for a defensible pass
  rate; small enough that every failure can be hand-labeled, which is the point.
  The README states the subset and the selection method plainly.
- **Both serialization arms get built**, and the resume names the winner.
- **Judge agreement is measured, not assumed.**
- **Public repo, honest history, no backdating.**

## Risks

| Risk | Mitigation |
|---|---|
| Sites block automated browsers | G2 measures it early. Blocked sites are a reported finding, not a problem to engineer around. |
| Benchmark tasks are stale | G3 measures it. Report reachable vs attempted separately. |
| GLM self-judging undermines the result | Hand-label a sample, report agreement. Non-negotiable — see RESUME-CLAIMS.md. |
| Live sites make runs non-reproducible | Record run dates, keep full traces, state the limitation in the README. |
| Scope creep into "a product" | The out-of-scope list is binding. |
| Flaky runs eat all the time | Hard wall-clock cap per episode from day one, not added later. |

## Open questions

- Does `glm-5v-turbo` work on this plan? → G1
- Which sites are reachable? → G2
- What fraction of tasks are still valid? → G3
- Which serialization wins? → feat-018
- What is the dominant failure mode? → feat-017

## Relationship to project 1

`serverless-agent-runtime` demonstrates systems design; this one demonstrates
evaluation. Deliberately different signals. Run them in parallel once project 1
clears its deploy gate — this project's benchmark runs are long and unattended,
which pairs well with active coding on the other.
