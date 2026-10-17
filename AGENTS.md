# AGENTS.md

Implementation runs through `pi` with GLM, across multiple sessions. Read this
first, every session.

## Startup Workflow

1. Run `./init.sh`.
2. Read `feature_list.json` — pick **one** feature whose dependencies are all
   `done`. Set it to `in-progress`.
3. Read `docs/archive/progress.md` and `docs/archive/session-handoff.md` for where the last session
   stopped.
4. Read `docs/TASKS.md` for that feature's detail and acceptance check.

**One feature at a time.** No parallel features, no starting the next because
the current one is "basically done."

## What this project is

An autonomous web agent evaluated on the **Online-Mind2Web** benchmark — 300
tasks across 136 live websites
(https://github.com/OSU-NLP-Group/Online-Mind2Web, MIT-licensed code, CC-BY-4.0
data). The agent is the easy half — the measurement discipline is the point. It
backs a resume bullet that currently contains six bracketed placeholders, each
of which is a measurement this project owes.

**Changed 2026-07-30 — the benchmark was WebVoyager (643 tasks, 15 sites).** The
feat-003 decay audit is why: 4 of 20 sampled 2024 tasks are unattemptable today
and Google Search alone blocks 43 tasks. Online-Mind2Web is maintained against
exactly that failure mode. **The WebVoyager work is kept as a finding, not
deleted and not re-run** — feat-002's reachability table and feat-003's decay
counts stand as recorded measurements of the old set. Reason and consequences:
`docs/DECISIONS.md`, 2026-07-30 benchmark-change entry.


## Invariants

**Never invent a number.** Pass rates, token budgets, trigger rates, and
agreement scores come from runs that actually happened. If you have not measured
it, write `TBD`. A fabricated benchmark number becomes a false claim in a job
interview.

**Record every measurement in `docs/DECISIONS.md`** — what you ran, the raw
result, what you concluded. It is the only source for README and resume numbers.

**No site-specific code. Ever.** No per-domain selectors, no branching on
hostname, no special-casing a site that misbehaves. The resume claims the agent
works "across unseen sites"; one Amazon-specific selector makes that false.

**Evasion policy — THIS RULE CHANGED on 2026-07-30. Read the new line, not the
old one from memory.**

Previously this section read: *"Do not build bot-detection evasion. No stealth
plugins, no fingerprint spoofing, no CAPTCHA solving."* — an unqualified ban that
also caught the headless user-agent string. That ban is **narrowed**, not lifted:

- **Permitted:** headless masking, and only that — overriding the user agent so
  the `HeadlessChrome` token is not announced. Nothing else about the browser is
  altered.
- **Still banned, without exception:** CAPTCHA solving, residential or rotating
  proxies, and stealth-fingerprint suites (`puppeteer-extra-plugin-stealth` and
  equivalents — WebGL/canvas/audio spoofing, `navigator.webdriver` patching,
  plugin and font forgery).

If a site blocks automated access after that, record it as a finding. "Two of
fifteen sites blocked us, here is the rate" is a legitimate and more interesting
result than an arms race.

**The README must state what was masked.** It may not claim "no evasion tooling
is used" — that is now false. Say plainly: the user agent is overridden to drop
the `HeadlessChrome` token; nothing else is spoofed.

Reason, and what it reverses in `docs/DECISIONS.md`: the 2026-07-30 evasion-policy
amendment entry.

**Separate agent failures from benchmark failures.** A task that is impossible
because the site changed since 2024 is not the agent failing. Report both
denominators.

**The judge does not grade itself unchecked.** GLM judging a GLM agent is the
weakest point of this project. The human-agreement sample (feat-019) is not
optional and must be labeled blind, before seeing judge verdicts.

**Traces are the deliverable.** A pass rate without episode traces is
unverifiable. Never run the benchmark with trace capture disabled.

## Scope boundary

In scope: agent loop, bounded action space, two serialization arms, vision
fallback, ~100-task run, failure taxonomy, trace viewer.

Out of scope, do not build: beating published SOTA, any UI beyond the trace
viewer, site-specific handling, evasion tooling beyond the headless masking
permitted above, training or fine-tuning, the full 300-task Online-Mind2Web set.
See `docs/PLAN.md`.

## Definition of done

A feature is done when **all** of these hold:

1. Its acceptance check in `docs/TASKS.md` passed and you saw the output.
2. Real output is pasted into the `evidence` field in `feature_list.json`.
3. Any measurement it produced is in `docs/DECISIONS.md`.
4. It is committed.

Code that looks correct is not done. If a check cannot pass, mark the feature
`blocked` and say why.

## End of session

Update `docs/archive/progress.md` and `docs/archive/session-handoff.md` before stopping. The next session
starts cold with only those files.

## Stack

TypeScript · Playwright · Bun · GLM via z.ai (`glm-4.7`/`glm-5.2` for the agent,
`glm-4.6v` for vision and judging).

Secrets in `.env` (gitignored). Never commit a key, never commit screenshots
containing personal data.

## Commits

Small, honest messages. History is public and interviewers will read it.
**Do not add Claude, pi, or any agent as a co-author or in a commit trailer.**
