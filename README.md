# Browser AI Agent

An autonomous web agent that completes natural-language tasks on live websites,
evaluated on a stratified subset of the
[WebVoyager](https://arxiv.org/abs/2401.13919) benchmark.

> **Status: planning.** Nothing is built yet. All numbers are TBD until
> measured — see `docs/DECISIONS.md`.

## What this is really about

Building a browser agent is not hard any more. Knowing whether it works is.

This project is structured as an evaluation first and an agent second. The
interesting output is not the pass rate — it is the failure distribution, the
agreement between the automated judge and a human, and the honest separation of
"the agent got it wrong" from "the benchmark is three years old and the site
changed."

## Method

- **~100 tasks**, stratified across all 15 WebVoyager sites. The selection rule
  is written down and reproducible.
- **Bounded action space** — seven actions, no site-specific code anywhere. One
  Amazon-specific selector would invalidate the "unseen sites" claim.
- **Two page serializations compared**: accessibility tree vs set-of-marks, run
  as an ablation rather than chosen by assertion.
- **Vision fallback on a deterministic trigger** — too few interactive elements,
  an observation below a token floor, or a stuck detector. Every trigger is
  logged by reason, so the rate can be broken down.
- **Bounded retry and replan policy** with four explicit caps.
- **Every episode traced** — steps, screenshots, tokens, actions, verdicts. A
  pass rate without traces is unverifiable.

## On honesty in the numbers

Three things this project does that benchmark write-ups usually skip:

1. **The judge gets audited.** WebVoyager scores with an LLM judge, and a GLM
   judge grading a GLM agent is grading its own homework. A blind hand-labeled
   sample measures judge-vs-human agreement, reported alongside the pass rate.
2. **Two denominators.** Pass rate over *attempted* tasks and over *reachable*
   tasks, reported separately, because tasks broken by site changes are not
   agent failures.
3. **Every failure is hand-labeled** into a taxonomy defined before the labeling
   started, with self-consistency measured on a re-labeled sample.

Sites also block automated browsers. Where that happens it is recorded as a
finding — **no evasion tooling is used**, deliberately.

## Results

_TBD. Reported whether or not they flatter the agent._

| Metric | Value |
|---|---|
| Pass rate (attempted / reachable) | TBD |
| Judge vs human agreement (κ) | TBD |
| Vision fallback trigger rate | TBD |
| Dominant agent failure mode | TBD |
| Serialization ablation | TBD |

## Limitations

Live websites change, so runs are not reproducible in the strict sense. Every
result carries its run date, and full traces are kept so any claim can be
checked against what actually happened.

## Docs

- `docs/PLAN.md` — milestones, scope boundaries, risks
- `docs/ARCHITECTURE.md` — action space, serialization, trigger, policy
- `docs/TASKS.md` — task list with acceptance checks
- `docs/DECISIONS.md` — measurements log
- `AGENTS.md` — instructions for agents working in this repo

## Stack

TypeScript · Playwright · Bun · GLM via z.ai (`glm-5v-turbo` for vision and
judging)
