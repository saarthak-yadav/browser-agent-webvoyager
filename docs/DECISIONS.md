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
      (Allrecipes), 13/15 landing pages reachable in both.** See the 2026-07-30
      entry below. **Superseded in part by feat-003:** "13/15" is landing-page
      load only. Google Search blocks on the first real query, so the count of
      sites confirmed *usable* is at most 12/15. Do not quote 13/15 as
      reachability.
- [x] Task decay: still-valid / changed / impossible (feat-003) — **answered:
      14 still-valid, 2 changed, 4 impossible out of 20** (of the 4 impossible,
      2 are site decay and 2 are sites blocking automation). See the
      2026-07-30 entry below.
- [x] Subset selection rule and final task count (feat-004) — **answered: 100
      tasks, stratified on the benchmark's `level` label, drawn with seed 20260730
      from the 253 tasks left after excluding 18 blocked sites.** Rule in
      `docs/SUBSET-RULE.md`, artifact in `tasks/subset.json`, reproducible byte
      for byte. See the three 2026-07-30 feat-004 result entries.
- [x] Reachability of the Online-Mind2Web site pool (feat-004) — **answered:
      93 of 145 sites completed a real first action; 18 blocked, 4 degraded,
      30 no-action. 47 of 300 tasks sit on blocked sites.** Full sweep, not a
      sample. Blocked set reproduced identically under a 2-3x load difference.
      **6 of the 18 blocked sites load fine and refuse the first action** — a
      goto-only audit would have kept them.
- [ ] What headless UA masking actually buys — **narrowed, still open.** The
      feat-004 sweep shows the GUI surface matters far more than the UA string
      (15 sites needed headed, 3 passed only unmasked), but because the ladder
      stops on success it **cannot show masking helping at all** — a site that
      passes masked is never tried at stock. Answering it needs both arms over all
      sites. See the 2026-07-30 feat-004 reachability entry, conclusion 2.
- [ ] Decay of the Online-Mind2Web task set (**new, unowned**) — feat-003 measured
      WebVoyager's decay, not this set's. The 100-task subset has been checked for
      *reachability*, never for whether each task is still answerable as written.
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

> **⚠ AMENDED 2026-07-30 — the rule this paragraph applied has changed, and the
> reasoning above is now superseded.** The run and its results are untouched;
> only the policy is. Headless masking — a user-agent override that drops the
> `HeadlessChrome` token — **is now permitted**, so the choice recorded above
> ("deliberately did not try, since separating them means spoofing the UA") is
> no longer the standing rule. It stands as an accurate record of the decision
> taken *at the time*, under the ban `AGENTS.md` then carried.
>
> **Direct consequence:** the one thing this run declined to determine — whether
> Allrecipes' headless-only 402 was the UA string, the missing GUI surface, or
> both — is now determinable, and was not determined here. Nothing below should
> be read as evidence either way. CAPTCHA solving, residential proxies and
> stealth-fingerprint suites remain banned. See the 2026-07-30 evasion-policy
> amendment entry at the end of this file.

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

---

## 2026-07-30 — feat-003: task-set decay audit, 20 of 643 tasks

**Ran:** `bun run scripts/sample-decay-tasks.ts` to draw the sample, then checked
each task by hand against the live site with `bun run scripts/probe-page.ts`
(stock headed Chromium, the mode feat-002 settled on). Task set pulled from the
WebVoyager repo: `tasks/WebVoyager_data.jsonl`, 643 tasks over 15 sites.

**Sampling rule** (in `scripts/sample-decay-tasks.ts`, seed `20260730`,
mulberry32, no `Math.random`): sites alphabetical, tasks id-ordered, draw 1 task
per site so all 15 are represented, then top up to 20 from the remaining pool.
Re-running reproduces the sample byte-for-byte — verified by md5 across two runs.
Every-site coverage was chosen over proportional sampling because decay was
expected to be site-specific, and a proportional draw of 20 would leave sites
unrepresented.

**Categories, fixed before any site was opened** (same discipline T5.1 asks for
in the failure taxonomy — defining after looking invites fitting the categories
to the result):

- **still-valid** — the site supports what the task asks and an answer is
  obtainable today. Time-relative tasks ("most recent", "this month") count
  here: the answer moves, the task does not.
- **changed** — the capability exists but something the task names has been
  renamed, moved, or is no longer displayed directly. Attemptable; the 2024
  reference answer is stale or the wording misleads.
- **impossible** — cannot be completed as written today: content or feature
  gone, a hard-coded past date, or the site refuses automated access.

**Got: 14 still-valid, 2 changed, 4 impossible.** Per-task verdicts with
evidence in `tasks/decay-audit.json`. The four non-valid ones:

| Task | Verdict | What is actually wrong |
|---|---|---|
| BBC News--28 | impossible (decay) | `/news/business/market-data` now redirects to an article dated 26 Nov 2024: "The BBC has discontinued its market data feeds on both the website and red button (UK only) services." The task asks which company the Market Data section sources from; the section is gone, so the question has no answer. |
| Booking--20 | impossible (decay) | Hard-codes "February 28 to March 2, 2024" — over two years past, not selectable in the date picker. Also leap-year dependent: those dates are a *three*-night stay only in 2024. |
| Cambridge Dictionary--34 | impossible (blocked) | Cloudflare interstitial, HTTP 403, headless and headed (feat-002). Content is presumably fine; we cannot reach it without evasion tooling. |
| Google Search--7 | impossible (blocked) | See below — this one changes the plan. |
| Apple--39 | changed | `support.apple.com/en-us/102656` is now "If you forgot your **Apple Account** password" and says "Apple ID is now Apple Account". The task says "Apple ID password". Still answerable. |
| Coursera--26 | changed | The Renewable Energy Specialization is live and still contains "Renewable Energy Futures" (Course 4, instructor Stephen R. Lawrence), but the page now shows a fixed "4 weeks to complete at 10 hours a week" with no hours-per-week control. The task asks for weeks "if I spend 5 hours a week" — now an arithmetic derivation rather than something readable off the page. |

**The Google Search finding is the important one, and it is not decay.**
`google.com` loads fine — feat-002 marked it reachable. But *submitting a query*
from stock headed Chromium redirects to `/sorry/index`:

```
Our systems have detected unusual traffic from your computer network.
This page checks to see if it's really you sending the requests, and not a robot.
```

That is exactly the failure mode feat-002 warned about in caveat 3: landing-page
reachability is a floor, not a guarantee, and the block lands on the first real
action. Google Search is **43 of 643 tasks**. Consequences:

- Landing-page reachability overstates what is attemptable. feat-002's
  "13/15 reachable" is an upper bound; the real figure is at most 12/15.
- **feat-004 must not assume a site is usable because its homepage loaded.**
  The subset selection needs a per-site *first-action* probe, not just a `goto`.
- The blocked-site count for the resume is now **2 of 15 confirmed blocked**
  (Cambridge Dictionary, Google Search) with the rest unproven beyond page load.
  Do not write "13/15 reachable" anywhere; it will not survive the real run.

**Concluded:**

1. **The honest denominator is not 643.** In this sample, 4/20 (20%) cannot be
   attempted as written, splitting evenly between genuine site decay (2) and
   sites refusing automation (2). Those are different failures and must stay
   separated: decay is the benchmark aging, blocking is the environment. Neither
   is the agent failing, and feat-018 must report pass rate over *attempted* and
   over *reachable-and-valid* separately.
2. **A further 2/20 (10%) are answerable but drifted**, so a strict match against
   2024 reference answers would score them wrong for reasons that have nothing
   to do with the agent. This is a direct argument for the feat-017 human
   agreement sample: the judge has to be checked against tasks whose ground truth
   has quietly moved.
3. **20 tasks is a small sample and the counts carry real uncertainty.** 4/20 has
   a 95% binomial CI of roughly 6%–44%. Report it as "4 of 20 sampled", never as
   "20% of WebVoyager has decayed" — the second claim the sample cannot support.
4. **Time-relative tasks were counted valid on purpose** ("most recent papers",
   "trending this month"). They are answerable, but their ground truth changes
   between runs, so they are not reproducible across time. That is a limitation
   for the README, not a decay finding.
5. **Locale drift is a live confound.** Amazon rendered prices in INR and Google
   Flights defaulted its origin to the local city, both from IP geolocation.
   WebVoyager's 2024 reference answers assume a US locale. This is not decay and
   was not counted as such, but it will make some answers look wrong. Decide the
   locale policy in feat-004 and write it down.

Screenshots and page text for all 20 checks are in `runs/feat-003/` (gitignored;
regenerate with `scripts/probe-page.ts`). The Google block page includes the
originating public IP, which is why that directory stays out of git.

---

## 2026-07-30 — harness repair: typecheck and tests were both silently absent

Not a feature. `./init.sh` reported `FAILED: typecheck`, and `bun test` was
passing on zero test files. Both are recorded here because both changed what the
existing measurements are worth: an unchecked script and an untested rule are
not evidence, and two of the three measurements this repo already carries
(feat-002's reachability table, feat-003's sample) rest on logic no test touched.

**Ran:**

```
bun add -d typescript@^5          # was a peerDependency only, so never installed
# package.json: "scripts": { "typecheck": "tsc --noEmit" }
bun run typecheck
```

**Got: 10 errors across all four scripts — every script in the repo, none of them
ever typechecked.**

```
scripts/check-reachability.ts(164,47): error TS2584: Cannot find name 'document'.
scripts/check-reachability.ts(168,21): error TS2584: Cannot find name 'document'.
scripts/check-reachability.ts(253,20): error TS2339: Property 'close' does not exist on type 'never'.
scripts/check-vision.ts(55,28): error TS2532: Object is possibly 'undefined'.
scripts/check-vision.ts(115,32): error TS2345: Argument of type '(x: number, y: number) => [number, number, number] | undefined' is not assignable to parameter of type '(x: number, y: number) => [number, number, number]'.
scripts/check-vision.ts(132,21): error TS2532: Object is possibly 'undefined'.
scripts/check-vision.ts(144,10): error TS2532: Object is possibly 'undefined'.
scripts/probe-page.ts(53,43): error TS2584: Cannot find name 'document'.
scripts/sample-decay-tasks.ts(51,3): error TS2322: Type 'T | undefined' is not assignable to type 'T'.
```

They fall into three groups:

1. **Three `document` errors (TS2584) — a missing environment declaration, not a
   bug.** The code inside `page.evaluate(() => document...)` is serialised and
   executed in the browser page, where DOM globals are real, but `tsconfig.json`
   listed `lib: ["ESNext"]` only. Fixed by adding `"DOM"` to `lib`. **This adds
   type declarations and relaxes no check** — `strict`,
   `noUncheckedIndexedAccess` and the rest are untouched, and no `any` and no
   suppression comment was added anywhere. The cost, written into the tsconfig
   comment: `document` now also typechecks in Bun-side code, where it would
   throw at runtime, so browser globals belong inside `evaluate` callbacks and
   nowhere else. The alternative — replacing `document.querySelectorAll` with
   Playwright locators — was rejected because Playwright's CSS engine pierces
   open shadow roots and `querySelectorAll` does not, which would have changed
   feat-002's recorded `interactiveCount` figures.

   A narrow hand-written shim (`types/page-globals.d.ts` declaring only
   `document.body.innerText`, `querySelectorAll().length` and
   `navigator.userAgent`, with `lib` left at `["ESNext"]`) was built and measured
   before this was settled, since "declare only what the callbacks use" is the
   obvious way to avoid leaking globals. **It was rejected on four measured
   grounds, not on taste:**

   - **It scopes nothing.** TypeScript has no per-file `lib` and no per-file
     globals. A Bun-side file doing `document.body?.innerText` at top level —
     which throws `ReferenceError` at runtime — compiles clean under the shim
     *and* under DOM lib. The shim narrows which members leak, not whether they
     leak, so the entire argument for it fails.
   - **`declare const navigator` collides with the real one.** `@types/node` and
     `bun-types` both declare `navigator` (`TS2451: Cannot redeclare`), so the
     shim was replacing an accurate type with a two-line fake. `skipLibCheck`
     hid the collision.
   - **Under `skipLibCheck: true` the shim is the one file the compiler never
     checks.** `declare const bogus: ThisTypeDoesNotExist;` inside it produced
     zero errors — hand-written approximations, unverifiable by the tool whose
     job is verification.
   - **Playwright's own `.d.ts` needs DOM** (53 references to `Node`,
     `HTMLElementTagNameMap`, `SVGElement`). With `skipLibCheck` flipped to
     `false` — a strictness *increase* someone may reasonably make later — the
     shim config produces **134 errors** (`playwright-core/types/structs.d.ts:
     Cannot find name 'Node'`, plus the `navigator` redeclarations) while DOM lib
     produces **0**. The shim only appeared to work because `skipLibCheck` was
     masking what Playwright requires.

   Playwright issue #16707 asks upstream for exactly these non-global DOM types
   and is still `P3-collecting-feedback`, so no supported scoped alternative
   exists today. A test grepping Bun-side scripts for stray `document`/`window`
   outside `evaluate` callbacks was considered and not built — it is the only
   thing that would close the leak, since the type system cannot.
2. **One real latent bug (TS2339 `close' does not exist on type 'never'`).**
   `check-reachability.ts` held the browser as `let browser: Browser | null` and
   assigned it only from inside a `launch()` closure, so the compiler narrowed it
   to `null` and every use needed a `!`. The `!`s are what hid it: on the relaunch
   path (`if (!browser.isConnected()) await launch()`), `launch()` reassigned the
   *captured* variable, so whether the loop kept probing with a live handle
   depended on closure capture rather than on anything visible at the call site.
   Fixed by making `launch()` return the browser and assigning at each call site,
   with `browser: Browser` non-nullable. Five `!` assertions disappeared.
3. **Six strictness errors under `noUncheckedIndexedAccess`.** `RGB` and
   `SYNONYMS` in `check-vision.ts` were `Record<string, ...>` keyed in practice
   by four fixed colours; retyped as `Record<Colour, ...>` derived from `TRUTH`,
   so a colour with no RGB value is now a compile error rather than an
   `undefined` at the point the gate is judged. The regex capture group is now
   `fenced?.[1] ?? text`. The CRC table lookup keeps a `!` with a comment: the
   index is masked to `0..255` against a fixed 256-entry table, and a `?? 0`
   there would corrupt a checksum instead of surfacing a bug. `draw()` in the
   sampler returned `T | undefined` and would have silently produced a short
   sample; it now throws.

**No measurement changed. Verified, not assumed:**

- `bun run scripts/sample-decay-tasks.ts` after extracting the sampler into
  `scripts/lib/decay-sample.ts`: `tasks/decay-sample.json` md5 unchanged at
  `60e3325ae8bce55f7ecd11f7ca88bb80`, `git status --porcelain` clean on that
  file — byte-identical to the committed feat-003 sample.
- `bun run scripts/check-reachability.ts --mode=headless --only=github,allrecipes,google-search`
  after extracting the verdict rules into `scripts/lib/classify.ts`, chosen
  because those three sites cover an OK page and both corrections below. Verdicts,
  detail strings and counts reproduced the recorded rows exactly: GitHub
  `OK … 5893 chars, 205 interactive`, Allrecipes `BLOCKED HTTP 402 on the main
  document`, Google Search `OK … 179 chars, 44 interactive`. A field-by-field
  diff of `runs/feat-002/results.json` against the pre-run copy differed in
  `loadMs` only; the original file was then restored.
- `bun run scripts/check-vision.ts glm-4.6v`: still `4/4 quadrants correct`,
  `PASS`. The feat-001 gate holds after the type changes.
- `scripts/probe-page.ts` needed no code change — the `lib` addition alone fixed
  it — so nothing there could have moved.

**Ran:** `bun test` — was searching 113 files and matching none, exiting 0.

**Got: 29 tests over two files, covering the pure logic that already existed.**

- `tests/decay-sample.test.ts` pins the reproducibility claim itself: the draw
  from seed `20260730` equals `tasks/decay-sample.json` **object-for-object**,
  not merely by id, and the source JSONL still has the 643 tasks the sample
  records. Also: every site covered, 20 distinct tasks, a different seed gives a
  different sample, an over-large request throws rather than returning short,
  and — the one that would not have been obvious — a *shuffled* input file gives
  the same sample, which is what makes the audit reproducible for a reader who
  regenerates the task set from the WebVoyager repo in a different order.
- `tests/classify.test.ts` pins the two classifier corrections recorded in the
  feat-002 entry above, both of which were originally caught by eye on a
  screenshot rather than by the code: a low-text landing page (Google's, at 179
  chars with 44 controls) is **ok**, and an HTTP 402 is **blocked**. Around them:
  the `&&` rule still fires when a page is both text-poor and control-poor, the
  199/19 boundary, 202 is not a denial (Amazon and Booking land on it), a
  Cloudflare "just a moment" 403, and the Google `/sorry` interstitial served
  with a **200** — which status alone would miss, and which is exactly the
  feat-003 finding. Two tests guard the no-site-specific-code invariant: no
  hostname or brand appears in `BLOCK_PHRASES`, and `classify()` takes no URL at
  all, so the same page content gets the same verdict whatever site served it.

**The tests were mutation-checked, because a test that cannot fail is the same
vacuous pass in a different costume.** Four mutations, each restored after:

| Mutation | Caught by |
|---|---|
| near-empty rule reverted to the pre-correction `textChars < 200 \|\| interactive < 5` | 5 failures, incl. "classifies Google's landing page as ok" |
| `402` removed from the hard-status list | 2 failures, incl. "classifies the Allrecipes 402 access denial as blocked" |
| sampler seeded with `seed + 1` | 2 failures, incl. "is reproduced exactly by seed 20260730" |
| sampler's one-draw-per-site step deleted | 3 failures, incl. "covers every site at least once" |

No test touches the network. The classifier and the sampler are pure functions of
recorded page fields and the committed task set respectively, which is why they
are testable at all — the extraction into `scripts/lib/` was done for that
reason and changed no behaviour, as verified above.

**Concluded:**

1. **`./init.sh` is green: typecheck clean, 29 tests passing.** It also now fails
   loudly when *no* test file is found, instead of reporting a pass — the state
   this session started in.
2. **Nothing measured so far was wrong**, and that is a finding rather than an
   assumption: the sample reproduces byte-identically, the three re-probed sites
   reproduce their recorded verdicts and counts, and the vision gate still
   passes. feat-002's and feat-003's numbers stand as written.
3. **The one real bug found was in error-recovery code, which is the part no run
   exercised.** Both feat-002 modes completed without a browser-level failure, so
   the relaunch path never ran. feat-015's runner needs the same
   backstop — per the feat-002 entry — and its recovery paths need tests, because
   a benchmark run is precisely where "the browser died on site 7" happens and
   precisely where nobody is watching.
4. **`.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` was deleted**, on
   the maintainer's decision the same day, after review. It arrived in bccce0d as
   an editor-tooling side effect of feat-002 and has nothing to do with site
   reachability. It is generic boilerplate: ~100 lines on `Bun.serve`, HTML
   imports, React frontends, `bun:sqlite`, Redis and Postgres, none of which this
   project uses or plans to (`docs/PLAN.md` puts any UI beyond the trace viewer
   out of scope). In a public portfolio repo an interviewer reads it as noise at
   best, and at worst as a stray file the author did not notice — against
   AGENTS.md's "history is public and interviewers will read it". `AGENTS.md`
   already states the stack, so nothing was lost by removing it. Removed in its
   own commit rather than folded into the repair, so the history says plainly
   when it left and why.
5. **feat-004 was deliberately not started.** Its inputs are pending a human
   checkpoint: whether Google Search is dropped or carried as a blocked stratum,
   the locale policy raised in feat-003 conclusion 5, and which denominator rule
   the subset is built against. Guessing any of the three would bake an
   unexamined choice into the task set every later number is computed over.

   *Resolved 2026-07-30 at the Stage 2 checkpoint — see the four decision entries
   below. All three questions are now answered, and the benchmark itself changed.*

---

## 2026-07-30 — BENCHMARK CHANGE: WebVoyager → Online-Mind2Web

**Ran:** no new measurement. This records a decision taken at the Stage 2
checkpoint, on the evidence already in this file. External facts about the new
set were verified against
`https://github.com/OSU-NLP-Group/Online-Mind2Web` on 2026-07-30.

**Got:** the two findings that forced the question, both already recorded above:

- **feat-003:** 4 of 20 sampled WebVoyager tasks cannot be attempted as written
  today — 2 genuine site decay (BBC discontinued its market-data feeds; Booking--20
  hard-codes February 2024 dates), 2 sites refusing automation.
- **feat-003:** Google Search blocks on the first real query (`/sorry/index`,
  "unusual traffic"). That is **43 of 643 tasks**, 6.7% of the set, gone before
  the agent does anything wrong.

The replacement, verified at source: Online-Mind2Web is **300 tasks across 136
websites** — "Online-Mind2Web includes 300 diverse tasks from 136 popular
websites across various domains". Code is **MIT**; the dataset is **CC-BY-4.0**
("The Online-Mind2Web dataset is licensed under a Creative Commons Attribution
4.0 International License"). Both licenses permit use and redistribution in a
public portfolio repo with attribution.

**Concluded:** **The benchmark is now Online-Mind2Web.** The reason is precisely
the feat-003 result: a 2024 static task set decays against live sites, and this
project's whole argument is about honest denominators, so it should not spend its
credibility defending a denominator it has already measured as rotten. The
Online-Mind2Web maintainers describe the set as actively maintained against
exactly this failure mode — task validity re-checked against the live web rather
than frozen at publication. Choosing a set whose maintainers do the decay work is
a cheaper and more defensible answer than re-deriving it here every few months.

Consequences, all of them load-bearing:

1. **The WebVoyager audits are kept as findings and are NOT re-run.** feat-002
   (reachability, 15 sites, headless vs headed) and feat-003 (decay, 20 of 643)
   stay `done`, stay in this file, and stay in `feature_list.json` with their
   evidence intact. They are the *measurement that justifies the switch* — deleting
   them would remove the reason for the decision and leave the change looking
   arbitrary. They are now findings about a set this project no longer scores on,
   and every later document must say so rather than quoting them as current
   reachability.
2. **feat-002's numbers do not transfer.** Flagged separately below.
3. **`tasks/WebVoyager_data.jsonl`, `tasks/decay-sample.json` and
   `tasks/decay-audit.json` stay in the repo** as the evidence behind feat-002 and
   feat-003. The Online-Mind2Web task file is a new artifact feat-004 must fetch.
4. **"~100 of 643" becomes "~100 of 300".** The subset is now a third of the
   benchmark rather than a sixth, which strengthens the sampling argument and
   changes nothing about the hand-labeling constraint that set ~100 in the first
   place.
5. **Rejected alternatives.** (a) Staying on WebVoyager and dropping the dead
   tasks — keeps a denominator this project has itself measured as 20%-rotten on
   a 20-task sample, and makes every number need a footnote. (b) Staying on
   WebVoyager and reporting the decay as the headline — that is a benchmark-audit
   project, not an agent-evaluation project, and it does not fill the resume
   bullet. (c) Building a bespoke task set — unciteable, unreproducible, and
   exactly the kind of thing an interviewer discounts.
6. **The cost is real and should be stated, not hidden:** this discards feat-002's
   and feat-003's *forward* value. Both were run to feed feat-004, and feat-004
   now needs equivalent work against a 136-site pool. Their value as recorded
   findings — and as the justification for this change — is what remains.

---

## 2026-07-30 — DECISION: blocked tasks are excluded from the scored set, and always published

**Ran:** no measurement — a scoring-policy decision taken at the Stage 2
checkpoint. It resolves the "is Google Search dropped or carried as a stratum"
question left open by the harness-repair entry above, generalised past the one
site that raised it.

**Got:** n/a.

**Concluded:** A task on a site that refuses automated access is **excluded from
the scored set**, and **its count and the list of sites it was excluded for are
published everywhere the pass rate is published** — README, results table, and
the resume bullet's supporting detail.

Both halves are the decision; neither works alone.

- **Excluding is the honest half.** A site block is not the agent failing. Scoring
  it as a failure measures Cloudflare, not the agent, and depresses a number the
  project then has to explain away.
- **Publishing is what stops the exclusion from being a cheat.** An unpublished
  exclusion rule is indistinguishable from dropping the hard tasks: any pass rate
  can be improved by quietly removing what did not work. The count and the site
  list are what make the exclusion auditable by a reader who suspects exactly that.

Rules that follow from it, so this is not re-litigated per-site:

1. **A block must be evidenced, not asserted** — HTTP status, interstitial text, or
   a screenshot, recorded per task, the same standard feat-002 held itself to.
2. **The decision is made before the scored run, not after seeing results.** Blocks
   discovered *mid-episode* are labeled `site-blocked` by feat-020's taxonomy and
   reported as a non-agent failure; they do not retroactively leave the attempted
   denominator. Excluding on evidence gathered after seeing a failure is the
   fitting-the-categories-to-the-result problem feat-003 and T5.1 both guard against.
3. **Never write a bare pass rate.** It is always accompanied by "N tasks excluded
   as blocked, across sites X, Y, Z".
4. This is the concrete mechanism behind the two-denominator rule below: excluded
   tasks are exactly what separates *attempted* from *reachable-and-valid*.

---

## 2026-07-30 — DECISION: locale is en-US with a fixed timezone, declared, not proxied

**Ran:** no measurement — resolves feat-003 conclusion 5, which observed Amazon
rendering prices in INR and Google Flights defaulting its origin to the local
city, both from IP geolocation.

**Got:** n/a.

**Concluded:** The browser runs with a **declared, fixed configuration: locale
`en-US`, and a single fixed timezone**, set explicitly in the Playwright context
(`locale`, `timezoneId`) and recorded in every trace and in the README. **No
proxying, VPN, or IP-geolocation manipulation of any kind.**

The distinction that makes this permissible and not evasion: locale and timezone
are **standard browser configuration a real user sets**, and this project sets
them openly and reports them. A residential proxy is a claim about *where the
request comes from* — it misrepresents the client to the server, which is the
line `AGENTS.md` draws and which the amendment below does not move.

Consequences:

1. **It does not fully solve the confound, and must not be described as if it
   does.** IP-based geolocation will still put this client in its actual country.
   Expect sites to serve local currency and local defaults despite an `en-US`
   locale. The README states the locale, the timezone, and that the originating
   region is not controlled.
2. **Residual locale mismatch is a benchmark condition, not an agent failure**, and
   feat-019's taxonomy needs to be able to say so. A correct answer in the wrong
   currency is not a grounding error.
3. **The fixed timezone matters more than it looks.** Tasks with relative dates
   ("next Tuesday", "this weekend") resolve against it, so leaving it floating
   would make episodes non-comparable across runs and machines.
4. Rejected: proxying to a US IP for locale fidelity. It buys reference-answer
   agreement at the cost of the one claim this project cannot afford to weaken —
   that it does not misrepresent itself to the sites it measures.

---

## 2026-07-30 — DECISION: two denominators, reported separately, each with its n

**Ran:** no measurement — fixes the reporting contract before any number exists
to be embarrassed by, resolving the third open feat-004 input.

**Got:** n/a.

**Concluded:** Every pass rate this project publishes is reported **twice, side by
side, never one alone**:

- **Pass rate over attempted** — every task the agent was actually launched on.
  This is the conservative number and the one a skeptical reader should reach for.
- **Pass rate over reachable-and-valid** — attempted, minus tasks excluded as
  blocked (above) and minus tasks found invalid on inspection. This is the number
  that describes the agent rather than the environment.

**Each carries its own explicit n**, written next to it — "37/94 attempted (39%)"
and "37/81 reachable-and-valid (46%)", not two bare percentages. The gap between
them is itself a result and must be explained in one sentence wherever it appears.

Rules:

1. **Neither may be quoted without the other**, in the README, the resume bullet,
   or an interview answer. A single number invites the question "over what?" and
   the answer needs to already be on the page.
2. **The reachable-and-valid denominator is derived from criteria fixed before the
   run** — the block rule above, and feat-004's validity criteria. It is not a
   post-hoc filter of tasks the agent happened to fail.
3. **The resume bullet names the attempted rate** if only one fits, because the
   more conservative number is the one that survives being checked.
4. This makes concrete what `AGENTS.md`'s "separate agent failures from benchmark
   failures" invariant has demanded from the start, and what feat-018 must produce.

---

## 2026-07-30 — POLICY AMENDMENT: headless masking is now permitted. THE RULE CHANGED.

**Ran:** no measurement. This is a deliberate reversal of a standing project rule,
recorded as a reversal rather than a reword.

**Got:** n/a.

**Concluded:** **Headless masking is permitted.** Specifically: overriding the
user agent so the browser does not announce the `HeadlessChrome` token. That is
the entire permission — nothing else about the browser is altered.

**Still banned, and this amendment does not soften them:**

- **CAPTCHA solving** — manual, automated, or third-party solving services.
- **Residential and rotating proxies**, and any IP-geolocation manipulation.
- **Stealth-fingerprint suites** — `puppeteer-extra-plugin-stealth` and
  equivalents: WebGL/canvas/audio spoofing, `navigator.webdriver` patching, plugin
  and font forgery.

**What this reverses, explicitly:**

1. **`AGENTS.md`** previously read *"Do not build bot-detection evasion. No stealth
   plugins, no fingerprint spoofing, no CAPTCHA solving."* — an unqualified ban
   that caught the UA string along with everything else. It has been rewritten in
   place with the change called out, not quietly reworded.
2. **The feat-002 entry above, at its "No evasion, per AGENTS.md" paragraph.**
   That run recorded that it *"does not separate them, and deliberately did not
   try, since separating them means spoofing the UA"* — the two causes being the
   `HeadlessChrome` string and the missing GUI surface. **That deliberate
   non-separation was correct under the old rule and is now simply an
   unmeasured gap.** An amendment banner sits on that paragraph pointing here.
   The paragraph's text is unchanged: this log is append-only and records what
   was actually done at the time.

**The honest reading of the reversal:** the old rule conflated two different
things under one word. Solving a CAPTCHA, buying residential IPs, or forging a
fingerprint are attempts to *look like a different client than you are* — an arms
race, and the thing worth refusing. The `HeadlessChrome` token is a self-report
that the same browser engine, in a mode a normal user could run, volunteers about
itself. Suppressing it is closer to a run-configuration choice — the same class as
feat-002 conclusion 2, which already chose headed over headless because Allrecipes
402s the headless UA. **The strongest argument against the change is that this is
a slippery slope, and the mitigation is that the ban list above is explicit and
exhaustive rather than left to judgement.**

Consequences to carry forward:

1. **The README may no longer say "no evasion tooling is used".** It must state
   what was masked: the user agent is overridden to drop the `HeadlessChrome`
   token, and nothing else is spoofed. `README.md` has been corrected now rather
   than at feat-025, because it currently carries the false claim. Flagged in
   feat-025's description too.
2. **A headless-vs-headed block can now be attributed.** The Allrecipes question
   feat-002 left open — UA string, missing GUI surface, or both — is answerable
   with a UA override. **Not measured this session, and it must not be assumed:**
   whoever runs it records it as a new measurement here.
3. **This may reopen the headed-vs-headless run decision.** feat-002 conclusion 2
   chose headed because of Allrecipes' headless 402, and headed costs wall-clock
   and needs a GUI session, which constrains feat-015's concurrency. If masking
   alone clears that class of block, headless becomes viable again and the
   benchmark run gets cheaper. **Do not act on this without measuring it** — and
   note it would be measured against the Online-Mind2Web site pool now, not
   Allrecipes.
4. **Whatever is masked is recorded in every trace and stated in the README.** The
   claim being made is not "we did not evade" — it is "here is exactly what we
   sent, judge it yourself."

---

## 2026-07-30 — feat-004 and feat-016 respecified against Online-Mind2Web

**Ran:** no measurement — spec changes following from the benchmark change above.

**Got:** n/a.

**Concluded:**

**feat-004 — "~100 tasks stratified across all 15 sites" is now "~100 tasks
stratified across Online-Mind2Web".** The old phrasing was WebVoyager-shaped: 15
sites made one-task-per-site stratification both possible and obvious. With **136
sites and ~100 tasks, per-site strata are arithmetically impossible** — most sites
would get zero and no site would get enough for a per-site rate to mean anything.
feat-004 must therefore **choose and write down what it stratifies on** (task
difficulty as labeled by the benchmark, site domain/category, or task length are
the candidates), state why that axis, and state what it consciously gives up.
The "written selection rule a reader could reproduce" requirement is unchanged and
matters more now, not less. Updated in `feature_list.json` and `docs/TASKS.md` G4.

**feat-016 — WebJudge's published agreement is a comparison point, and it does not
remove the blind-labeling requirement.** Online-Mind2Web ships its own LLM judge,
WebJudge, with a published **~85.7% average agreement with human judgment**. Noted
in feat-016 so feat-017's result has something external to be read against —
"our judge agrees with a human X% of the time" is far more informative next to a
published figure than in isolation.

Three caveats that must travel with that number, or it will be misused:

1. **85.7% is WebJudge backed by o4-mini**, per the source ("WebJudge powered by
   GPT-4o and o4-mini consistently achieves the highest agreement, with averages
   of 83.6% and 85.7%, respectively"; a fine-tuned WebJudge-7B reaches 87%). **This
   project's judge is `glm-4.6v` running the judging protocol on the final
   screenshot and answer.** Different backbone, and — if the protocol differs at
   all — a different procedure. 85.7% is **not** this project's expected number and
   must never be quoted as if it were ours.
2. **It is measured on their labeled sample, not ours.** Agreement rates are not
   portable across task sets or human labelers.
3. **feat-017 is unchanged and still mandatory.** Blind hand-labeling of ≥30
   stratified episodes *before* seeing judge verdicts, reporting raw agreement and
   Cohen's kappa. A published third-party number about a different judge is not
   evidence about ours — if anything it raises the bar, since a materially lower
   agreement is now a visible result rather than an unknown. `AGENTS.md`'s
   "the judge does not grade itself unchecked" invariant is untouched.

---

## 2026-07-30 — FLAG, not acted on: feat-002's reachability does not transfer to 136 sites

**Ran:** nothing. This is a flag raised at the Stage 2 checkpoint so it is not
discovered later by assumption.

**Got:** n/a.

**Concluded:** **feat-002 measured 15 WebVoyager sites. Online-Mind2Web has 136.
None of feat-002's rates carry over, and quoting them against the new set would be
inventing a number.**

Concretely, these figures are now **about a set this project no longer scores on**:

- "headless 13/15 reachable, headed 14/15"
- "2 of 15 sites confirmed blocked" (Cambridge Dictionary, Google Search)
- "86 of 643 tasks on blocked sites"

They remain valid as recorded measurements of WebVoyager, and they are the
evidence for the benchmark change. They are **not** an estimate of the new pool.
Why they cannot be extrapolated:

1. **Different, mostly disjoint site list.** 136 sites drawn for coverage across
   domains overlap WebVoyager's 15 only partly. A rate over 15 hand-picked sites
   says nothing reliable about 136 different ones.
2. **The base rate is unknown in both directions.** A broader pool includes both
   softer targets and more aggressive ones; there is no reason to assume 2/15
   generalises, up or down.
3. **The masking change moves the number too.** Blocks are now measured under a
   policy that permits a UA override, so even the *same* sites could classify
   differently than feat-002 recorded.
4. **The first-action lesson still holds and is the more transferable finding.**
   Google Search loaded fine and refused the first query. Whatever measures the
   new pool must probe a **completed action**, not a `goto`. That methodological
   point transfers; the numbers do not.

**Not acted on this session, by instruction.** Reachability of the Online-Mind2Web
pool is now an owed measurement with no owner — added to the list at the top of
this file. feat-004 needs at least a partial answer, and a 136-site full audit at
feat-002's per-site cost is a materially larger job than the 15-site one; scoping
it (sample vs full sweep) is the first thing feat-004 has to decide.

---

## 2026-07-30 — feat-004 DECISION: the new reachability audit is a FULL SWEEP of every site in the pool, not a sample

**Ran:** no site measurement yet — this is the scoping decision feat-004 was told
to make first, plus the cost model it rests on. The cost figures come from two
real sources: feat-002's recorded per-site timings in `runs/feat-002/results.json`,
and a four-site smoke run of the new probe
(`bun run scripts/check-first-action.ts --source=<4 sites> --out-prefix=smoke`).

**Got:**

Per-site cost, measured, not guessed:

| probe | per-site wall clock | source |
|---|---|---|
| feat-002 `goto` only, serial | mean 4994 ms headless / 5252 ms headed | 30 rows in `runs/feat-002/results.json` |
| feat-004 first action, one rung | 11.9 – 14.2 s | the four-site smoke run |

So a completed-first-action probe costs roughly **2.4× a `goto` per site per
rung**. The pool is ~145 hosts rather than 15, and the ladder is up to three
rungs. Against that, the masked and stock headless rungs run at concurrency 4.

Estimated wall clock for the full sweep, with the arithmetic shown so it can be
checked rather than believed:

- rung 1, masked headless, all ~145 sites, concurrency 4: `145 × 12 s / 4` ≈ **7 min**
- rung 2, stock headless, only sites not yet `ok`; at an assumed 15% ≈ 22 sites,
  concurrency 4: ≈ **1 min**
- rung 3, headed, same ~22 sites, **serial** because headed Chromium drives a real
  GUI and that is where feat-002 saw `newContext()` hang: `22 × 12 s` ≈ **4.5 min**
- hangs: the smoke run hit one 90 s rung deadline in four sites. Budget several.

**Total ≈ 20–30 minutes, unattended.** The 15% escalation rate is an assumption,
flagged as such; it is the only soft number here, and the total is not sensitive
to it — even at 50% escalation the sweep stays under an hour.

**Concluded: full sweep of every site in the pool. Not a sample.**

The decisive argument is not cost. **A sample cannot produce the artifact the
settled scoring rule requires.** The 2026-07-30 blocked-task decision says blocked
tasks are excluded from the scored set, that the decision is made *before* the run
rather than after seeing results, and that the count and site list are published.
That needs a **per-site verdict for every site the draw could touch** — and since
the draw is over the whole eligible pool, that is every site. A sample yields a
*rate* ("roughly N% of sites block automation"), which is a nice sentence and
useless here: it cannot tell the sampler which tasks to drop. Sampling would push
every undiscovered block to run time, where the same decision would then be made
*after* seeing a failure, which is precisely the fitting-the-categories-to-the-result
problem feat-003 and T5.1 both guard against.

The cost finding is that this was affordable anyway. The earlier worry — recorded
in `session-handoff.md` as "a 136-site sweep at feat-002's per-site cost is a
materially bigger job" — assumed feat-002's serial, two-mode shape. Concurrency on
the headless rungs and escalating only the failures changes the arithmetic more
than the larger site count does.

Two consequences that are part of the decision:

1. **The ladder answers the open masking question for free.** Every site records
   the rung at which it passed, so "what did dropping the `HeadlessChrome` token
   actually buy" — flagged as unmeasured on 2026-07-30 — comes out of the same run
   as a count of sites that passed masked-headless but not stock-headless. It is
   **not** a full attribution: this design cannot separate the UA string from the
   missing GUI surface for a site that only passes headed. That remains owed.
2. **The sweep is a snapshot, not a standing fact.** Live sites change. The audit
   is dated, its verdicts are committed to `tasks/site-audit.json` with per-rung
   evidence, and any later run that disagrees is a new measurement, not a
   correction of this one.

---

## 2026-07-30 — feat-004 MEASUREMENT: the first-action probe, validated on four sites with known behaviour

**Ran:** `bun run scripts/check-first-action.ts --source=<4-site fixture> --out-prefix=smoke --concurrency=4`
against arxiv.org, google.com, dictionary.cambridge.org and allrecipes.com — the
sites whose behaviour feat-002 and feat-003 already recorded, so the instrument
can be checked against known answers before it is pointed at 145 unknown ones.

**Got:** `ok=1 blocked=3 degraded=0 no-action=0 error=0 (of 4 sites)`.

| site | load | first action | result | verdict |
|---|---|---|---|---|
| arxiv.org | HTTP 200 | `search-submit`, box revealed by `[aria-expanded="false"][aria-controls*="search"]` | `→ /search/?query=blue&searchtype=all&source=header`, HTTP 200, 37 499 chars | **ok** |
| google.com | HTTP 200, 187 chars | `search-submit` into `textarea[name="q"]` | `→ /sorry/index`, **HTTP 429**, "unusual traffic" | **blocked**, all 3 rungs |
| allrecipes.com | HTTP 200 headed, 5926 chars | `search-submit` into `input[name="q"]#1` | `→ /search?q=blue`, **HTTP 402** | **blocked**, all 3 rungs |
| dictionary.cambridge.org | HTTP 403, "just a moment" | none — refused on load | — | **blocked**, all 3 rungs |

**Concluded:** the probe reproduces feat-003's Google Search finding on the live
site and **surfaces one genuinely new result**.

1. **The first-action lesson is confirmed, on the site that taught it.**
   google.com serves a clean 200 landing page — a `goto` probe scores it reachable,
   exactly as feat-002 did — and answers the first query with `/sorry/index` and
   HTTP 429. The probe catches it.
2. **NEW: Allrecipes does the same thing, and feat-002 missed it.** feat-002
   recorded Allrecipes as headed-OK (`HTTP 200, 5837 chars`) on a `goto`. Its
   *search* returns **HTTP 402 in all three rungs, headed included**. So the
   landing-page-versus-usable gap is not a Google peculiarity; it is a second
   independent instance, on a site the old audit scored as fine. This is a finding
   about the WebVoyager pool recorded here rather than in feat-002, because
   feat-002 is closed and not re-run.
3. **Building the instrument found four defects that would have corrupted the
   sweep**, each caught by a real site rather than by inspection:
   - **An input-only selector ladder scored google.com `no-action`.** Its search
     field is a `textarea`, and the probe silently failed to test the one site the
     whole feature exists for. A probe that cannot reach the known-hard case
     measures nothing.
   - **A post-action status race produced a false `ok` on allrecipes.com.** The
     navigation response arrived while the action was in flight and was then
     overwritten by the reset, so `classify()` fell back to the *pre-action* 200
     and reported the 402 page as served. The reset now happens before the action.
   - **A later rung's error erased earlier evidence.** Cambridge Dictionary
     returned a clean 403 at both headless rungs and then hung the headed rung past
     its 90 s deadline; the site resolved to `error`, quietly leaving the exclusion
     list on the strength of a hang. Resolution now takes the last rung that
     *observed* something.
   - **A link-click that never navigated counted as a completed action.**
     arxiv.org's `/search` anchor opens an in-page overlay; the probe clicked it,
     went nowhere, and scored the site `ok`. A link-click now has to actually move.
   All four are pinned by tests in `tests/first-action.test.ts`, and all four
   mutations of those tests fail as they should.
4. **Caveat on n.** Four sites, hand-picked *because* their answers were known.
   This validates the instrument; it is **not** an estimate of anything about the
   145-site pool, and the `ok=1 blocked=3` split must never be quoted as a rate.

---

## 2026-07-30 — feat-004 DECISION: the stratification axis is the benchmark's own `level` label

**Ran:** no measurement — the axis choice feat-004 was required to make, justify,
and state the cost of. Distributional figures quoted below were computed from a
third-party mirror of the task file and are **provisional**; see the provenance
entry that follows.

**Got:** n/a.

**Concluded:** **~100 tasks stratified on `level`, the difficulty label
Online-Mind2Web ships with each task. One axis. No second axis and no per-site cap.**

The full rule is written for a reader in `docs/SUBSET-RULE.md`; the executable
form is `scripts/lib/subset.ts` and `scripts/select-subset.ts`.

**Why `level`, over the two alternatives the spec named:**

1. **It is a published field, so the strata need no judgement from us.** Site
   domain/category would require inventing a taxonomy over ~145 hosts and
   assigning each one by hand. That is unreproducible by a reader, and it is a
   place where bias could hide with no way to detect it. `level` is in the file;
   two people re-deriving the strata get the same answer.
2. **Difficulty is the axis that actually confounds the headline number.** The
   claim this subset supports is a pass rate. Pass rates move hardest with task
   difficulty, so a subset that over-sampled easy tasks would inflate the number
   in the one direction an interviewer will probe. Proportional strata on `level`
   make the subset's difficulty mix the benchmark's mix, which is what lets
   "~100 of 300" be defended as representative on the dimension that matters most.
3. **It gives feat-020 usable per-stratum n.** ~100 tasks over three levels lands
   near 27/48/25 — each large enough to carry a failure-mode breakdown. Over ~145
   sites it would be ~0.7 tasks per site, which supports nothing.
4. **Over task length specifically:** `reference_length` is the underlying step
   count, but `level` is not a pure function of it — in the file, `medium` reaches
   12 steps and `hard` starts at 11, so the labels carry human judgement the raw
   number does not. Stratifying on the label also keeps our strata comparable with
   the benchmark's own leaderboard, where a bucketing we invented would not be.

**What this consciously gives up — all four are real, and none is engineered around:**

1. **No per-site or per-domain pass rate.** Sites enter the subset only
   incidentally. The project **cannot** say "the agent does worse on travel sites
   than on retail", and must not, anywhere. That claim is not measurable from this
   subset.
2. **Site coverage is uncontrolled and uneven.** At ~1/3 sampling over a pool
   where most hosts carry one task and the largest carries about a dozen, roughly
   half the sites contribute nothing and a handful contribute several. The
   realized per-site counts are published in `tasks/subset.json` (`siteCounts`)
   so a reader sees the concentration rather than taking it on trust.
3. **Concentration is a correlated risk.** If a heavily-represented site breaks or
   starts blocking mid-run, it takes several subset tasks with it at once. That is
   accepted, and it is why blocks are reported with their site list.
4. **The labels are the benchmark's judgement, not ours, and they measure human
   effort.** `level` is derived from the human reference trajectory; a two-step
   task on a bot-hostile site is `easy` by label and impossible in practice.
   Difficulty-for-a-human is a proxy for difficulty-for-this-agent, and the gap
   between them will show up in feat-020's failure distribution, not here.

**Rejected: adding a per-site cap.** It would bound the concentration in (2) and
(3) cheaply. It is rejected because the spec asks for **one** axis and a cap is a
second one wearing a different hat — it controls site representation, which is
exactly what choosing `level` declined to control. The benchmark's own site
concentration is a property of the benchmark; suppressing it would make the subset
unrepresentative on a dimension nobody decided to manage. Reporting it is the
honest alternative, and it matches how feat-002 handled a blocked site: a finding
to publish, not a problem to engineer around.

---

## 2026-07-30 — feat-004 PROVENANCE: the canonical task file is gated, and the mirror is a different revision

**Ran:**
```
curl -sSL https://huggingface.co/datasets/osunlp/Online-Mind2Web/resolve/main/Online_Mind2Web.json
curl -sSL https://huggingface.co/api/datasets/osunlp/Online-Mind2Web/tree/main
gh api repos/theredsix/abp-online-mind2web-results/contents/Online_Mind2Web.json
```

**Got:**

- The canonical file is **gated**: `HTTP 401`, *"Access to dataset
  osunlp/Online-Mind2Web is restricted. You must have access to it and be
  authenticated to access it."* The dataset metadata reports `"gated":"auto"`, so
  the gate is accept-and-go rather than a review, but it still requires a logged-in
  HuggingFace account. `hf-mirror.com` returns the same 401.
- The repo tree API, which is *not* gated, reports the current revision of
  `Online_Mind2Web.json` as **size 88382, git blob oid
  `e8a5e5a99f2be9eae14f4e4259bd5af562f80da9`**, `lastModified` 2026-07-18.
- The task set is **not in the GitHub code repo** — that holds the WebJudge
  evaluation code and result dumps only.
- A third-party mirror exists at `theredsix/abp-online-mind2web-results`:
  300 tasks, correct schema (`task_id`, `confirmed_task`, `website`,
  `reference_length`, `level`), **size 88329, sha256
  `50d330ee9f347c5ae136e52421516590033b146df305ab091c5a36b199b14aa4`**, git blob
  oid `f38e1dbb2f3d7ed7c966a8c818cd97bb2020c2e1`.

**Concluded:** **The mirror is demonstrably not the current canonical revision** —
different size, different blob oid. Its newest task-id date suffix is `_010226`
(2 Jan 2026) against a canonical `lastModified` of 18 Jul 2026, and the dataset
card's own news line records that tasks are revised in batches, so the mirror is
very likely several revisions stale. **The subset is therefore drawn from the
canonical file only**, and `tasks/subset.json` records the sha256 of the exact
bytes it was drawn from, because a subset is only reproducible against the
revision it came from and this set is actively maintained.

**Resolved the same day.** The canonical file was obtained and verified
byte-identical to the current HF revision — **size 88382, git blob oid
`e8a5e5a99f2be9eae14f4e4259bd5af562f80da9`**, sha256
`7dedf381531d423dc0fc48d21dc1d425655dd75f38b10211a880fa09102f257f`. It is committed
at `tasks/Online_Mind2Web.json`, and the sha256 is recorded in `tasks/subset.json`.

**The mirror was indeed a different revision, and the difference is not cosmetic.**
Both files hold 300 tasks and normalise to 145 distinct hosts, but the levels
differ: canonical **easy 80 / medium 141 / hard 79**, mirror easy 80 / medium 143 /
hard 77. Two tasks moved from `medium` to `hard` between revisions. Drawing from
the mirror would have allocated **27/48/25 instead of the correct 27/47/26** — a
different subset, stratified against a difficulty mix the benchmark no longer has.
The provenance check was not ceremony.

**One measured fact to state instead of repeating the published one.** The dataset
card says *"300 diverse tasks from 136 popular websites"*. The canonical file's 300
`website` values are **147 distinct URL strings normalising to 145 distinct hosts**.
This project reports **145**, the number it measured, and does not repeat 136 as if
it had counted it. The gap is presumably how the maintainers group a site; either
way, an unexplained count is not a number this project may quote.

---

## 2026-07-30 — feat-004: the first full-sweep attempt died on the browser-relaunch path, exactly where the handoff said it would

**Ran:** `bun run scripts/check-first-action.ts --concurrency=4` over all 145 sites.

**Got:** the run produced two real verdicts and then 143 identical failures:

```
ERROR     accuweather.com                 240ms   | probe error: goto: net::ERR_HTTP2_PROTOCOL_ERROR
BLOCKED   adoptapet.com                  4173ms  load: interstitial phrases: request blocked (HTTP 403)
ERROR     4shared.com                   90000ms  rung-level failure: deadline of 90000ms exceeded
ERROR     9gag.com                      90000ms  rung-level failure: deadline of 90000ms exceeded
ERROR     airbnb.com                    90000ms  rung-level failure: deadline of 90000ms exceeded
... (every remaining site, identically)
```

`ps` confirmed the diagnosis: **zero Chromium processes alive**, the Bun process
idle at 0% CPU with no open TCP sockets. Chromium had died two sites in, and every
subsequent `browser.newContext()` hung against a dead handle until its deadline.
Left alone the run would have taken about eight hours to produce a file of nothing
but `error`, and — this is the part that matters — **it would have looked like a
result.** 4shared.com, 9gag.com and airbnb.com all probe fine; the sweep would have
reported them unreachable.

**Concluded:** the cause was a straight omission. `check-reachability.ts` guards its
serial loop with `if (!browser.isConnected()) browser = await launch()`, and that
guard was **not carried over** when the sweep was written with a concurrent worker
pool sharing a single browser.

`session-handoff.md` had flagged this exact class in advance — *"the single real
bug typecheck found was in the browser-relaunch path — error recovery that no run
had ever executed... feat-015's runner is mostly recovery code. Test those paths
directly."* It fired on the first real run of the next thing built.

Fixes, all three now in `scripts/check-first-action.ts`:

1. **Each worker owns its own browser and replaces it after any failure.** Not just
   on `isConnected() === false`: a browser that produced a failure is closed and
   relaunched unconditionally, because a wedged one stays wedged and the blast
   radius of reusing it is every remaining site.
2. **The rung deadline drops from 90s to 60s.** A site that cannot load and take
   one action inside a minute is not usable by the agent either, and a shorter cap
   bounds what a bad state can cost.
3. **Progress is written to `runs/feat-004-progress.log`, flushed per line.** Bun
   block-buffers stdout when redirected to a file, so for six minutes a wedged run
   and a working run were indistinguishable from the outside. That is what let the
   failure go unnoticed at first, and it is a property of every long unattended run
   this project will do.

**Verified, not assumed.** The recovery path was exercised deliberately: an
8-site run with every Chromium process killed from outside mid-run
(`pkill` at 21:20:00, after site 2). The sweep relaunched and completed sites 3–7
normally — `4shared.com` and `airbnb.com`, which the broken run had reported as
90-second timeouts, both came back `ok`. Killing the browser is now a check that
has actually been run rather than a path that has only been read.

**Carry to feat-015.** The benchmark runner is mostly recovery code, it runs
unattended for hours, and this is the second time this exact path has been the bug.
Its resume-after-interruption and dead-browser handling must be tested by inducing
the failure, not by inspection — and it must log progress in a way that a stall is
visible from outside the process.

---

## 2026-07-30 — feat-004 MEASUREMENT: first-action reachability of all 145 Online-Mind2Web sites

**Ran:** `bun run scripts/check-first-action.ts --concurrency=20`, a full sweep of
every site in the pool. Ladder per site, stopping at the first rung that
completed an action: masked headless → stock headless → headed. One fixed query
(`blue`) typed at every site, generic selectors only, locale `en-US`, timezone
`America/New_York`, no proxying. Evidence per rung in
`runs/feat-004/attempts.jsonl`; committed verdicts in `tasks/site-audit.json`.

**Got:**

```
ok=93 blocked=18 degraded=4 no-action=30 error=0  (of 145 sites)
tasks on blocked sites: 47 of 300
sites that needed escalation past headless-masked: 18
```

Of the 93 that completed an action: **70 by submitting a search, 23 by a
same-origin link click** (the weaker probe, recorded as such). Of the 145 sites,
**73 contribute no task to the subset** and 72 do.

**The 18 blocked sites, and the 47 tasks they cost:**

| tasks | site | reason |
|---|---|---|
| 9 | adoptapet.com | "request blocked" (HTTP 403) |
| 8 | apartments.com | "access denied" |
| 7 | cars.com | "just a moment" (HTTP 403) |
| 6 | healthgrades.com | HTTP 403 |
| 2 | imdb.com | "security check" (HTTP 202) |
| 2 | microcenter.com | "just a moment" (HTTP 403) |
| 2 | webmd.com | "captcha" (HTTP 200) |
| 1 each | allrecipes, bandcamp, bhphotovideo, boardgamegeek, carvana, cvs, discogs, marriott, phys.org, remax, ziprecruiter | mixed: 403s, challenges, and first-action refusals |

**Concluded:**

**1. The first-action probe earns its cost. 6 of the 18 blocked sites — a third —
serve a working landing page and then refuse the first action.** allrecipes.com,
bandcamp.com, bhphotovideo.com, carvana.com, discogs.com and ziprecruiter.com all
return HTTP 200 with thousands of characters of real content, and refuse the
search. **A `goto`-only audit of this pool would have called 132 of 145 sites
reachable and kept those 6 tasks in the scored set as attemptable.** feat-003
predicted exactly this from a single site (Google Search); it generalises.

**2. Masking is not the lever it was hoped to be, and the ladder cannot fully
answer the question.** 75 of the 93 passing sites passed at masked headless, 3
only at stock headless, and **15 needed a real headed browser**. So the GUI
surface matters five times more often than the UA string does.

But note what this design *cannot* show: because the masked rung runs first and
the ladder stops on success, **a site that passes masked is never tried at stock,
so this run produces no evidence that masking helped anything.** It can only
detect masking *hurting* (masked fails, stock passes) — which happened 3 times,
and with no repeat trials those 3 are indistinguishable from flakiness.
**Answering "what does masking buy" properly needs both arms run over all sites,
which this is not.** The owed measurement stays open, narrowed.

**3. Verdicts are reproducible where it counts — verified, not asserted.** The
sweep ran at concurrency 20 (load average 16–25). 43 sites were re-probed at
concurrency 3 (load ~9): all 18 blocked, all 4 degraded, a 10-site `no-action`
sample and an 11-site `ok` control.

- **The blocked set is identical: 18 vs 18, no site in one and not the other.**
  The exclusion list — the only verdict the scored set depends on — does not move
  with machine load.
- Overall agreement 40/43 (93%). **All 3 disagreements are `no-action` → `ok`**,
  the predicted direction: under load a search affordance did not become visible
  in time. None of them is excluded either way.
- So **the published `no-action` count of 30 is an upper bound** on "sites this
  probe could not exercise", not a claim that those sites have no search box.

**4. This is a dated snapshot, not a standing fact,** and one site proves it:
google.com resolved `blocked` in an early validation run (`/sorry/index`,
HTTP 429, "unusual traffic") and `ok` in the sweep. Its refusal is intermittent,
and it carries 5 subset tasks. Live-site verdicts are re-measurable, not
permanent, and feat-019's taxonomy needs a mid-episode `site-blocked` category
regardless of what this audit recorded.

---

## 2026-07-30 — feat-004: two settle bugs that silently corrupted a completed sweep

**Ran:** a full 145-site sweep completed and produced
`ok=89 blocked=15 degraded=13 no-action=28`. **Those numbers are discarded and
must never be quoted.** This entry records why, because the failure mode is the
interesting part.

**Got:** the audit reported `degraded — 0 chars of text, 0 interactive elements`
for **amazon.com, booking.com, imdb.com, airbnb.com, thumbtack.com,
backcountry.com** and near-empty for **google.com** — all after settling in
~610ms. feat-002 recorded Amazon and Booking loading fine with full content,
which is the contradiction that exposed it.

**Concluded:** two independent defects, both introduced by replacing a fixed
`waitForTimeout` with adaptive settling. The replacement was right — a fixed
sleep measures wall-clock, so under load a page renders less inside it and the
probe reports machine load as site behaviour — but the implementation was wrong
twice:

1. **An empty SPA shell satisfied the stability rule instantly.** "Visible text
   length unchanged across two polls, `readyState` complete" is true at zero
   characters while an app boots. Fixed: zero-length text is never stable, plus a
   2s floor before stability may be accepted at all, plus 3 consecutive polls.
2. **A redirect during settling was read as "done".** Even after (1) those sites
   still exited at ~1.2s — *below* the new floor, so it was not the stability
   rule. `page.evaluate` throws "execution context was destroyed" when the page
   navigates mid-poll, and the `catch → break` classified the empty intermediate
   document. Fixed: a failed evaluate means keep waiting for the page that
   replaces it; only a closed page ends settling. The reason settling stopped is
   now recorded per probe (`stable` / `cap` / `cap-after-navigation` /
   `page-closed`).

After both fixes the same sites read correctly — amazon.com 5325 chars growing to
14 699 across its search, airbnb.com 8835, imdb.com correctly `blocked` on its
security check — and the pool-wide `degraded` count fell from 13 to 4.

**The rule now lives in `lib/first-action.ts` as a pure function (`stepSettle`)
with six tests**, mutation-checked, one of which reintroduces the original bug
and fails as it must. A heuristic that silently corrupted a completed 145-site
sweep does not get to stay untested.

**Carry to feat-015:** this is the third error-recovery defect in this feature
alone — a shared browser with no relaunch guard, an unbounded `browser.close()`
inside the recovery path, and now a `catch → break` that turned a transient
failure into a measurement. Every one produced *plausible output* rather than a
crash. The benchmark runner must be tested by inducing failures, and its outputs
sanity-checked against known-good sites, because a corrupted run looks exactly
like a successful one.

---

## 2026-07-30 — feat-004 RESULT: the scored subset, 100 tasks

**Ran:** `bun run scripts/select-subset.ts`

**Got:**

```
300 tasks, 145 sites
source sha256: 7dedf381531d423dc0fc48d21dc1d425655dd75f38b10211a880fa09102f257f
excluded as blocked: 47 tasks across 18 sites
stratum      in-full-set  eligible  allocated
easy                  80        73         29
medium               141       113         45
hard                  79        67         26
subset: 100 tasks across 72 sites
```

Re-running reproduces `tasks/subset.json` byte for byte — md5
`eb7dcacf6b87a42a888a39518062485c` across two runs.

**Concluded:** the scored set is **100 tasks**, stratified on `level`, drawn with
mulberry32 seeded 20260730 from the 253 tasks left after excluding the 18 blocked
sites. The written rule is `docs/SUBSET-RULE.md`; `tests/subset-artifact.test.ts`
pins the committed artifact to the committed rule.

Properties a reader should be able to check:

- **Difficulty mix matches the pool it was drawn from exactly** — 29/45/26 against
  an eligible pool of 29%/45%/26%. Against the *full* 300 it is 29/45/26 vs
  27/47/26; the small drift is the blocked sites not being difficulty-neutral,
  and it is visible rather than hidden because both columns are published.
- **Site concentration, published rather than capped:** 72 of 145 sites appear,
  so **73 sites contribute nothing**. 54 sites contribute one task, 13 two, 2
  three, 1 four, and 2 five. The largest single-site share is **google.com with 5
  of 100** — which matters, because google.com's block is intermittent (above).
- **47 tasks excluded as blocked, across 18 named sites**, published here, in
  `tasks/subset.json` under `excludedAsBlocked`, and required alongside every
  pass rate this project reports.

The denominators feat-018 will report: **100 attempted**, and reachable-and-valid
= 100 minus whatever proves invalid on inspection. The 47 blocked tasks are
outside both, by the pre-registered rule, and their count travels with the number.
