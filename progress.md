# Session Progress Log

## Current State

**Last Updated:** 2026-07-30
**Active Feature:** none — planning complete, implementation not started
**Next Feature:** feat-001 (vision model availability gate)

## Status

### What's Done

- [x] Scope defined and bounded (`docs/PLAN.md`)
- [x] Architecture designed: action space, two serialization arms, deterministic
      vision trigger, bounded retry/replan policy (`docs/ARCHITECTURE.md`)
- [x] 26 features with dependencies and done criteria (`feature_list.json`)
- [x] Six resume placeholders mapped to the measurements that fill them
      (`docs/RESUME-CLAIMS.md`)
- [x] Harness scaffolded

### What's In Progress

- Nothing. No code written yet.

### What's Next

1. feat-001 — does `glm-5v-turbo` serve images on this plan? Hard gate.
2. feat-002 — which benchmark sites are reachable without evasion tooling
3. feat-003 — how much of the 2024 task set still works in 2026

All three are afternoon-sized and should be done before any agent code exists.

## Blockers / Risks

- [ ] **Vision model unverified.** `glm-5v-turbo` is listed with image input in
      `~/.pi/agent/models-store.json`, but it has never been called. The vision
      fallback resume claim depends on it. feat-001 settles it.
- [ ] **Sites may block automated browsers.** Expected on the commerce and
      travel sites. Mitigation is to report the rate, *not* to build evasion.
- [ ] **Benchmark tasks may be stale.** The set is from 2024. feat-003
      measures the decay, which determines the honest denominator.
- [ ] **GLM judging a GLM agent.** The credibility hole. feat-017 (blind human
      labeling, agreement + kappa) is the fix and is not optional.
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
- **Sequencing:** project 1 clears its deploy gate first, then both run in
  parallel — this project's benchmark runs are long and unattended.

## Files Modified This Session

Planning only: `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/TASKS.md`,
`docs/RESUME-CLAIMS.md`, `docs/DECISIONS.md`, `AGENTS.md`, `feature_list.json`,
`init.sh`, `progress.md`, `session-handoff.md`, `README.md`, `.gitignore`.

## Evidence of Completion

- [ ] No verification to run yet — no code exists.

## Notes for Next Session

The agent is the easy half of this project. The measurement discipline is what
makes it worth showing: blind human agreement on the judge, both denominators
reported, and every failure hand-labeled.

Do not write agent code before feat-001 through feat-003 have answered whether
the vision model works, which sites are reachable, and how many tasks are still
valid.
