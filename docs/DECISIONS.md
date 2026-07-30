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
