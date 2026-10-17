# Architecture

Target design. Update when the implementation disagrees — reality wins.

```
task ──> Agent loop ──> Observation builder ──> Playwright page
             │                  │                    │
             │                  ├── a11y tree serializer   (arm A)
             │                  ├── set-of-marks renderer  (arm B)
             │                  └── vision fallback (glm-4.6v, on trigger)
             │
             ├── Action executor (bounded action space)
             ├── Retry / replan policy (bounded)
             └── Episode trace ──> JSONL + screenshots
                                        │
                          ┌─────────────┴─────────────┐
                     Judge (LLM)              Trace viewer (static HTML)
                          │
                   Human-labeled sample ──> agreement rate
```

**No site-specific code anywhere.** No per-domain selectors, no special-casing
Amazon or Booking. The moment that appears, the "across unseen sites" claim is
false. If a site cannot be handled generically, it is a recorded failure, not a
patch.

## Action space

Fixed and small. The model chooses one per step.

| Action | Args | Notes |
|---|---|---|
| `click` | element id | id comes from the serialized observation |
| `type` | element id, text | clears first; optional submit |
| `scroll` | direction, or element id | |
| `navigate` | url | |
| `back` | — | |
| `wait` | — | bounded; for slow loads |
| `answer` | text | terminates the episode |

Anything the model emits outside this space is a parse failure and counts as a
failed step — logged, because the rate is itself a finding.

## Observation

Every step produces a text observation under a **token budget**. The budget is a
constant, and what happens when a page exceeds it is a policy that must be
written down and defended:

1. Viewport-visible interactive elements first
2. Then off-viewport interactive elements
3. Then static text, truncated
4. Record `truncated: true` and how much was dropped

Measure the observation-size distribution across the run — the budget should be
chosen from that distribution, not guessed.

### Arm A — accessibility tree

CDP `Accessibility.getFullAXTree`, filtered to nodes that are interactive or
carry meaningful text, each assigned a stable numeric id for the step.

### Arm B — set-of-marks

Inject JS to locate interactive elements, draw numbered boxes on a screenshot,
and pass the image plus an id/label list.

These are the two arms of the feat-018 ablation. The resume bullet names
whichever one wins.

## Vision fallback

The trigger must be **deterministic and logged**, not a vibe. Otherwise "[X]% of
pages" is unmeasurable.

Primary triggers, any of:

- serialized observation yields fewer than *N* interactive elements
- observation is below *M* tokens (page is mostly canvas/image/video)
- **stuck detector:** the same action was chosen twice with no resulting DOM
  change

Secondary: the model explicitly emits a `need_screenshot` request.

On trigger, send the screenshot to `glm-4.6v` alongside the text
observation. **Log which trigger fired**, so the headline percentage can be
broken down by reason. That breakdown is a better interview answer than the
percentage alone.

## Retry and replan policy

Bounded, with four constants that must all be known by heart:

| Constant | Meaning |
|---|---|
| `MAX_ACTION_RETRIES` | same action re-attempted after re-observing |
| `MAX_REPLANS` | plan discarded and rebuilt with failure context |
| `MAX_STEPS` | hard cap per episode |
| `MAX_WALLCLOCK_MS` | hard cap per episode |

**Retry** = the action was right, the page wasn't ready. **Replan** = the action
was wrong. Keep the two paths distinct in the code; the distinction is the
substance of the "bounded retry policy" claim.

## Episode traces

Every episode writes a JSONL trace plus screenshots: per step the observation
size, tokens in/out, chosen action, result, whether vision fired and why,
latency. The trace is the raw material for the failure taxonomy, the ablation,
and the viewer.

Traces are the actual deliverable. A pass rate without traces is unverifiable.

## Judging

A vision model reviews the final screenshot and the agent's answer against the
task. Run with `glm-4.6v`. Online-Mind2Web's own WebJudge publishes ~85.7%
agreement with human labels (o4-mini-backed) — a comparison point for the
agreement sample, not a number this project may claim.

Then hand-label a stratified sample of ≥30 episodes and report agreement. This is
not optional: a GLM judge grading a GLM agent is grading its own homework.

## Failure taxonomy

Categories are defined **before** labeling, and every failed episode gets
exactly one primary label. Starting set — refine once real failures exist:

**Agent failures**
- `grounding` — right plan, wrong element
- `planning` — wrong strategy for the task
- `extraction` — right page, wrong value read
- `premature-answer` — answered without evidence
- `loop` — repeated actions until the step cap

**Not agent failures** (report separately)
- `site-blocked` — bot detection, CAPTCHA, login wall
- `task-obsolete` — site changed, task no longer possible
- `infra` — timeout, crash, network

If a site blocks automated access, record it and move on. "The site blocked us,
here is how often" is a legitimate and more interesting result than an arms race.

**Evasion policy — changed 2026-07-30.** Headless masking is **permitted**: the
user agent is overridden so the `HeadlessChrome` token is not announced, and
nothing else is altered. **CAPTCHA solving, residential or rotating proxies, and
stealth-fingerprint suites remain banned.** This replaces the unqualified "do not
build detection evasion" rule that stood here before. See `AGENTS.md` and the
2026-07-30 evasion-policy amendment in `docs/DECISIONS.md`.

## Stack

TypeScript · Playwright · GLM via z.ai (`glm-4.7` or `glm-5.2` for the agent,
`glm-4.6v` for vision and judging) · Bun.

Chromium, headed or headless as measured rather than assumed, with a declared
`en-US` locale and fixed timezone, and no evasion tooling beyond the permitted
headless user-agent masking above.
