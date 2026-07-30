# Session Handoff

## Current Objective

- **Goal:** An autonomous web agent evaluated honestly on ~100 WebVoyager tasks,
  with every resume claim backed by a measurement.
- **Current status:** feat-001, feat-002 and feat-003 all **done**. All three
  pre-agent gates are answered: vision works on `glm-4.6v`, 2 of 15 sites block
  automated access, and 4 of 20 sampled tasks cannot be attempted as written.
  The harness now typechecks and has real tests. **feat-004 is not started on
  purpose** — it needs a human decision first (see Blockers).
- **Branch / commit:** `main`, at `Update progress and handoff after feat-002 and
  feat-003`, plus uncommitted harness-repair work.

## Completed This Session

- [x] feat-002 — site reachability across all 15 sites, headless and headed
- [x] feat-003 — task decay audit, 20 tasks sampled with a fixed seed
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

- **Run the benchmark headed, not headless.** Allrecipes returns 402 headless
  and 200 headed. This is a run-configuration choice, not evasion — stock
  browser, normal mode. It constrains feat-014's concurrency, which now needs a
  GUI session.
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
- ~~Sites may block~~ — **measured. 2 of 15 confirmed blocked**: Cambridge
  Dictionary (Cloudflare 403 on load) and Google Search (loads, then refuses the
  first query). That is 86 of 643 tasks. No evasion built, per AGENTS.md.
- ~~Task set may have decayed~~ — **measured. 4 of 20 impossible, 2 changed.**
  Report as "4 of 20 sampled"; the 95% CI on 4/20 is roughly 6–44%.
- [ ] **Blocks that only appear deeper in an episode.** Google Search proved the
  first-action block exists. Others may surface only mid-task. feat-020's
  taxonomy needs a non-agent "site blocked mid-episode" category.
- [ ] **feat-004 needs a human checkpoint before it can start.** Three inputs are
  undecided, and each is baked into every number computed over the subset:
  (a) is Google Search **dropped** or carried as a **known-blocked stratum**
  (43 of 643 tasks), (b) the **locale policy**, (c) the **denominator rule** for
  attempted vs reachable-and-valid. Do not guess these to make progress.
- [ ] **Locale drift.** Amazon rendered INR prices, Google Flights defaulted its
  origin to the local city — IP geolocation. WebVoyager's 2024 reference answers
  assume a US locale. Undecided; part of the checkpoint above.
- [ ] **Error-recovery paths are the untested ones.** The single real bug
  typecheck found was in `check-reachability.ts`'s browser-relaunch path, which
  no run had executed because neither mode hit a browser-level failure. feat-015
  is mostly recovery code. Test it directly.
- [ ] **GLM judging a GLM agent.** Unchanged. feat-017 blind labeling is the fix.
- [ ] **Live sites make runs non-reproducible.** Record run dates, keep traces.

## Next Session Startup

1. Read `AGENTS.md`.
2. Read `feature_list.json` and `progress.md`.
3. Review this handoff.
4. Run `./init.sh` — expect a clean typecheck and `29 pass`.
5. **Get the three feat-004 inputs decided by a human** (Google Search's
   treatment, the locale policy, the denominator rule). Only then start feat-004.

## Recommended Next Step

feat-004 — select ~100 tasks stratified across the sites, and write the
selection rule down. **Its dependencies are closed but its inputs are not:**
settle the three questions in Blockers first. Three things from this session must
go into it:

1. **Probe a first action, not just a page load.** "13/15 reachable" is
   landing-page only; Google Search passes that and then blocks the query.
   Whatever number feat-004 uses must mean a completed action.
2. **Decide what to do with the two blocked sites.** Either drop Cambridge
   Dictionary and Google Search from the subset, or carry them as a
   known-blocked stratum and report them in the denominator. Do not quietly
   drop them — "2 of 15 sites blocked us" is a result worth reporting.
3. **Set the locale policy** before any task is selected.

Settled at the end of this session, so it does not come back as a question:
`.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` arrived in commit
bccce0d as an editor side effect of feat-002, unrelated to it — generic Bun
boilerplate (`Bun.serve`, React frontends, `bun:sqlite`, Redis, Postgres) for a
project that uses none of it. **Reviewed and deleted**, in its own commit.
`AGENTS.md` already states the stack, so nothing was lost.

`"DOM"` is in `tsconfig.json`'s `lib` on purpose, and the narrow-shim
alternative was built, measured and rejected — do not "tidy" it away without
reading the four measurements in `docs/DECISIONS.md`.
