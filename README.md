# Browser AI Agent — live-web benchmark audit

> **Archived 2026-07-31. Superseded by
> [web-agent-eval](https://github.com/saarthak-yadav/web-agent-eval).**
> No agent pass rate was ever produced here, and none is claimed. What this repo
> did produce is a measured answer to an earlier question: **is a live-web
> benchmark a sound denominator for an agent score at all?** For a project whose
> whole argument was honest denominators, the answer was no. That answer is
> why the successor runs on deterministic replicas instead.

The plan was an autonomous web agent scored on live websites, structured as an
evaluation first and an agent second. Before the agent was built, three audits
were run on the benchmark itself. Their results stand on their own, and are kept
here with the code that produced them.

## Findings

**1. A two-year-old static task set has visibly decayed.** WebVoyager (643 tasks,
15 sites, 2024): a seeded sample of 20 tasks, one per site plus top-up, each checked
by hand against the live site, with categories fixed before any site was opened.

| still valid | changed | impossible as written |
|---|---|---|
| 14 | 2 | **4** |

Two were genuine site decay. BBC discontinued its market-data feeds, and a Booking
task hard-codes February 2024 dates. The other two were sites refusing automation.
Separately, Google Search blocks on the first real query (`/sorry/index`), which
takes out **43 of 643 tasks (6.7%)** before the agent does anything wrong.

**2. Bot walls decide a large share of the denominator.** After moving to
[Online-Mind2Web](https://github.com/OSU-NLP-Group/Online-Mind2Web) (300 tasks, a
set whose maintainers re-check validity), a first-action probe swept **every one
of its 145 sites**. Each site was tried up an escalation ladder (masked headless,
then stock headless, then headed), with generic selectors only and no
per-site code:

```
ok=93  blocked=18  degraded=4  no-action=30   (of 145 sites)
tasks on blocked sites: 47 of 300
```

That is **16% of the benchmark lost to access policy rather than agent skill**,
a number that moves with the network, the day and the browser build. On the
original 15 WebVoyager sites, 1 blocked in both modes and 1 blocked headless
only. Headless Chromium announces itself as `HeadlessChrome` in its user agent,
so even "headless or not" changes the denominator.

**3. Measurement code fails quietly, and in plausible ways.** One full 145-site sweep
finished cleanly and was **thrown away**. Adaptive page settling had accepted an
empty SPA shell as "stable", and it read a mid-settle redirect as "done". Amazon,
Booking, IMDb and Airbnb all reported zero content. Nothing crashed. The output
just looked like a finding. Both bugs are now covered by tests that reintroduce
them and must fail (`stepSettle` in `scripts/lib/first-action.ts`). Fixing them
cut the `degraded` count from 13 to 4. This was the third error-recovery defect in
one feature, which is the lesson the successor carries forward: a corrupted run
looks exactly like a successful one.

## What was built

- **Reproducible scored subset.** 100 tasks across 72 sites, stratified on the
  benchmark's own difficulty label (29/45/26 easy/medium/hard, matching the
  eligible pool), drawn with a seeded PRNG. The 47 blocked tasks are excluded *and
  published*, never dropped silently. Rule: `docs/SUBSET-RULE.md`. A test pins the
  committed artifact to that rule.
- **Vision gate.** Image input was verified before being relied on. The first
  planned model wasn't available on the plan, so the gate failed and moved to
  `glm-4.6v`.
- **Playwright driver and a seven-action space** (in progress at archival), with
  no site-specific code.
- **Evasion policy written down, and its one change dated.** Only the
  `HeadlessChrome` UA token is masked. There is no CAPTCHA solving, no proxying
  and no fingerprint spoofing.

`bun test` runs **136 tests**, and `bun run typecheck` is clean.

## Why it stopped

The same evidence that made the live web a poor denominator also made the planned
ablation invalid. Two arms of a comparison see different pages: different prices,
layouts and A/B buckets. That variance sits on top of the effect being measured.
[web-agent-eval](https://github.com/saarthak-yadav/web-agent-eval) runs the agent
on REAL's deterministic replica sites under fixed step, token and wall-clock caps.
It reports its score with the trade it makes stated: replicas are easier than the
live web, so its number is not a live-web number.

## Layout

```
docs/DECISIONS.md     every measurement and decision, dated, append-only
docs/PLAN.md          original milestones and scope
docs/ARCHITECTURE.md  action space, serialization, vision trigger, retry policy
docs/SUBSET-RULE.md   the pre-registered subset rule
docs/archive/         working notes from the build sessions
scripts/              reachability, decay, first-action and subset tools
tasks/                task sets and committed audit artifacts
tests/                136 tests, including mutation checks on the settle rule
```

## Stack

TypeScript · Bun · Playwright · GLM via z.ai (`glm-4.6v` for vision)

## Licence

Code: MIT. The task files in `tasks/` keep their upstream licences: Online-Mind2Web
is CC-BY-4.0, and WebVoyager is under the licence of its
[repository](https://github.com/MinorJerry/WebVoyager). They are included so the
audits can be reproduced.
