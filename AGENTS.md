# AGENTS.md

Implementation runs through `pi` with GLM, across multiple sessions. Read this
first, every session.

## Startup Workflow

1. Run `./init.sh`.
2. Read `feature_list.json` — pick **one** feature whose dependencies are all
   `done`. Set it to `in-progress`.
3. Read `progress.md` and `session-handoff.md` for where the last session
   stopped.
4. Read `docs/TASKS.md` for that feature's detail and acceptance check.

**One feature at a time.** No parallel features, no starting the next because
the current one is "basically done."

## What this project is

An autonomous web agent evaluated on the WebVoyager benchmark. The agent is the
easy half — the measurement discipline is the point. It backs a resume bullet
that currently contains six bracketed placeholders, each of which is a
measurement this project owes.

Read `docs/RESUME-CLAIMS.md` before writing code.

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

**Do not build bot-detection evasion.** No stealth plugins, no fingerprint
spoofing, no CAPTCHA solving. If a site blocks automated access, record it as a
finding. "Three of fifteen sites blocked us, here is the rate" is a legitimate
and more interesting result than an arms race.

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
viewer, site-specific handling, evasion tooling, training or fine-tuning, the
full 643-task set. See `docs/PLAN.md`.

## Definition of done

A feature is done when **all** of these hold:

1. Its acceptance check in `docs/TASKS.md` passed and you saw the output.
2. Real output is pasted into the `evidence` field in `feature_list.json`.
3. Any measurement it produced is in `docs/DECISIONS.md`.
4. It is committed.

Code that looks correct is not done. If a check cannot pass, mark the feature
`blocked` and say why.

## End of session

Update `progress.md` and `session-handoff.md` before stopping. The next session
starts cold with only those files.

## Stack

TypeScript · Playwright · Bun · GLM via z.ai (`glm-4.7`/`glm-5.2` for the agent,
`glm-5v-turbo` for vision and judging).

Secrets in `.env` (gitignored). Never commit a key, never commit screenshots
containing personal data.

## Commits

Small, honest messages. History is public and interviewers will read it.
**Do not add Claude, pi, or any agent as a co-author or in a commit trailer.**
