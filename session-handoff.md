# Session Handoff

## Current Objective

- **Goal:** An autonomous web agent evaluated honestly on ~100 WebVoyager tasks,
  with every resume claim backed by a measurement.
- **Current status:** feat-001 (vision gate) **done**. `glm-5v-turbo` is not on
  the plan; `glm-4.6v` is and passed the gate 4/4, and the plan was amended to
  name it for vision and judging.
- **Branch / commit:** `main`.

## Completed This Session

- [x] Scope agreed and bounded — an evaluation project, not a SOTA attempt
- [x] Architecture: action space, a11y-tree and set-of-marks arms, deterministic
      vision trigger, bounded retry/replan policy
- [x] 26 features with dependencies and done criteria
- [x] Six resume placeholders mapped to the measurements that fill them
- [x] Harness scaffolded per the harness-creator skill
- [x] feat-001 vision gate run, plan amended from `glm-5v-turbo` to `glm-4.6v`

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Harness structure | `node ~/.agents/skills/harness-creator/scripts/validate-harness.mjs --target .` | 100/100, all five subsystems | Structural score only — it checks artifacts and phrasings exist, not that the harness works. Real proof is whether pi sessions stay in scope. |
| feat-001 gate, spec'd model | `bun run scripts/check-vision.ts` | **FAIL** — HTTP 429, `1311` "Your current subscription plan does not yet include access to GLM-5V-Turbo" | Entitlement, not config: `glm-4.7` on the same key/base URL returns 200. |
| feat-001 gate, alternative | `bun run scripts/check-vision.ts glm-4.6v` | **PASS** — HTTP 200 in 2825ms, 4/4 quadrants, 281 total tokens | `glm-4.6v` is the model behind z.ai's Vision MCP Server for GLM Coding Plan users, reachable directly over chat-completions. |
| Build/tests | — | N/A | no package.json yet; the gate script runs standalone under Bun |

## Files Changed

- `scripts/check-vision.ts` — new. The feat-001 gate: builds a 240x240 PNG with
  no image dependencies (2x2 colour grid, fixed order, 1-in-360 to guess) and
  checks the model reports all four quadrants. Takes the model id as argv[2].
- `feature_list.json`, `progress.md`, `docs/DECISIONS.md`, this file — updated
  with the result.

## Decisions Made

- TypeScript + Playwright, for continuity with project 1 and with shipped
  Puppeteer work.
- ~100 tasks stratified across all 15 sites, so every failure can be
  hand-labeled.
- Both serialization arms built; the resume names the measured winner.
- No bot-detection evasion — blocked sites are a reported finding.

## Blockers / Risks

- ~~`glm-5v-turbo` image support unverified~~ — resolved. It is not on this plan
  (error 1311); `glm-4.6v` is and passed the gate. feat-013 and feat-016 are
  specified against `glm-4.6v` now.
- Sites may block automated access; report the rate rather than evading.
- 2024 task set may have decayed; feat-003 measures it.
- GLM judging a GLM agent — feat-017 blind human agreement is the fix.

## Next Session Startup

1. Read `AGENTS.md`.
2. Read `feature_list.json` and `progress.md`.
3. Review this handoff.
4. Run `./init.sh`.
5. Start feat-002 or feat-003 — feat-001 is closed.

## Recommended Next Step

feat-002 (site reachability) or feat-003 (task decay). Neither has dependencies
and both are afternoon-sized.

Do not build the vision step or the judge against `glm-5v-turbo`; it will 429.
Use `glm-4.6v`, and pass images as bare base64, not as a `data:` URI.
