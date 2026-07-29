# Task list

Execution order. Each task has an acceptance check. A task is not done until
its check passes and you have seen the output.

---

## M0 — Gates

### G1 — Vision model availability  ⚠️ GATE
Send one small image to `glm-4.6v` through the z.ai endpoint configured in
`~/.pi/agent/`.

**Check:** a correct description comes back.

**If it fails:** the vision fallback claim cannot be built on this plan. Set
`blocked`, record the error, and stop — this is a conversation, not something to
work around with a text-only substitute.

### G2 — Site reachability
Launch Playwright against ~5 WebVoyager sites spanning easy and hard
(e.g. Cambridge Dictionary, ArXiv, GitHub, Amazon, Booking). Standard Chromium,
standard user agent, no evasion tooling.

**Check:** a table in `docs/DECISIONS.md` — site, headless result, headed
result, what blocked it.

**Do not** add stealth plugins, fingerprint spoofing, or CAPTCHA solving. A
blocked site is a finding to report.

### G3 — Task set decay audit
Sample ~20 tasks from the WebVoyager set. For each, check by hand whether the
site still supports what the task asks.

**Check:** a count of still-valid / changed / impossible, in
`docs/DECISIONS.md`. This decides the honest denominator and is itself a
reportable result.

### G4 — Task subset selection
Select ~100 tasks stratified across all 15 sites, using G2 and G3. Write the
selection rule down.

**Check:** `tasks/subset.json` plus a written rule a reader could reproduce.

---

## M1 — Browser harness

### T1.1 — Playwright driver and action space
Implement the seven actions from ARCHITECTURE.md. Nothing site-specific.

**Check:** a scripted sequence completes a search on two different sites using
the same code path.

### T1.2 — Accessibility tree serializer (arm A)
CDP `Accessibility.getFullAXTree`, filtered, with stable per-step ids.

**Check:** on three sites, every visibly clickable primary control appears in
the serialization with a usable id.

### T1.3 — Token budget and truncation policy
Count tokens per observation; apply the documented priority order; record
`truncated` and how much was dropped.

**Check:** the observation-size distribution across ≥20 pages is written to
`docs/DECISIONS.md`. **The budget is chosen from this distribution, not guessed.**

### T1.4 — Episode traces
JSONL plus screenshots: per step the observation size, tokens, action, result,
latency, vision trigger.

**Check:** a replayed episode can be reconstructed from the trace alone.

---

## M2 — Agent loop

### T2.1 — Observe → plan → act
Wire the loop to GLM. Parse actions strictly; a malformed action is a logged
failed step, not a crash.

**Check:** the agent completes one easy task end to end (a dictionary lookup or
an ArXiv search).

### T2.2 — Bounded retry and replan policy
Implement all four constants. Keep the retry path and the replan path distinct.

**Check:** a forced failure (a bad element id) triggers exactly one retry, then
a replan, then terminates within the caps. Verified from the trace.

### T2.3 — Termination and answer extraction
`answer` ends the episode; caps end it otherwise, with the reason recorded.

**Check:** every episode terminates with an explicit recorded reason. No hangs.

---

## M3 — Vision fallback

### T3.1 — Deterministic trigger
Implement the triggers from ARCHITECTURE.md, each logged by name.

**Check:** a canvas-heavy page fires the trigger; a plain text page does not.

### T3.2 — Vision step via glm-4.6v
On trigger, send screenshot plus text observation.

**Check:** an episode that fails without vision succeeds with it, shown from
both traces.

### T3.3 — Set-of-marks renderer (arm B)
Numbered boxes on a screenshot plus an id/label list.

**Check:** rendered marks align with real interactive elements on three sites.

---

## M4 — Benchmark run

### T4.1 — Runner
Run the subset with concurrency, per-episode wall-clock caps, resume after
interruption, and full trace capture.

**Check:** a 10-task pilot completes, is resumable mid-run, and produces
traces for every episode.

### T4.2 — LLM judge
WebVoyager protocol using `glm-4.6v` on the final screenshot and answer.

**Check:** judge verdicts recorded for the pilot, with reasoning retained.

### T4.3 — Human agreement sample  ⭐
Hand-label ≥30 stratified episodes yourself, blind to the judge's verdict.
Report raw agreement and Cohen's kappa.

**Check:** agreement numbers in `docs/DECISIONS.md`. **This is the number that
makes the pass rate credible.** Do not skip it, and do not label after seeing
the judge's answer.

### T4.4 — Full subset run
All ~100 tasks. Record pass rate over attempted and over reachable, separately.

**Check:** results table with both denominators, and cost and latency per task.

---

## M5 — Failure taxonomy

### T5.1 — Define categories first
Write the category definitions **before** looking at failures, per
ARCHITECTURE.md. Agent failures and non-agent failures separated.

**Check:** definitions committed before labeling starts.

### T5.2 — Label every failure  ⭐
One primary label per failed episode, from the traces.

**Check:** every failure labeled; distribution table produced; the dominant
agent failure mode identified. This fills the last resume placeholder.

### T5.3 — Second-pass consistency
Re-label a 20% sample after a break and measure self-agreement.

**Check:** self-agreement recorded. If it is poor, the categories are badly
defined — fix them and relabel.

---

## M6 — Ablation and writeup

### T6.1 — Serialization ablation  ⭐
Arm A vs arm B on the same task subset. Pass rate, tokens per step, latency.

**Check:** results table. The resume names whichever wins, with the loser's
number available for the follow-up question.

### T6.2 — Vision on/off ablation
Same subset, fallback disabled.

**Check:** the delta, plus the trigger-rate breakdown by reason.

### T6.3 — Trace viewer
Static HTML: per episode, the steps, screenshots, actions, tokens, verdict.

**Check:** a stranger can open it and follow what the agent did and where it
went wrong. This is the artifact to show in an interview.

### T6.4 — README
Numbers, method, subset selection rule, judge agreement, failure distribution,
and an honest limitations section covering live-site non-reproducibility.

**Check:** every number traces to `docs/DECISIONS.md`.

### T6.5 — Rewrite the resume bullet
Replace all six bracketed placeholders in `sarthak_resume.tex` with measured
values. Delete the `[BRACKETED PLACEHOLDERS]` warning comment.

**Check:** no brackets remain, and every number traces to a measurement.
