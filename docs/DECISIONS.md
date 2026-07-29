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
- [ ] Site reachability table, headless vs headed (feat-002)
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
