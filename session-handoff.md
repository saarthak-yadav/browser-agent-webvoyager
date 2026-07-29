# Session Handoff

## Current Objective

- **Goal:** An autonomous web agent evaluated honestly on ~100 WebVoyager tasks,
  with every resume claim backed by a measurement.
- **Current status:** feat-001, feat-002 and feat-003 all **done**. All three
  pre-agent gates are answered: vision works on `glm-4.6v`, 2 of 15 sites block
  automated access, and 4 of 20 sampled tasks cannot be attempted as written.
- **Branch / commit:** `main`, at `feat-003: task decay audit`.

## Completed This Session

- [x] feat-002 — site reachability across all 15 sites, headless and headed
- [x] feat-003 — task decay audit, 20 tasks sampled with a fixed seed
- [x] Project now has a real Bun project: `package.json`, Playwright installed

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| feat-002 headless | `bun run scripts/check-reachability.ts --mode=headless` | `ok=13 blocked=2 degraded=0 error=0` | Blocked: Cambridge Dictionary (403), Allrecipes (402) |
| feat-002 headed | `bun run scripts/check-reachability.ts --mode=headed` | `ok=14 blocked=1 degraded=0 error=0` | Only Cambridge stays blocked; Allrecipes loads fully |
| feat-003 sample | `bun run scripts/sample-decay-tasks.ts` | `643 tasks in 15 sites -> sample of 20` | Seed 20260730; identical md5 across two runs |
| feat-003 audit | 20 hand checks via `scripts/probe-page.ts` | **14 still-valid, 2 changed, 4 impossible** | Verdicts in `tasks/decay-audit.json` |
| Build/tests | — | N/A | No test suite yet; scripts run standalone under Bun |

## Files Changed

- `scripts/check-reachability.ts` — new. feat-002 audit: all 15 sites, both
  modes, generic block detection, no per-domain branches, 120s per-site deadline.
- `scripts/sample-decay-tasks.ts` — new. Fixed-seed reproducible sampler.
- `scripts/probe-page.ts` — new. Audit instrument: loads a URL or batch headed
  and dumps text + screenshot for manual judgement.
- `tasks/WebVoyager_data.jsonl` (643 tasks, fetched from the WebVoyager repo),
  `tasks/decay-sample.json`, `tasks/decay-audit.json`.
- `package.json`, `bun.lock`, `tsconfig.json` — Bun project with Playwright.
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
- [ ] **Locale drift.** Amazon rendered INR prices, Google Flights defaulted its
  origin to the local city — IP geolocation. WebVoyager's 2024 reference answers
  assume a US locale. Undecided; feat-004 must set a policy and write it down.
- [ ] **GLM judging a GLM agent.** Unchanged. feat-017 blind labeling is the fix.
- [ ] **Live sites make runs non-reproducible.** Record run dates, keep traces.

## Next Session Startup

1. Read `AGENTS.md`.
2. Read `feature_list.json` and `progress.md`.
3. Review this handoff.
4. Run `./init.sh`.
5. Start **feat-004** (task subset selection). Its two dependencies are closed.

## Recommended Next Step

feat-004 — select ~100 tasks stratified across the sites, and write the
selection rule down. Three things from this session must go into it:

1. **Probe a first action, not just a page load.** "13/15 reachable" is
   landing-page only; Google Search passes that and then blocks the query.
   Whatever number feat-004 uses must mean a completed action.
2. **Decide what to do with the two blocked sites.** Either drop Cambridge
   Dictionary and Google Search from the subset, or carry them as a
   known-blocked stratum and report them in the denominator. Do not quietly
   drop them — "2 of 15 sites blocked us" is a result worth reporting.
3. **Set the locale policy** before any task is selected.

`init.sh` still prints the planning-stage message even though `package.json`
now exists — worth fixing when the first real build step lands.
