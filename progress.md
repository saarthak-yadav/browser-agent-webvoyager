# Session Progress Log

## Current State

**Last Updated:** 2026-07-30
**Active Feature:** none — feat-001 is **done**
**Next Feature:** feat-002 (site reachability) or feat-003 (task decay)

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

### What's In Progress

- Nothing. feat-001 closed; no feature picked up yet.

### What's Next

1. feat-002 — which benchmark sites are reachable without evasion tooling
2. feat-003 — how much of the 2024 task set still works in 2026

Both are afternoon-sized and neither depends on anything. Still no agent code
until they are answered.

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
- [ ] **Sites may block automated browsers.** Expected on the commerce and
      travel sites. Mitigation is to report the rate, *not* to build evasion.
- [ ] **Benchmark tasks may be stale.** The set is from 2024. feat-003
      measures the decay, which determines the honest denominator.
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

- `scripts/check-vision.ts` — new, the feat-001 gate (first source file).
- Re-pointed at `glm-4.6v`: `feature_list.json`, `docs/ARCHITECTURE.md`,
  `docs/TASKS.md`, `docs/PLAN.md`, `README.md`, `AGENTS.md`.
- Results and amendment recorded: `docs/DECISIONS.md`, `progress.md`,
  `session-handoff.md`.

## Evidence of Completion

- [x] feat-001: `bun run scripts/check-vision.ts glm-4.6v` → `HTTP 200 in
      2825ms`, 4/4 quadrants correct, `PASS`. Raw output in `docs/DECISIONS.md`
      and in the feat-001 `evidence` field.
- [ ] No build or test suite yet — there is no `package.json`; the gate script
      runs standalone under Bun. `init.sh` still reports the planning-stage
      branch, which is correct.

## Notes for Next Session

The agent is the easy half of this project. The measurement discipline is what
makes it worth showing: blind human agreement on the judge, both denominators
reported, and every failure hand-labeled.

feat-001 is answered: vision works, on `glm-4.6v`. Do not write agent code
before feat-002 and feat-003 have answered which sites are reachable and how
many tasks are still valid.

When feat-013 and feat-016 get built: `image_url.url` takes a bare base64
string, not a `data:` URI. A `1210` error means the image bytes are bad, not
that the plan blocks images — decode the PNG locally before believing it.
