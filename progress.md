# Session Progress Log

## Current State

**Last Updated:** 2026-07-30
**Active Feature:** none — feat-001, feat-002 and feat-003 are **done**
**Next Feature:** feat-004 (task subset selection) — both its dependencies
(feat-002, feat-003) are now closed

## Status

### What's Done

- [x] Scope defined and bounded (`docs/PLAN.md`)
- [x] Architecture designed: action space, two serialization arms, deterministic
      vision trigger, bounded retry/replan policy (`docs/ARCHITECTURE.md`)
- [x] 26 features with dependencies and done criteria (`feature_list.json`)
- [x] Six resume placeholders mapped to the measurements that fill them
      (`docs/RESUME-CLAIMS.md`)
- [x] Harness scaffolded
- [x] **feat-001 (vision gate) — done.** `glm-5v-turbo` is not on the current
      z.ai plan (error 1311); `glm-4.6v` passes the same check 4/4 on the same
      plan and key. The plan was amended to name `glm-4.6v` for vision and
      judging. Measurements and the amendment are in `docs/DECISIONS.md`; the
      gate is `scripts/check-vision.ts`, re-runnable as
      `bun run scripts/check-vision.ts glm-4.6v`.
- [x] **feat-002 (site reachability) — done.** All 15 WebVoyager sites loaded in
      stock Playwright Chromium, headless and headed, no evasion tooling.
      Headless 13/15 landing pages OK, headed 14/15. Cambridge Dictionary is
      behind a Cloudflare 403 in **both** modes. Allrecipes 402s headless but
      loads fully headed, so **the benchmark run should be headed**. Table in
      `docs/DECISIONS.md`; re-run with `bun run scripts/check-reachability.ts`.
- [x] **feat-003 (task decay) — done.** 20 of the 643 tasks sampled with a fixed
      seed (one per site) and checked by hand against the live sites:
      **14 still-valid, 2 changed, 4 impossible.** Of the 4 impossible, 2 are
      real decay (BBC discontinued its market data feeds in Nov 2024; Booking--20
      hard-codes Feb 2024 dates) and 2 are sites refusing automation (Cambridge
      Dictionary, Google Search). Per-task verdicts in `tasks/decay-audit.json`.

### What's In Progress

- Nothing. feat-001, feat-002 and feat-003 are closed; no feature picked up yet.

### What's Next

1. **feat-004 — task subset selection.** Both dependencies are now answered.
   Two constraints came out of feat-002/003 and must shape it:
   - **Landing-page reachability is not usability.** Google Search's homepage
     loads but the first query returns the unusual-traffic page. feat-004 needs
     a *first-action* probe per site, not a `goto`.
   - **Decide the locale policy and write it down.** Amazon rendered prices in
     INR and Google Flights defaulted its origin to the local city, both from IP
     geolocation. WebVoyager's 2024 reference answers assume a US locale.

Still no agent code until feat-004 fixes the subset.

## Blockers / Risks

- [x] **Vision model — settled.** `glm-5v-turbo` is advertised with image input
      in `~/.pi/agent/models-store.json` but the subscription refuses it (`1311`,
      "Your current subscription plan does not yet include access to
      GLM-5V-Turbo"); same key on `glm-4.7` returns 200, so it is entitlement,
      not configuration. **`glm-4.6v` works on the same plan and key** and passed
      the gate 4/4, so the plan now names `glm-4.6v` for vision and judging.
      The vision fallback and the judge are buildable, on a different model than
      originally planned. Nothing downstream is cancelled.
      - Note for anyone repeating this: `image_url.url` takes a **bare base64
        string**, not a `data:` URI, and a `1210` "image format/parse error" was
        our own malformed PNG, not a plan restriction.
- [x] **Sites blocking automated browsers — measured, and it is real.**
      **2 of 15 sites are confirmed blocked** without evasion tooling: Cambridge
      Dictionary (Cloudflare 403 on load, both modes) and Google Search (loads,
      then refuses the first query with `/sorry/index`). Together that is 86 of
      643 tasks. The block was *not* on the commerce and travel sites as
      expected — Amazon and Booking both loaded fine. Reported as a rate, no
      evasion built. Remaining risk: blocks that only appear deeper in an
      episode; feat-020's taxonomy needs a non-agent "site blocked mid-episode"
      category.
- [x] **Benchmark tasks are stale, and now quantified.** 4 of 20 sampled tasks
      cannot be attempted as written (2 decay, 2 blocks) and 2 more have drifted
      but stay answerable. Report as "4 of 20 sampled" — 20 tasks gives 4/20 a
      95% CI of roughly 6-44%, which does not support "20% of WebVoyager has
      decayed".
- [ ] **Time-relative tasks are not reproducible across runs.** "Most recent
      papers", "trending this month" were counted still-valid because they are
      answerable, but their ground truth moves between runs. A README
      limitation, not a decay finding.
- [ ] **GLM judging a GLM agent.** The credibility hole. Slightly narrower now
      that the judge (`glm-4.6v`) is a different model from the agent
      (`glm-4.7`/`glm-5.2`) — but same vendor, likely shared lineage, so do not
      claim independence. feat-017 (blind human labeling, agreement + kappa) is
      the fix and is not optional.
- [ ] **Live sites make runs non-reproducible.** Record run dates, keep traces,
      state the limitation in the README rather than implying reproducibility.

## Decisions Made

- **TypeScript + Playwright**, over Python.
  - Context: same language as project 1, and it builds on real production
    experience (Puppeteer, headless Chrome lifecycle, concurrent sessions at
    Adora) rather than starting cold.
  - Alternative considered: Python + Playwright, which has more WebVoyager
    reference code but a weaker link to shipped work.
- **~100 tasks stratified across all 15 sites**, not the full 643.
  - Context: every failure gets hand-labeled, and that does not scale to 643.
    The failure taxonomy is the differentiator, so the subset protects it.
  - The README states the subset and selection rule plainly.
- **Both serialization arms get built**; the resume names the measured winner.
- **Vision and judging run on `glm-4.6v`**, not `glm-5v-turbo`.
  - Context: `glm-5v-turbo` is refused by the subscription (`1311`). `glm-4.6v`
    is the model behind z.ai's Vision MCP Server for GLM Coding Plan users and
    is reachable directly over chat-completions; it passed the gate 4/4.
  - Alternatives rejected: paying to upgrade the plan (no benefit established
    over `glm-4.6v`), and cutting the vision fallback from scope (would have
    cost two headline results).
- **Sequencing:** project 1 clears its deploy gate first, then both run in
  parallel — this project's benchmark runs are long and unattended.

## Files Modified This Session

- `scripts/check-reachability.ts` — new, the feat-002 audit. All 15 sites,
  headless and headed, generic block detection (HTTP status + interstitial
  phrases), no per-domain branches, hard 120s per-site deadline.
- `scripts/sample-decay-tasks.ts` — new, the feat-003 sampler. Fixed-seed
  mulberry32, reproducible byte-for-byte.
- `scripts/probe-page.ts` — new, feat-003 audit instrument: loads a URL (or a
  batch) headed and dumps visible text plus a screenshot for manual judgement.
- `tasks/WebVoyager_data.jsonl` — the 643-task set, fetched from the WebVoyager
  repo. `tasks/decay-sample.json`, `tasks/decay-audit.json` — the sample and the
  per-task verdicts.
- `package.json`, `bun.lock`, `tsconfig.json` — project now has a real Bun
  project with Playwright installed.
- `scripts/check-vision.ts` — the feat-001 gate (first source file).
- Re-pointed at `glm-4.6v`: `feature_list.json`, `docs/ARCHITECTURE.md`,
  `docs/TASKS.md`, `docs/PLAN.md`, `README.md`, `AGENTS.md`.
- Results and amendment recorded: `docs/DECISIONS.md`, `progress.md`,
  `session-handoff.md`.

## Evidence of Completion

- [x] feat-001: `bun run scripts/check-vision.ts glm-4.6v` → `HTTP 200 in
      2825ms`, 4/4 quadrants correct, `PASS`. Raw output in `docs/DECISIONS.md`
      and in the feat-001 `evidence` field.
- [x] feat-002: `bun run scripts/check-reachability.ts --mode=headless` →
      `headless ok=13 blocked=2 degraded=0 error=0`; `--mode=headed` →
      `headed ok=14 blocked=1 degraded=0 error=0`. Table in `docs/DECISIONS.md`.
- [x] feat-003: `bun run scripts/sample-decay-tasks.ts` →
      `643 tasks in 15 sites -> sample of 20`, reproducible across runs;
      20 hand checks → 14 still-valid / 2 changed / 4 impossible.
- [ ] No test suite yet. `package.json` now exists (Bun + Playwright), but
      `init.sh` still prints the planning-stage message and should be updated
      when the first real build step lands.

## Notes for Next Session

The agent is the easy half of this project. The measurement discipline is what
makes it worth showing: blind human agreement on the judge, both denominators
reported, and every failure hand-labeled.

All three gates are answered. Vision works on `glm-4.6v`; 2 of 15 sites block
us; 4 of 20 sampled tasks cannot be attempted as written. feat-004 turns those
into the subset and the honest denominator.

The single most load-bearing thing learned this session: **a site that loads is
not a site that works.** Google Search passed the reachability probe and then
refused the first query. Any claim of the form "N/15 reachable" must say whether
it means page load or a completed action.

When feat-013 and feat-016 get built: `image_url.url` takes a bare base64
string, not a `data:` URI. A `1210` error means the image bytes are bad, not
that the plan blocks images — decode the PNG locally before believing it.
