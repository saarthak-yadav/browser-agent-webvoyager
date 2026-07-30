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
- **Current status:** feat-001, feat-002 and feat-003 all **done**. The Stage 2
  checkpoint is **recorded** — benchmark changed, three scoring decisions taken,
  evasion policy amended, feat-004 and feat-016 respecified. The harness
  typechecks and has real tests. **feat-004 is not started on purpose** — the
  checkpoint that blocked it is now closed, so it is the next thing to start.
- **Branch / commit:** `main`, at `Stage 2 checkpoint: benchmark moves to
  Online-Mind2Web, evasion rule narrowed` — docs only, no code. Working tree
  clean. **Not pushed.**

## Completed This Session

- [x] **Stage 2 checkpoint recorded — documentation only, no code.** Benchmark
      changed to Online-Mind2Web; blocked-task, locale and denominator decisions
      taken; evasion policy amended; feat-004 and feat-016 respecified; the
      feat-002-does-not-transfer flag raised and deliberately **not** acted on.

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
- [ ] **NEW, unowned: reachability of the Online-Mind2Web site pool.** feat-002
  measured 15 sites; the new set has 136 and **none of its rates carry over**.
  feat-004's first decision is how to scope that audit — sample or full sweep —
  because a 136-site sweep at feat-002's per-site cost is a much bigger job.
- [ ] **NEW, unmeasured, do not assume: what headless masking actually buys.**
  Now that a UA override is permitted, the Allrecipes question feat-002 left open
  (UA string vs missing GUI surface) is answerable, and it may reopen the
  headed-vs-headless run decision — headless would make the benchmark run
  materially cheaper. **Nobody has measured it.**
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
5. Start **feat-004**. Its inputs are settled; nothing is waiting on a human.

## Recommended Next Step

feat-004 — select ~100 tasks stratified across **Online-Mind2Web**, and write the
selection rule down. Its dependencies are closed and its inputs are now decided.
Four things must go into it:

1. **Fetch the Online-Mind2Web task set** (300 tasks, 136 sites) as a new
   artifact. `tasks/WebVoyager_data.jsonl` stays in the repo as feat-002/003
   evidence; it is no longer the working set.
2. **Choose and justify a stratification axis.** "One per site" is arithmetically
   impossible over 136 sites with ~100 tasks. Say what the axis is, why, and what
   it gives up.
3. **Scope a new reachability audit, and probe a completed first action** — not a
   `goto`. Google Search passed a page-load probe and then blocked the query.
   feat-002's numbers do not transfer; sample-vs-full-sweep is your call to make
   and to write down.
4. **Apply the settled rules:** blocked tasks excluded but counted in public,
   `en-US` + fixed timezone with no proxying, both denominators each with its n.

Settled at the end of this session, so it does not come back as a question:
`.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` arrived in commit
bccce0d as an editor side effect of feat-002, unrelated to it — generic Bun
boilerplate (`Bun.serve`, React frontends, `bun:sqlite`, Redis, Postgres) for a
project that uses none of it. **Reviewed and deleted**, in its own commit.
`AGENTS.md` already states the stack, so nothing was lost.

`"DOM"` is in `tsconfig.json`'s `lib` on purpose, and the narrow-shim
alternative was built, measured and rejected — do not "tidy" it away without
reading the four measurements in `docs/DECISIONS.md`.
