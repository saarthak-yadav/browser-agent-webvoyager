# Session Handoff

## ⚠ Two rules changed on 2026-07-30. Do not work from memory.

1. **The benchmark is Online-Mind2Web** (300 tasks, 136 sites,
   `github.com/OSU-NLP-Group/Online-Mind2Web`, MIT code / CC-BY-4.0 data), **not
   WebVoyager**. feat-002 and feat-003 are **retained as findings, not deleted and
   not re-run** — they are the evidence for the change — and **their numbers do
   not transfer to 136 sites.**
2. **Headless masking is permitted**: a user-agent override dropping the
   `HeadlessChrome` token, and nothing else. **CAPTCHA solving, residential or
   rotating proxies, and stealth-fingerprint suites remain banned.** This reverses
   the old unqualified evasion ban in `AGENTS.md` and supersedes the reasoning in
   the feat-002 DECISIONS entry, which now carries an amendment banner. **The
   README may not say "no evasion tooling"** — it states what was masked.

Both are recorded in the seven 2026-07-30 checkpoint entries at the end of
`docs/DECISIONS.md`.

## Current Objective

- **Goal:** An autonomous web agent evaluated honestly on ~100 Online-Mind2Web
  tasks, with every resume claim backed by a measurement.
- **Current status:** feat-001 through **feat-004 all done**. The scored set
  exists: `tasks/subset.json`, **100 tasks across 72 sites**, stratified on the
  benchmark's `level` label, seed 20260730, reproducible byte for byte.
  **47 tasks across 18 named sites are excluded as blocked**, and that count is
  published with every pass rate. Rule: `docs/SUBSET-RULE.md`.
- **Branch / commit:** `main`, at the feat-004 commit. Working tree clean.
  **Not pushed.**
- **Next:** feat-005 (Playwright driver and action space). Agent code can start —
  the subset is fixed.

## Completed This Session

- [x] **feat-004's two required decisions, taken and recorded.**
      - **Audit scope: FULL SWEEP of every site in the pool, not a sample.** The
        argument is not cost. The settled blocked-task rule excludes blocked tasks
        *before* the run, which needs a per-site verdict for every site the draw
        could touch; a sample gives a rate, which cannot tell the sampler which
        tasks to drop, and would push every undiscovered block to run time where
        the decision would then be made after seeing a failure. **Cost from
        measured times: ~20-30 min unattended.**
      - **Stratification axis: the benchmark's own `level` label. One axis.**
        Published field, no judgement from us; difficulty is what confounds a pass
        rate; ~27/48/25 gives feat-020 usable per-stratum n. **Gives up:** any
        per-site or per-domain rate, even coverage across sites, and it inherits
        the benchmark's site concentration. A per-site cap was **rejected** as a
        second axis in disguise.
- [x] **The first-action probe, built and validated against known answers.**
      Ladder `headless-masked -> headless-stock -> headed`, generic selectors only,
      one fixed query (`blue`) everywhere. Validated on four sites whose behaviour
      feat-002/003 already recorded. It **reproduces the Google Search finding on
      the live site** (200 landing page, then `/sorry/index` HTTP 429) and turned
      up **one new result: Allrecipes 402s its search in all three rungs, headed
      included**, on a site feat-002 scored headed-OK from a `goto`.
- [x] **Building it found four defects that would have corrupted the sweep** — an
      input-only selector ladder that could not reach Google's `textarea` search
      box; a status race that reported Allrecipes' 402 as a served 200; a later
      rung's timeout erasing two solid `blocked` observations; and a link-click
      that never navigated scoring a site `ok`. All four found by real sites, all
      four now pinned by tests.
- [x] **Written selection rule: `docs/SUBSET-RULE.md`** — six numbered steps, the
      reachability method, why `level`, what it gives up, and the reporting
      contract. Written so a reader reproduces the subset without reading code.

### Earlier sessions

- [x] feat-002 — site reachability across all 15 **WebVoyager** sites, headless
      and headed. Retained as a finding about a set no longer scored on.
- [x] feat-003 — task decay audit, 20 tasks sampled with a fixed seed. The
      measurement that caused the benchmark change.
- [x] Project now has a real Bun project: `package.json`, Playwright installed
- [x] **Harness repair (not a feature).** `typecheck` did not exist and
      `typescript` was never installed, so all four scripts were unchecked;
      `bun test` matched no files and exited 0. Now clean and tested — 10
      typecheck errors fixed, 29 tests added, `init.sh` fails on an empty suite.
      No measurement changed; all three were re-run to prove it.

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| feat-002 headless | `bun run scripts/check-reachability.ts --mode=headless` | `ok=13 blocked=2 degraded=0 error=0` | Blocked: Cambridge Dictionary (403), Allrecipes (402) |
| feat-002 headed | `bun run scripts/check-reachability.ts --mode=headed` | `ok=14 blocked=1 degraded=0 error=0` | Only Cambridge stays blocked; Allrecipes loads fully |
| feat-003 sample | `bun run scripts/sample-decay-tasks.ts` | `643 tasks in 15 sites -> sample of 20` | Seed 20260730; identical md5 across two runs |
| feat-003 audit | 20 hand checks via `scripts/probe-page.ts` | **14 still-valid, 2 changed, 4 impossible** | Verdicts in `tasks/decay-audit.json` |
| Typecheck | `bun run typecheck` | clean | Was `Script not found`; found and fixed 10 errors across all 4 scripts |
| Tests | `bun test` | `29 pass, 0 fail` | Was matching 0 files and exiting 0. Mutation-checked: 4 mutations, all caught |
| No measurement moved | sampler + 3-site re-probe + vision gate re-run | md5 `60e3325a…` unchanged; verdicts and counts identical; gate 4/4 | Details in the harness-repair entry in `docs/DECISIONS.md` |

## Files Changed

- `scripts/check-reachability.ts` — new. feat-002 audit: all 15 sites, both
  modes, generic block detection, no per-domain branches, 120s per-site deadline.
- `scripts/sample-decay-tasks.ts` — new. Fixed-seed reproducible sampler.
- `scripts/probe-page.ts` — new. Audit instrument: loads a URL or batch headed
  and dumps text + screenshot for manual judgement.
- `tasks/WebVoyager_data.jsonl` (643 tasks, fetched from the WebVoyager repo),
  `tasks/decay-sample.json`, `tasks/decay-audit.json`.
- `package.json`, `bun.lock`, `tsconfig.json` — Bun project with Playwright.
  Then: `typescript` as a devDependency, a `typecheck` script, `"DOM"` in `lib`.
- `scripts/lib/decay-sample.ts`, `scripts/lib/classify.ts` — new. The sampler and
  the reachability verdict rules as pure functions, so they are testable without
  a browser or the filesystem. Behaviour-preserving; verified, not assumed.
- `tests/decay-sample.test.ts`, `tests/classify.test.ts` — new, 29 tests, no
  network.
- `init.sh` — fails when no test file exists rather than reporting a green run.
- `docs/DECISIONS.md`, `feature_list.json`, `progress.md`, this file.

## Decisions Made

*The five Stage 2 checkpoint decisions — benchmark change, blocked-task handling,
locale, denominators, evasion — are written up in full in `progress.md` under
"Stage 2 checkpoint, 2026-07-30" and in `docs/DECISIONS.md`. Summarised at the top
of this file.*

- **Run the benchmark headed, not headless.** Allrecipes returns 402 headless
  and 200 headed. This is a run-configuration choice, not evasion — stock
  browser, normal mode. It constrains feat-014's concurrency, which now needs a
  GUI session. **Possibly reopened by the 2026-07-30 masking change** — if the UA
  token was the cause, headless may be viable again. Unmeasured.
- **Audited all 15 sites rather than the ~5 the task asked for.** Cheap, and
  feat-004 needs the full picture to stratify.
- **Decay categories were fixed before any site was opened**, the same
  discipline T5.1 requires for the failure taxonomy.
- **The two feat-002 classifier corrections are now pinned by tests**, not just
  written down: a low-text landing page is not blocked, and a 402 is. Both were
  originally caught by eye on a screenshot, which is not a mechanism that scales.
- **Tests are mutation-checked.** A test that cannot fail is the same vacuous
  pass in a different costume, which is the state this session started in.
- **Time-relative tasks counted as still-valid.** They are answerable; their
  ground truth moves. That is a reproducibility limitation for the README, not
  decay.

## Blockers / Risks

- ~~Vision model unverified~~ — resolved, `glm-4.6v`.
- ~~Sites may block~~ — **measured for WebVoyager: 2 of 15 confirmed blocked**
  (Cambridge Dictionary, Cloudflare 403 on load; Google Search, loads then refuses
  the first query) — 86 of 643 tasks. **These figures are about 15 sites and do
  not transfer to the 136 we now score on.** See the new blocker below.
- ~~Task set may have decayed~~ — **measured, and acted on. 4 of 20 impossible,
  2 changed.** Report as "4 of 20 sampled"; the 95% CI on 4/20 is roughly 6–44%.
  This is why the benchmark changed. Decay of the *new* set is unmeasured.
- [ ] **Blocks that only appear deeper in an episode.** Google Search proved the
  first-action block exists. Others may surface only mid-task. feat-020's
  taxonomy needs a non-agent "site blocked mid-episode" category.
- ~~feat-004 needs a human checkpoint before it can start~~ — **closed 2026-07-30.**
  All three inputs decided: blocked tasks are **excluded from the scored set with
  their count and site list always published**; locale is a **declared `en-US` +
  fixed timezone, no proxying**; pass rate is reported **over attempted and over
  reachable-and-valid, separately, each with its n**. The Google Search question
  dissolved with the benchmark change.
- [ ] **Locale drift is decided but not solved.** The `en-US` + fixed-timezone
  config does not control the originating IP region, so sites will still serve
  local currency and local defaults. That residual is a **benchmark condition,
  not an agent failure**, and feat-019's taxonomy must be able to say so. Stated
  in the README, not engineered around.
- [~] **Reachability of the Online-Mind2Web site pool** — **owned by feat-004,
  scoped, instrumented, validated, not yet run.** Full sweep, ~20-30 min. Blocked
  only on the canonical task file.
- [~] **What headless masking actually buys** — the sweep records the rung each
  site passed at, so "masked-headless was enough for N sites where stock was not"
  falls out of it. **Partial, not full attribution:** this design still cannot
  separate the UA string from the missing GUI surface for a site that only passes
  headed. That remains owed.
- [ ] **The published site count and the measured one differ.** The dataset card
  says 136 websites; the mirror's 300 tasks normalise to **145 distinct hosts**.
  Whatever the canonical file says, **report the number measured from it**, and do
  not repeat "136" as if this project had counted it.
- [ ] **Error-recovery paths are the untested ones.** The single real bug
  typecheck found was in `check-reachability.ts`'s browser-relaunch path, which
  no run had executed because neither mode hit a browser-level failure. feat-015
  is mostly recovery code. Test it directly.
- [ ] **GLM judging a GLM agent.** Unchanged. feat-017 blind labeling is the fix.
- [ ] **Live sites make runs non-reproducible.** Record run dates, keep traces.

## Next Session Startup

1. Read `AGENTS.md` — **the "What this project is" and evasion sections both
   changed on 2026-07-30.**
2. Read `feature_list.json` and `progress.md`.
3. Review this handoff, especially the two changed rules at the top.
4. Run `./init.sh` — expect a clean typecheck and `29 pass`.
5. Start **feat-005**. The subset is fixed and every feat-004 input is closed.

## Recommended Next Step

~~feat-004~~ — **done.** Next is **feat-005**, the Playwright driver and the seven
actions. What feat-004 delivered, for reference:

1. `tasks/Online_Mind2Web.json` — the canonical 300-task set, verified
   byte-identical to the current HF revision (sha256 `7dedf381…`). The pool is
   **145 distinct hosts**, not the 136 the dataset card advertises; report the
   measured number.
2. **Axis: the benchmark's `level` label**, one axis, no per-site cap. Reasoning
   and the four things it gives up: `docs/SUBSET-RULE.md`.
3. **Full sweep, not a sample** — 145 sites, completed-first-action probe.
   `ok=93 blocked=18 degraded=4 no-action=30`. **6 of the 18 blocked sites load
   fine and refuse the first action**, so a goto-only audit would have kept them.
4. Settled rules applied: blocked excluded but published, `en-US` + fixed
   timezone, both denominators owed at feat-018.

**Open, and deliberately so:** decay of the *new* task set is unmeasured — the
subset has been checked for reachability, never for whether each task is still
answerable as written. And "what masking buys" is narrowed but unanswered,
because the ladder stops on success and so never tries stock on a site that
passed masked.

Settled at the end of this session, so it does not come back as a question:
`.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` arrived in commit
bccce0d as an editor side effect of feat-002, unrelated to it — generic Bun
boilerplate (`Bun.serve`, React frontends, `bun:sqlite`, Redis, Postgres) for a
project that uses none of it. **Reviewed and deleted**, in its own commit.
`AGENTS.md` already states the stack, so nothing was lost.

`"DOM"` is in `tsconfig.json`'s `lib` on purpose, and the narrow-shim
alternative was built, measured and rejected — do not "tidy" it away without
reading the four measurements in `docs/DECISIONS.md`.
