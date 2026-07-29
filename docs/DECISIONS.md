# Decisions and measurements

Append-only log. Every number that reaches the README or the resume must appear
here first, with the command or procedure that produced it.

Format:

```
## <date> — <what was measured or decided>
**Ran:** <command / procedure>
**Got:** <raw result, error text, output>
**Concluded:** <the decision, and its caveats>
```

---

## Owed measurements

- [x] A GLM vision model serves images on this plan (feat-001) — **answered:
      `glm-5v-turbo` no (1311), `glm-4.6v` yes** (4/4 on the gate). The plan was
      amended to `glm-4.6v`. See the three 2026-07-30 entries below.
- [x] Site reachability table, headless vs headed (feat-002) — **answered:
      1/15 blocked in both modes (Cambridge Dictionary), 1/15 headless-only
      (Allrecipes), 13/15 reachable in both.** See the 2026-07-30 entry below.
- [ ] Task decay: still-valid / changed / impossible (feat-003)
- [ ] Subset selection rule and final task count (feat-004)
- [ ] Observation size distribution → token budget (feat-007)
- [ ] Retry/replan constants and their justification (feat-010)
- [ ] Vision trigger rate, broken down by trigger reason (feat-012)
- [ ] Judge vs human agreement + Cohen's kappa (feat-017)
- [ ] Pass rate over attempted, and over reachable (feat-018)
- [ ] Failure distribution and dominant agent failure mode (feat-020)
- [ ] Labeling self-consistency (feat-021)
- [ ] Serialization ablation: a11y tree vs set-of-marks (feat-022)
- [ ] Vision on/off delta (feat-023)
- [ ] Cost and latency per task (feat-018)

---

## 2026-07-30 — feat-001 GATE: `glm-5v-turbo` image input — FAILED (plan does not include the model)

**Ran:** `bun run scripts/check-vision.ts`

The script builds a 240x240 PNG in-process (no image dependencies): a 2x2 grid of
four solid colours in a fixed order — top-left green, top-right purple,
bottom-left orange, bottom-right blue — and POSTs it as a base64 `image_url` to
`https://api.z.ai/api/coding/paas/v4/chat/completions` with `model: glm-5v-turbo`,
asking for the quadrant colours as JSON. Exact-guess probability for an ordered
4-of-6 colour arrangement is 1/360, so a text-only model cannot pass by luck.

**Got:**

```
Test image: 240x240 PNG, 1298 bytes
Ground truth: {"topLeft":"green","topRight":"purple","bottomLeft":"orange","bottomRight":"blue"}
Model: glm-5v-turbo @ https://api.z.ai/api/coding/paas/v4

HTTP 429 in 587ms
FAIL: image request rejected.
{"error":{"code":"1311","message":"Your current subscription plan does not yet include access to GLM-5V-Turbo"}}
```

Control, to separate a bad key/endpoint from a model entitlement problem — same
key, same base URL, text model:

```
$ curl -s -X POST "https://api.z.ai/api/coding/paas/v4/chat/completions" \
    -H "Authorization: Bearer $ZAI_API_KEY" -H "Content-Type: application/json" \
    -d '{"model":"glm-4.7","stream":false,"max_tokens":32,
         "messages":[{"role":"user","content":"Reply with the single word: ok"}]}'
HTTP 200
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"ok",...}}],
 "model":"glm-4.7","usage":{"completion_tokens":23,"prompt_tokens":12,"total_tokens":35}}
```

**Concluded:** The API key and endpoint work. `glm-5v-turbo` is refused at the
subscription level (error `1311`), not rate-limited and not misconfigured — the
HTTP 429 is an entitlement rejection, not backpressure. `~/.pi/agent/models-store.json`
lists the model with `"input": ["text","image"]`, so the model store advertises
capability the plan does not actually grant; the store is not evidence of access.

`glm-5v-turbo` specifically is unusable on this plan. Per AGENTS.md that stopped
work rather than being routed around with a text-only substitute. **Superseded in
part** by the next entry: a different GLM vision model on the same plan does
work, so the vision *capability* is available even though this model is not.

---

## 2026-07-30 — feat-001 GATE, second attempt: `glm-4.6v` image input — PASSED

**Ran:** `bun run scripts/check-vision.ts glm-4.6v` (same test image and same
endpoint as the entry above; the script now takes the model id as argv[2]).

Route found from z.ai's Vision MCP Server docs
(https://docs.z.ai/devpack/mcp/vision-mcp-server), which describes itself as
"an exclusive Local MCP Server developed by Z.AI for GLM Coding Plan users" and
names **GLM-4.6V** as its backing model. The MCP server itself takes local file
paths, which is awkward inside a benchmark runner, so this checked whether the
same model is reachable directly over the chat-completions API. It is.

**Got:**

```
Test image: 240x240 PNG, 1286 bytes, encoding=raw
Ground truth: {"topLeft":"green","topRight":"purple","bottomLeft":"orange","bottomRight":"blue"}
Model: glm-4.6v @ https://api.z.ai/api/coding/paas/v4

HTTP 200 in 2825ms
Usage: {"completion_tokens":124,"completion_tokens_details":{"reasoning_tokens":97},"prompt_tokens":157,"prompt_tokens_details":{"cached_tokens":4},"total_tokens":281}

--- response ---
{"topLeft":"green","topRight":"purple","bottomLeft":"orange","bottomRight":"blue"}

OK   topLeft: expected green, got "green"
OK   topRight: expected purple, got "purple"
OK   bottomLeft: expected orange, got "orange"
OK   bottomRight: expected blue, got "blue"

4/4 quadrants correct
PASS: glm-4.6v accepts image input and described the image correctly.
```

Two implementation details worth keeping, both discovered the hard way:

1. **Image encoding.** `image_url.url` must be a **bare base64 string**, not an
   OpenAI-style `data:image/png;base64,...` URI. The published GLM-4.5V example
   only shows an http URL, but bare base64 works and is what this project needs.
2. **A bug in this repo's own test image, not in the API.** The first `glm-4.6v`
   attempt returned `HTTP 400 / {"code":"1210","message":"图片输入格式/解析错误"}`
   (image format/parse error). Cause was the hand-rolled PNG encoder in
   `scripts/check-vision.ts`: the chunk writer allocated `8 + body.length + 4`
   bytes instead of `4 + body.length + 4`, appending four zero bytes after every
   chunk. `file(1)` still reported "PNG image data, 240 x 240, 8-bit/color RGB"
   because it only parses IHDR; `sips -g pixelWidth` returned `<nil>`, which is
   what exposed it. **Do not read a 1210 as "the plan blocks images" — validate
   the image by decoding it first.** The `glm-5v-turbo` rejection is unaffected
   by this bug: 1311 is an entitlement refusal that happens before image parsing,
   and it reproduced identically with the corrected PNG.

**Concluded:** Vision is available on the current GLM Coding Plan via
**`glm-4.6v`**, not `glm-5v-turbo`. Latency 2.8s and 281 total tokens for a
trivial 240x240 image — a real page screenshot will cost materially more, and
the per-step token budget (feat-007) must be measured with the actual model in
place rather than extrapolated from this.

**Not yet decided, and deliberately not acted on:** whether to formally re-point
the plan at `glm-4.6v`. `feature_list.json` (feat-013, feat-016),
`docs/ARCHITECTURE.md` and `docs/TASKS.md` all name `glm-5v-turbo`, and the judge
in particular is specified against it. Swapping the model touches the judging
protocol and therefore the credibility argument in feat-017, so it is a plan
amendment, not an implementation detail. feat-001 stays `blocked` until that
amendment is made explicitly.

---

## 2026-07-30 — PLAN AMENDMENT: the vision and judge model is now `glm-4.6v`

**Ran:** no measurement — this records a decision taken on the evidence in the
two entries above.

**Got:** n/a.

**Concluded:** `glm-5v-turbo` is replaced by `glm-4.6v` everywhere the plan
specifies a vision model. Updated in the same pass: `feature_list.json`
(feat-001 description, feat-013 name, feat-016 description),
`docs/ARCHITECTURE.md`, `docs/TASKS.md`, `docs/PLAN.md`, `README.md`, `AGENTS.md`.
`docs/DECISIONS.md` keeps its original wording — it is an append-only record of
what was actually run, not a spec.

Consequences to carry forward:

- **feat-001 closes as `done`** against `glm-4.6v`, not `glm-5v-turbo`. The
  amendment is on the record so the gate is not silently re-scoped to whatever
  happened to work.
- **feat-016 / feat-017.** The judge is now a different model from the agent
  (`glm-4.6v` judging `glm-4.7`/`glm-5.2`), which is a mild improvement on the
  original "GLM grades GLM" problem — but it is still the same vendor and likely
  shared training lineage, so the blind human agreement sample stays mandatory
  and the README must not oversell the separation.
- **feat-007.** The 2.8s / 281-token figure is for a 240x240 synthetic image and
  says nothing useful about real screenshots. Measure the budget with real pages.
- Rejected alternatives: upgrading the plan for `glm-5v-turbo` (cost, no benefit
  established over `glm-4.6v`), and cutting the vision fallback from scope
  (would have removed two headline results).

---

## 2026-07-30 — feat-002: site reachability, headless vs headed, no evasion

**Ran:** `bun run scripts/check-reachability.ts --mode=headless` and
`--mode=headed`, stock Playwright Chromium 151.0.7922.34 on macOS arm64.

Scope note: `docs/TASKS.md` G2 asks for ~5 sites. This ran **all 15** WebVoyager
sites instead — the marginal cost was a few minutes and feat-004 needs the full
picture to stratify a subset. The five named in the spec (Cambridge, ArXiv,
GitHub, Amazon, Booking) are all in the table.

Method: one fresh browser context per site (no shared cookies, no warmed-up
reputation), `goto` the WebVoyager start URL, wait for DOMContentLoaded plus a
4s settle so client-side interstitials can render, then record HTTP status,
title, visible text length, a count of interactive elements, and a screenshot.
Classification is generic — HTTP status plus ~20 interstitial phrases that any
bot wall uses. There is no per-domain branch in the script.

**No evasion, per AGENTS.md.** No stealth plugin, no UA override, no fingerprint
patching, no CAPTCHA handling. The user agent is whatever the build sends, and
the two modes send *different* ones — this is part of the finding, not noise:

- headless: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36`
- headed:   `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36`

The headless shell announces itself as `HeadlessChrome`. Any headless-only block
below could be that string, the missing GUI surface, or both — this run does not
separate them, and deliberately did not try, since separating them means
spoofing the UA.

**Got:**

| Site | Headless | Headed | What blocked it |
|---|---|---|---|
| Cambridge Dictionary | **BLOCKED** HTTP 403 | **BLOCKED** HTTP 403 | Cloudflare interstitial, "Performing security verification … verifies you are not a bot". Screenshot confirms the challenge page, not a transient. |
| Allrecipes | **BLOCKED** HTTP 402 | OK HTTP 200 (5837 chars, 356 controls) | Headless only. 402 access-denied page: "If you are a reader experiencing an access issue, please contact support@people.inc". Fully functional headed. |
| ArXiv | OK 200 | OK 200 | — |
| GitHub | OK 200 | OK 200 | — |
| Hugging Face | OK 200 | OK 200 | — |
| Wolfram Alpha | OK 200 | OK 200 | — |
| Apple | OK 200 | OK 200 | — |
| BBC News | OK 200 | OK 200 | — |
| Coursera | OK 200 | OK 200 | — |
| ESPN | OK 200 | OK 200 | — |
| Google Search | OK 200 | OK 200 | — |
| Google Maps | OK 200 | OK 200 | — |
| Google Flights | OK 200 | OK 200 | — |
| Amazon | OK 202 | OK 202 | — (202 is Amazon's normal landing status here, content renders fully) |
| Booking.com | OK 202 | OK 202 | — |

Totals: **headless 13/15 reachable, 2 blocked. Headed 14/15 reachable, 1 blocked.**

Raw per-site JSON in `runs/feat-002/results.json`; screenshots in
`runs/feat-002/{headless,headed}/<site>.png`. Both are gitignored — regenerate
with the script.

**Concluded:**

1. **Cambridge Dictionary is unreachable to this agent in either mode.** It is
   one of the 15 WebVoyager sites, so its tasks cannot be attempted honestly.
   feat-004 must either drop it from the subset or carry it as a known-blocked
   stratum, and feat-018 must report pass rate over *reachable* separately from
   over *attempted* — this entry is the first concrete reason that second
   denominator exists.
2. **Allrecipes is a headless-only block**, so the benchmark run should be
   **headed**. That is a run-configuration choice, not evasion: it is the stock
   browser in its normal mode. Headed costs wall-clock and needs a GUI session,
   which constrains how feat-014's concurrency is scheduled.
3. **Landing-page reachability is a floor, not a guarantee.** Every OK above is
   "the front page loaded". A site can serve its homepage happily and challenge
   on search or pagination, which is where WebVoyager tasks actually go. Expect
   the blocked count to rise during the real run; feat-020's taxonomy needs a
   non-agent "site blocked mid-episode" category to absorb it.
4. **Amazon and Booking return HTTP 202, not 200**, with full content. Anything
   downstream that gates on `status === 200` would wrongly call two of the
   hardest sites unreachable.

**Two classifier corrections made during the run, recorded so the numbers above
are not mistaken for first-attempt output:**

- The first pass flagged Google Search as `degraded` on a "near-empty page" rule
  (`textChars < 200 || interactive < 5`). The screenshot showed a perfectly
  normal Google homepage — it is genuinely ~185 chars of text with ~50 controls.
  The rule became `textChars < 200 && interactive < 20`. **A low-text landing
  page is not a blocked one**, and the screenshot is what caught it.
- Allrecipes' 402 was initially classified `degraded` because 402 was not in the
  hard-status list. It is an access denial and now classifies as `blocked`.

**One harness bug worth carrying forward, since feat-014 will hit it:** the
first `--mode=both` attempt wedged on site 2 in headed mode for 12 minutes with
no output. Playwright's own timeouts did not cover it — a headed Chromium can
hang inside `newContext()`, before any navigation timeout applies. Fixed with a
hard 120s wall-clock deadline per site plus browser relaunch on failure. **The
benchmark runner needs the same backstop**; per-episode caps built only from
Playwright timeouts will not hold.

A separate transient: ESPN threw "Navigation … interrupted by another navigation
to about:blank" once in headed mode, then passed cleanly on an isolated re-probe
(HTTP 200, 5629 chars). Recorded as a flake, not a block — but it is evidence
that single-shot reachability results are noisy, and the table above should be
read as one observation per cell, not a stable measurement.
