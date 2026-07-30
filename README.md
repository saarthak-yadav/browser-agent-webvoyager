# Browser AI Agent

An autonomous web agent that completes natural-language tasks on live websites,
evaluated on a stratified subset of the
[Online-Mind2Web](https://github.com/OSU-NLP-Group/Online-Mind2Web) benchmark —
300 tasks across 136 live websites (MIT-licensed code, CC-BY-4.0 data).

> Previously planned against [WebVoyager](https://arxiv.org/abs/2401.13919), and
> changed on 2026-07-30 because an audit run here found 4 of 20 sampled
> WebVoyager tasks unattemptable in 2026 and Google Search refusing the queries
> behind 43 of them. That audit is kept as a finding — see `docs/DECISIONS.md`.

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

- **~100 tasks**, stratified across Online-Mind2Web. The stratification axis and
  the selection rule are written down and reproducible.
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

1. **The judge gets audited.** These benchmarks score with an LLM judge, and a
   GLM judge grading a GLM agent is grading its own homework. A blind
   hand-labeled sample measures judge-vs-human agreement, reported alongside the
   pass rate — and read against the ~85.7% human agreement Online-Mind2Web
   publishes for its own WebJudge (that figure is o4-mini-backed, so it is a
   reference point, not this project's expected number).
2. **Two denominators, each with its n.** Pass rate over *attempted* tasks and
   over *reachable-and-valid* tasks, reported separately and never one alone,
   because tasks broken by site changes or bot walls are not agent failures.
3. **Every failure is hand-labeled** into a taxonomy defined before the labeling
   started, with self-consistency measured on a re-labeled sample.
4. **Blocked tasks are excluded from the scored set — and counted in public.**
   The number excluded and the sites they sit on are published wherever the pass
   rate is. An unpublished exclusion rule is indistinguishable from dropping the
   hard tasks.

## What is and is not spoofed

Sites block automated browsers, and where that happens it is recorded as a
finding rather than fought.

**What is masked:** the browser's user agent is overridden so it does not
announce the `HeadlessChrome` token. That is the whole of it.

**What is not:** no CAPTCHA solving, no residential or rotating proxies, no
stealth-fingerprint suite — no WebGL/canvas/audio spoofing, no
`navigator.webdriver` patching, no plugin or font forgery. Locale (`en-US`) and
timezone are set explicitly and reported; the originating network region is not
controlled, so some sites will still serve local currency and defaults.

*This policy changed on 2026-07-30. Earlier revisions of this README said "no
evasion tooling is used"; that is no longer accurate, and the line above says
what is actually sent instead. See `docs/DECISIONS.md`.*

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

TypeScript · Playwright · Bun · GLM via z.ai (`glm-4.6v` for vision and
judging)
