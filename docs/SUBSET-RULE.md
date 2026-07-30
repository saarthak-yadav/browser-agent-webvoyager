# The scored subset: selection rule

*feat-004. Written so a reader can re-derive the exact task list without reading
any code. The executable form is `scripts/lib/subset.ts` (the rule) and
`scripts/select-subset.ts` (the I/O shell); if the two ever disagree, this
document is the claim and the code is the bug.*

The benchmark is **Online-Mind2Web** — 300 tasks across **145 distinct hosts**
(MIT code, CC-BY-4.0 data). This project scores **100** of them. Not all 300,
because every failure gets hand-labeled and that is the differentiator, not the run.

*Note on the site count: the dataset card says "136 popular websites". The 300
`website` values in the file are 147 distinct URL strings normalising to 145
hosts. This document reports 145, the number measured from the file it uses.*

**The result, as drawn on 2026-07-30:**

| | |
|---|---|
| source | `tasks/Online_Mind2Web.json`, sha256 `7dedf381…` |
| excluded as blocked | **47 tasks across 18 sites** (listed in `tasks/subset.json`) |
| eligible pool | 253 tasks |
| subset | **100 tasks across 72 sites** |
| strata | easy 29, medium 45, hard 26 |
| seed | 20260730 — re-running reproduces the file byte for byte |

---

## The rule, in six steps

1. **Start from the canonical task file**, `tasks/Online_Mind2Web.json`, fetched
   from the HuggingFace dataset repo. Its **sha256 is recorded in
   `tasks/subset.json`**. This matters: the set is actively maintained upstream
   and tasks are revised in batches, so a subset is only reproducible against the
   exact revision it was drawn from.

2. **Drop every task whose site is `blocked`** in the feat-004 first-action audit
   (`tasks/site-audit.json`; method below). The dropped task ids and the sites
   they were dropped for are written into `tasks/subset.json` under
   `excludedAsBlocked` and are published everywhere the pass rate is published.
   Never a silent drop — an unpublished exclusion rule is indistinguishable from
   quietly removing the hard tasks.

   Only `blocked` excludes. `degraded`, `no-action` and `error` mean the probe was
   inconclusive, and excluding on an inconclusive probe would shrink the
   denominator on a guess. A task on such a site that fails mid-episode is
   feat-019's `site-blocked` label — a non-agent failure inside the attempted
   denominator, not a pre-run exclusion.

3. **Partition the remaining tasks by `level`** — `easy` / `medium` / `hard`, the
   difficulty label the benchmark ships with each task. **This is the single
   stratification axis.** Why it, and what it costs, is below.

4. **Allocate 100 slots across the levels in proportion to their eligible
   counts**, by the largest-remainder method: floor each exact share, then give
   the leftover slots to the largest remainders, ties broken by level order
   (`easy`, `medium`, `hard`). The remainders are compared as exact integers,
   `(count × 100) mod total`, never as floating-point fractions — with the real
   counts all three remainders are exactly ⅔, a three-way tie that floating point
   resolves by rounding artefact and that differs between engines.

5. **Draw within each level.** Sort that level's eligible tasks by `task_id`
   (byte order), then draw the allocated number without replacement using
   `mulberry32` seeded **20260730**, consuming the stream in the order `easy`,
   `medium`, `hard`. Sorting first is what makes the draw independent of the row
   order of the source file, which upstream may change without changing any task.

6. **Sort the result** by level then `task_id`, and write it to
   `tasks/subset.json`.

There is **no per-site cap and no second axis.** See "What this gives up".

Re-running `bun run scripts/select-subset.ts` against the same task file and the
same audit reproduces `tasks/subset.json` byte for byte.

---

## How a site is judged reachable

`bun run scripts/check-first-action.ts` — a **full sweep of every site in the
pool**, not a sample, because excluding blocked tasks *before* the run needs a
verdict for every site the draw could touch. Cost and the argument:
`docs/DECISIONS.md`, the 2026-07-30 feat-004 audit-scoping entry.

**The probe completes a first action. It is not a `goto`.** feat-002 probed page
loads over WebVoyager's 15 sites and scored Google Search reachable; feat-003 then
found that Google serves a clean landing page and answers the first real query
with `/sorry/index`. A site that loads is not a site that works. The smoke run
found a second independent instance: Allrecipes serves its landing page and
returns **HTTP 402 on its search**, in headed mode included.

**What the sweep found:** of 145 sites, **93 completed a first action** (70 via
search, 23 via link click), **18 were blocked**, 4 degraded, 30 offered no action
the probe could drive. **6 of the 18 blocked sites serve a working landing page
and refuse the first action** — a `goto`-only audit would have called 132 of 145
reachable and kept those tasks in the scored set.

Per site, in order, stopping at the first rung where an action completes:

| rung | browser | user agent |
|---|---|---|
| 1 | headless | `HeadlessChrome` token dropped, nothing else changed |
| 2 | headless | stock |
| 3 | headed | stock |

A site is **`blocked` only if every rung refused it** — the standard feat-002 used
to separate Cambridge Dictionary (403 in both modes, a real block) from Allrecipes
(402 headless, 200 headed, a mode artefact). When nothing passes, the verdict comes
from the last rung that actually *observed* something; a timeout is not evidence
and must not erase one.

The action itself is generic, with **no site-specific code anywhere**: find a
usable search field by a fixed ladder of standard selectors (including
`textarea`, because that is what Google uses), revealing a collapsed one via the
ARIA disclosure pattern if needed; type the single fixed query **`blue`** —
the same word at every site, since varying it per site would be site-specific
handling; press Enter; classify the page that comes back. Sites with no query
affordance fall back to a same-origin link click that must actually navigate, and
are recorded as the weaker probe they are. Sites where neither is possible are
`no-action` — reported as their own category so they cannot be quietly counted as
either reachable or blocked.

Of the 93 passing sites, **75 passed masked-headless, 3 only stock-headless, and
15 needed a headed browser** — the GUI surface matters far more often than the UA
string. Because the ladder stops on success, this run shows only that masking can
*cost* something, never that it helps; a site that passes masked is never tried at
stock.

Browser configuration is declared, not disguised: locale `en-US`, a fixed
`timezoneId`, **no proxying**. The originating IP region is not controlled and is
not claimed to be.

**Verdict stability was measured, not assumed.** 43 sites — all 18 blocked, all 4
degraded, plus `no-action` and `ok` samples — were re-probed at a third of the
concurrency. **The blocked set came back identical, 18 for 18.** Agreement overall
was 40/43; all three disagreements were `no-action → ok`, so the published
`no-action` count is an *upper bound* on "sites the probe could not exercise",
not a claim they lack a search box.

**These verdicts are a dated snapshot.** google.com resolved `blocked` in one run
and `ok` in another — its refusal is intermittent, and it carries 5 subset tasks.
Blocks that appear mid-episode are feat-019's `site-blocked` label, not a
retroactive exclusion.

---

## Why `level`, and not the alternatives

With 136-odd sites and ~100 tasks, **per-site strata are arithmetically
impossible** — most sites would get zero and no site would get enough for a
per-site rate to mean anything. So the axis had to be something else.

- **It is a published field, so the strata need no judgement from us.** Site
  domain/category would mean inventing a taxonomy over ~145 hosts and assigning
  each by hand: unreproducible by a reader, and a place bias could hide with no
  way to detect it.
- **Difficulty is the axis that actually confounds the headline number.** This
  subset exists to support a pass rate, and pass rates move hardest with task
  difficulty. Proportional strata on `level` make the subset's difficulty mix the
  benchmark's mix, which is what lets "~100 of 300" be defended as representative
  on the dimension that matters most.
- **It gives the failure taxonomy usable per-stratum n** — roughly 27 / 48 / 25,
  each big enough to carry a breakdown. Per-site it would be under one task each.
- **Over task length specifically:** `reference_length` is the underlying step
  count, but `level` is not a pure function of it (`medium` runs to 12 steps,
  `hard` starts at 11), so the label carries human judgement the raw number does
  not — and it keeps our strata comparable with the benchmark's own leaderboard.

## What this gives up

Stated plainly, because a stratification choice that claims no cost is hiding one.

1. **No per-site or per-domain pass rate.** Sites enter the subset only
   incidentally. This project **cannot** claim "the agent does worse on travel
   sites than on retail", and will not, anywhere.
2. **Site coverage is uneven and uncontrolled.** Measured: **73 of the 145 sites
   contribute nothing.** Of the 72 that do, 54 give one task, 13 give two, 2 give
   three, 1 gives four, and 2 give five. The realized counts are published as
   `siteCounts` in `tasks/subset.json` so a reader sees the concentration instead
   of taking it on trust.
3. **That concentration is a correlated risk, and it is not hypothetical.** The
   largest single-site share is **google.com at 5 of 100** — and google.com is the
   one site measured behaving inconsistently between probes. If it refuses during
   the scored run, 5% of the subset goes with it, as a non-agent failure.
4. **The labels are the benchmark's judgement, and they measure human effort.**
   `level` comes from the human reference trajectory. A two-step task on a
   bot-hostile site is `easy` by label and impossible in practice.
   Difficulty-for-a-human is a proxy for difficulty-for-this-agent, and the gap
   shows up in feat-020's failure distribution, not here.

**A per-site cap was considered and rejected.** It would bound (2) and (3)
cheaply, but it is a second axis wearing a different hat: it controls site
representation, which is exactly what choosing `level` declined to control. The
benchmark's site concentration is a property of the benchmark, and suppressing it
would make the subset unrepresentative on a dimension nobody decided to manage.
Reporting it is the honest alternative.

---

## How the results must be reported

Fixed before any number exists, per the 2026-07-30 scoring decisions:

- **Two denominators, always, each with its own explicit n** — pass rate over
  *attempted*, and over *reachable-and-valid*. Written as "37/94 attempted (39%)"
  and "37/81 reachable-and-valid (46%)", never as two bare percentages, and
  **neither may be quoted without the other**.
- **The blocked-task count and its site list travel with the pass rate**, every
  time it appears.
- **The locale and timezone are stated**, along with the fact that the originating
  region is not controlled.
- **What was masked is stated**: the user agent is overridden to drop the
  `HeadlessChrome` token, and nothing else is spoofed. The README may not claim
  "no evasion tooling is used".
