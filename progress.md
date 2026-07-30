# Session Progress Log

## Current State

**Last Updated:** 2026-07-30 (Stage 2 checkpoint recorded — no code written)
**Active Feature:** none — feat-001, feat-002 and feat-003 are **done**
**Next Feature:** feat-004 (task subset selection), **respecified against
Online-Mind2Web**. Its three blocking inputs are now decided.

## ⚠ Read this first: the benchmark changed on 2026-07-30

**WebVoyager (643 tasks, 15 sites) → Online-Mind2Web (300 tasks, 136 sites)**,
`github.com/OSU-NLP-Group/Online-Mind2Web`, MIT code / CC-BY-4.0 data.

Why: feat-003 found 4 of 20 sampled WebVoyager tasks unattemptable in 2026, and
Google Search blocks the queries behind 43 tasks. Online-Mind2Web is maintained
against exactly that decay.

**feat-002 and feat-003 are kept as findings — not deleted, not re-run.** They
are the evidence for the change. **Their numbers do not transfer to 136 sites**:
never quote "13/15 reachable", "2 of 15 blocked" or "86 of 643 tasks" as current.

**The evasion rule also changed.** Headless masking (a UA override dropping the
`HeadlessChrome` token) is now **permitted**. CAPTCHA solving, residential
proxies and stealth-fingerprint suites stay **banned**. The README must state
what was masked and may not claim "no evasion tooling".

Full reasoning: the seven 2026-07-30 checkpoint entries at the end of
`docs/DECISIONS.md`.

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
- [x] **Harness repaired (not a feature).** `typecheck` did not exist and
      `typescript` was a peerDependency only, so none of the four scripts had
      ever been typechecked; `bun test` matched zero files and exited 0.
      Now: `typescript` is a devDependency, `bun run typecheck` is clean after
      fixing **10 real errors** (one latent bug in the browser-relaunch path of
      `check-reachability.ts`), and 29 tests pin the feat-003 seeded sampler and
      the feat-002 verdict rules. `init.sh` now fails when it finds no test
      files. **No measurement changed** — verified by re-running all three, see
      the 2026-07-30 harness-repair entry in `docs/DECISIONS.md`.

- [x] **Stage 2 checkpoint recorded (2026-07-30, no code).** Benchmark changed to
      Online-Mind2Web; three scoring decisions taken; evasion policy amended;
      feat-004 and feat-016 respecified; one flag raised and deliberately not
      acted on. Seven entries appended to `docs/DECISIONS.md`, plus an amendment
      banner on the feat-002 evasion paragraph.

### What's In Progress

- Nothing. feat-001, feat-002 and feat-003 are closed. feat-004 is **not
  started, deliberately** — see below.

### What's Next

1. **feat-004 — task subset selection, respecified.** Its three blocking inputs
   are now **decided** (see Decisions Made below): blocked tasks excluded but
   always counted in public; locale declared `en-US` + fixed timezone, no
   proxying; both denominators reported, each with its n.

   What it must now do, which is **not** what its old spec said:
   - **~100 tasks stratified across Online-Mind2Web**, not "across all 15 sites".
     136 sites and ~100 tasks makes per-site strata arithmetically impossible, so
     feat-004 must **pick a stratification axis, write down why, and say what it
     gives up**. Candidates: benchmark difficulty label, site domain/category,
     task length.
   - **Scope a fresh reachability audit.** feat-002's 15-site figures do not
     transfer to 136. Sample or full sweep is feat-004's first decision, and a
     136-site sweep at feat-002's per-site cost is a materially bigger job.
   - **Probe a completed first action per site, not a `goto`.** This is the one
     finding that does transfer: Google Search loaded and then refused its first
     query.

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
- [ ] **Sites blocking automated browsers — measured for WebVoyager, UNMEASURED
      for the set we now score on.** feat-002/003 confirmed **2 of 15 WebVoyager
      sites blocked** (Cambridge Dictionary, Cloudflare 403 on load both modes;
      Google Search, loads then refuses the first query with `/sorry/index`) —
      86 of 643 tasks. The block was *not* on the commerce and travel sites as
      expected; Amazon and Booking loaded fine. **Those figures describe 15 sites
      and do not transfer to Online-Mind2Web's 136.** Reachability of the new
      pool is an owed measurement with no owner; feat-004 must scope it. Two
      other reasons the old numbers cannot be reused: headless UA masking is now
      permitted, which can change classifications on the same sites, and
      landing-page load was never usability in the first place. Remaining risk
      unchanged: blocks that only appear deeper in an episode — feat-020's
      taxonomy needs a non-agent "site blocked mid-episode" category.
- [x] **Benchmark tasks are stale, and now quantified — and acted on.** 4 of 20
      sampled WebVoyager tasks cannot be attempted as written (2 decay, 2 blocks)
      and 2 more have drifted but stay answerable. Report as "4 of 20 sampled" —
      20 tasks gives 4/20 a 95% CI of roughly 6-44%, which does not support "20%
      of WebVoyager has decayed". **This is the finding that moved the project to
      Online-Mind2Web** (2026-07-30). Decay of the *new* set is not measured and
      must not be assumed to be zero.
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

### Stage 2 checkpoint, 2026-07-30

- **Benchmark: Online-Mind2Web**, replacing WebVoyager. 300 tasks, 136 sites,
  MIT code / CC-BY-4.0 data.
  - Context: feat-003 measured the old set as decaying — 4 of 20 unattemptable,
    43 tasks lost to a Google Search block. This project's whole argument is
    honest denominators; it should not defend one it has measured as rotten.
  - **feat-002 and feat-003 are retained as findings and not re-run.** Deleting
    them would remove the reason for the change.
  - Rejected: staying on WebVoyager and dropping dead tasks (every number needs a
    footnote); making the decay itself the headline (that is a benchmark-audit
    project, not this one); a bespoke task set (unciteable).
  - Cost, stated plainly: feat-002 and feat-003 lose their *forward* value —
    feat-004 needs equivalent work against 136 sites.
- **Blocked tasks are excluded from the scored set, and their count and site list
  are always published.** Both halves are the decision. Excluding is honest (a
  bot wall is not the agent failing); publishing is what stops it being a cheat,
  since an unpublished exclusion rule is indistinguishable from dropping the hard
  tasks. Blocks must be evidenced, and decided before the run, not after seeing
  results.
- **Locale is declared configuration: `en-US` with a fixed `timezoneId`, no
  proxying.** Set explicitly in the Playwright context and reported. It does
  **not** fully solve the confound — IP geolocation still places the client in
  its real country, so expect local currency anyway; that residual is a benchmark
  condition, not an agent failure. Rejected: proxying to a US IP, which buys
  reference-answer fidelity at the cost of misrepresenting the client.
- **Two denominators, always, each with its own n.** Pass rate over *attempted*
  and over *reachable-and-valid*, written as "37/94 attempted (39%)" style, never
  as two bare percentages, and never one without the other. The resume names the
  attempted rate if only one fits, because the conservative number survives being
  checked.
- **Evasion policy amended — THE RULE CHANGED.** Headless masking (UA override
  dropping the `HeadlessChrome` token) is **permitted**; **CAPTCHA solving,
  residential/rotating proxies and stealth-fingerprint suites stay banned**.
  - Context: the old unqualified ban conflated "look like a different client than
    you are" (an arms race, worth refusing) with a self-report the same engine
    volunteers about itself.
  - Reverses `AGENTS.md`'s old evasion invariant and contradicts what the feat-002
    entry recorded — that entry now carries an amendment banner.
  - **Consequences not yet measured:** whether Allrecipes' headless-only 402 was
    the UA string or the missing GUI surface is now answerable and was **not**
    answered; and this may reopen the headed-vs-headless run choice, which would
    make the benchmark run cheaper. Measure, do not assume.
  - **The README may no longer claim "no evasion tooling is used."** It now
    states what is masked. Corrected immediately rather than at feat-025.
- **feat-016 gains a comparison point, not a shortcut.** Online-Mind2Web's
  WebJudge publishes ~85.7% human agreement — but that is o4-mini-backed, on
  their sample; our judge is `glm-4.6v`. It is not our expected number, and
  **feat-017's blind labeling is unchanged and still mandatory.**

### Earlier

- **TypeScript + Playwright**, over Python.
  - Context: same language as project 1, and it builds on real production
    experience (Puppeteer, headless Chrome lifecycle, concurrent sessions at
    Adora) rather than starting cold.
  - Alternative considered: Python + Playwright, which has more WebVoyager
    reference code but a weaker link to shipped work.
- ~~**~100 tasks stratified across all 15 sites**, not the full 643.~~
  **Superseded 2026-07-30 → ~100 tasks stratified across Online-Mind2Web (300
  tasks, 136 sites); the stratification axis is feat-004's to choose and justify.**
  - Context, unchanged: every failure gets hand-labeled, and that does not scale
    to the full set. The failure taxonomy is the differentiator, so the subset
    protects it.
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
- **`"DOM"` added to `tsconfig.json`'s `lib`**, so `page.evaluate` callbacks
  typecheck.
  - Context: that code is serialised and run inside the browser page, where DOM
    globals are real. It adds declarations and relaxes no check — `strict` and
    `noUncheckedIndexedAccess` are untouched, and no `any` or suppression
    comment was added anywhere in the fixes.
  - Cost, noted in the tsconfig comment: `document` now also typechecks in
    Bun-side code where it would throw, so browser globals belong inside
    `evaluate` callbacks and nowhere else.
  - Rejected: swapping `document.querySelectorAll` for Playwright locators.
    Playwright's CSS engine pierces open shadow roots and `querySelectorAll`
    does not, so it would have changed feat-002's recorded `interactiveCount`.
  - Also rejected, after building and measuring it: a narrow hand-written
    `types/page-globals.d.ts` shim. It scopes nothing (globals leak either way),
    its `navigator` declaration collides with `bun-types`, `skipLibCheck: true`
    means it is the one file never checked, and with `skipLibCheck: false` it
    yields 134 errors against Playwright's own DOM-dependent types where DOM lib
    yields 0. Evidence in `docs/DECISIONS.md`.
- **Pure logic extracted to `scripts/lib/` so it can be tested** — the sampler
  (`decay-sample.ts`) and the reachability verdict rules (`classify.ts`). The
  scripts are now I/O shells around them. Behaviour-preserving, and verified as
  such rather than assumed.

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
  project with Playwright installed. Later the same day: `typescript` moved from
  peerDependency to devDependency, a `typecheck` script added, and `"DOM"` added
  to `lib` with the reason in a comment.
- `scripts/lib/decay-sample.ts`, `scripts/lib/classify.ts` — new. The sampler and
  the reachability verdict rules as pure, testable functions, lifted out of the
  two scripts with no behaviour change.
- `tests/decay-sample.test.ts`, `tests/classify.test.ts` — new. 29 tests, no
  network.
- `init.sh` — now counts test files and fails when there are none, instead of
  reporting a green run on an empty suite.
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
- [x] Harness: `bun run typecheck` clean over all four scripts; `bun test` →
      `29 pass, 0 fail` across `tests/decay-sample.test.ts` and
      `tests/classify.test.ts`. Both suites were mutation-checked (four
      mutations, each caught) so they cannot pass vacuously either.
      Re-verified unchanged after the fixes: `tasks/decay-sample.json` md5
      `60e3325ae8bce55f7ecd11f7ca88bb80`, three re-probed sites reproducing
      their recorded verdicts and counts exactly, and the feat-001 gate at 4/4.

## Files Modified At The Stage 2 Checkpoint (2026-07-30, docs only)

- `docs/DECISIONS.md` — seven new entries (benchmark change; three scoring
  decisions; evasion amendment; feat-004/feat-016 respec; the non-transfer flag),
  plus an amendment banner on the feat-002 "No evasion, per AGENTS.md" paragraph
  and two new owed measurements.
- `AGENTS.md` — benchmark, evasion policy rewritten with the change called out,
  scope boundary.
- `docs/PLAN.md` — goal, scope, gates, decisions-up-front.
- `docs/TASKS.md` — header banner, G4 respecified, T4.2 and T4.4.
- `docs/ARCHITECTURE.md` — judging note, evasion policy, stack line.
- `docs/RESUME-CLAIMS.md` — benchmark, the `[N] tasks` row, judge and denominator
  sections. **`sarthak_resume.tex` deliberately untouched** — it still says
  WebVoyager, and feat-026 owns that rewrite.
- `feature_list.json` — feat-004 and feat-016 respecified; feat-002 and feat-003
  marked retained-as-findings with their evidence intact; feat-018 and feat-025
  given the reporting obligations.
- `README.md` — benchmark, and the "no evasion tooling" claim replaced with a
  "What is and is not spoofed" section.
- `init.sh` — banner and the end-of-run reminder.
- `progress.md`, `session-handoff.md`.

**No code, no scripts, no measurements.** Nothing was re-run.

## Notes for Next Session

The agent is the easy half of this project. The measurement discipline is what
makes it worth showing: blind human agreement on the judge, both denominators
reported, and every failure hand-labeled.

All three gates are answered, **but two of the three answers are now about a
benchmark this project no longer scores on.** Vision works on `glm-4.6v` (still
true, model-level). 2 of 15 sites block us and 4 of 20 sampled tasks are dead —
both true of **WebVoyager**, both retained as findings, **neither transferable to
Online-Mind2Web's 136 sites**. feat-004 has to rebuild that picture against the
new pool before it can build the subset.

The single most load-bearing thing learned this session: **a site that loads is
not a site that works.** Google Search passed the reachability probe and then
refused the first query. Any claim of the form "N/15 reachable" must say whether
it means page load or a completed action.

When feat-013 and feat-016 get built: `image_url.url` takes a bare base64
string, not a `data:` URI. A `1210` error means the image bytes are bad, not
that the plan blocks images — decode the PNG locally before believing it.

The harness lesson, which applies to every feature after this one: the only bug
typecheck found was in the **browser-relaunch path** — error recovery that no
run had ever executed, because both feat-002 modes finished without a
browser-level failure. feat-015's runner is mostly recovery code (resume after
interruption, per-episode caps, a dead browser mid-run). Test those paths
directly; a benchmark run is exactly where they fire and exactly where nobody is
watching. Keep new logic pure and in `scripts/lib/` so it stays testable without
a browser.

`.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` was boilerplate that
arrived as a side effect of feat-002; it was reviewed and deleted in its own
commit. See the harness-repair entry in `docs/DECISIONS.md`.
