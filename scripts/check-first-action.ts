/**
 * feat-004 — first-action reachability audit over the Online-Mind2Web site pool.
 *
 * This is NOT a re-run of feat-002. feat-002 measured 15 WebVoyager sites with a
 * `goto`, and both halves of that are wrong for this benchmark: the pool is a
 * different and much larger set of sites, and a `goto` scores Google Search as
 * reachable when it in fact refuses the first query (feat-003). This audit
 * probes a **completed first action** per site, over **every** site in the pool.
 *
 * Scope and cost are argued in docs/DECISIONS.md, feat-004 audit-scoping entry.
 * Short version: a sample cannot produce the artifact the settled scoring rule
 * needs. Excluding blocked tasks before the run requires a per-site verdict for
 * every site the draw could touch, which is all of them.
 *
 * Escalation ladder, per site, stopping at the first rung that completes an
 * action: headless with the `HeadlessChrome` token masked -> headless stock ->
 * headed. A site is `blocked` only if every rung refuses it, which is the
 * standard feat-002 used to tell a real block (Cambridge, 403 both modes) from a
 * mode artefact (Allrecipes, 402 headless / 200 headed). Because the ladder
 * records which rung succeeded, it also shows what the masking actually bought.
 *
 * Evasion: the masked rung overrides the user agent to drop the
 * `HeadlessChrome` token and nothing else, per the 2026-07-30 amendment in
 * AGENTS.md. No stealth plugin, no fingerprint patching, no CAPTCHA handling,
 * no proxy. The exact UA used on every rung is recorded per site.
 *
 * NO SITE-SPECIFIC CODE. The selector ladder and the verdict rules are generic
 * and live in `lib/first-action.ts` and `lib/classify.ts`.
 *
 * Run: bun run scripts/check-first-action.ts [--concurrency=4] [--only=a.com,b.com]
 *      bun run scripts/check-first-action.ts --limit=10        # smoke test
 *      bun run scripts/check-first-action.ts --source=x.json --out-prefix=smoke
 * Writes: runs/feat-004/first-action.json, runs/feat-004/<rung>/<site>.png,
 *         and tasks/site-audit.json (the committed verdicts).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { classify, type Verdict } from "./lib/classify.ts";
import {
  MAX_CANDIDATES_PER_SELECTOR,
  PROBE_QUERY,
  RUNG_ORDER,
  SEARCH_SELECTORS,
  SEARCH_TOGGLES,
  SETTLE_POLL_MS,
  initialSettleState,
  maskHeadlessUserAgent,
  resolveSiteVerdict,
  stepSettle,
  type ProbeAction,
  type ProbeAttempt,
  type ProbeRung,
  type SiteVerdict,
} from "./lib/first-action.ts";
import { parseOm2wJson, siteKey, type Om2wTask } from "./lib/subset.ts";

const DEFAULT_SOURCE = "tasks/Online_Mind2Web.json";

const NAV_TIMEOUT_MS = 45_000;

/**
 * Settling is adaptive, not a fixed sleep. This is a correctness property, not
 * a performance tweak.
 *
 * A fixed `waitForTimeout(3000)` measures wall-clock, but what the probe needs
 * is *the page has finished rendering*. Those coincide only on an idle machine:
 * run 60 browsers on 10 cores, the load average hits 220, and each page gets a
 * fraction of the CPU during that same 3s — so it has drawn less when
 * `classify()` looks at it, and a half-rendered page reads as `degraded` or
 * `no-action`. The probe would report machine load as site behaviour, and the
 * faster you ran it the worse the data would get.
 *
 * The decision of *when* a page has stopped changing lives in
 * `lib/first-action.ts` as a tested pure function — the naive version of that
 * rule corrupted a whole sweep, so it is pinned rather than trusted.
 *
 * Caps only bound the wait; they are not the normal path.
 */
const SETTLE_CAP_MS = 15_000;
/** Upper bound on settling the page that answers the action. */
const ACTION_SETTLE_CAP_MS = 15_000;
/**
 * Headed Chromium drives a real GUI. feat-002 saw `newContext()` hang there, but
 * that was many contexts on one shared browser; each worker now owns its own and
 * replaces it on failure, so a small amount of parallelism is safe and turns the
 * slowest rung from serial into something bounded.
 */
const HEADED_CONCURRENCY = 3;
/** Hard wall-clock cap per site per rung. Playwright's timeouts do not cover
 *  every hang — see the same backstop in check-reachability.ts. */
const RUNG_DEADLINE_MS = 60_000;

/**
 * Locale is declared configuration, not evasion: en-US with a fixed timezone,
 * set explicitly and reported. Decided 2026-07-30 (docs/DECISIONS.md). It does
 * not control the originating IP region and is not claimed to.
 */
const LOCALE = "en-US";
const TIMEZONE_ID = "America/New_York";

interface RungRecord extends ProbeAttempt {
  site: string;
  url: string;
  finalUrlAfterLoad: string | null;
  finalUrlAfterAction: string | null;
  loadStatus: number | null;
  actionStatus: number | null;
  /** Which entry of SEARCH_SELECTORS matched, for auditing weak matches. */
  matchedSelector: string | null;
  /** How long each adaptive settle actually took. Makes load effects visible. */
  settleMs: number | null;
  /** Why settling stopped: stable | cap | cap-after-navigation | page-closed. */
  settleEnd: string | null;
  actionSettleMs: number | null;
  /** Page size before and after the action. Evidence, not a verdict. */
  pageShape: {
    textCharsBefore: number;
    textCharsAfter: number;
    interactiveBefore: number | null;
    interactiveAfter: number | null;
  } | null;
  userAgent: string | null;
  ms: number;
}

interface SiteRecord {
  site: string;
  url: string;
  taskCount: number;
  attempts: RungRecord[];
  resolved: SiteVerdict;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  const num = (k: string, d: number) => {
    const v = get(k);
    const n = v === undefined ? d : Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${k} must be a positive number`);
    return n;
  };
  // `--out-prefix` keeps a smoke run from overwriting the real audit artifacts.
  const outPrefix = get("out-prefix");
  return {
    concurrency: num("concurrency", 8),
    limit: get("limit") ? num("limit", 0) : undefined,
    only: get("only")?.split(",").map((s) => s.trim()).filter(Boolean),
    source: get("source") ?? DEFAULT_SOURCE,
    outRun: outPrefix ? `runs/feat-004/${outPrefix}-first-action.json` : "runs/feat-004/first-action.json",
    outAudit: outPrefix ? `runs/feat-004/${outPrefix}-site-audit.json` : "tasks/site-audit.json",
    shotDir: outPrefix ? `runs/feat-004/${outPrefix}` : "runs/feat-004",
  };
}

/** Reject if `work` has not settled within `ms`. */
function withDeadline<T>(ms: number, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`deadline of ${ms}ms exceeded`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Resolve to `fallback` if `p` has not settled within `ms`. Never rejects.
 *
 * For browser lifecycle calls, which is the second place this sweep hung. The
 * per-site deadline bounded the *probe*, but the recovery that runs after a
 * failed probe — `browser.close()` then `chromium.launch()` — was itself
 * unbounded. A wedged Chromium made `close()` never settle, so the worker sat in
 * its own error handler forever, `Promise.all` never resolved, and the rung
 * stopped one site short of finishing with every browser already dead.
 *
 * The lesson is the same one as the first stall, one level down: recovery code
 * needs the same bounds as the code it recovers from, or it becomes the hang.
 */
function orAfter<T>(ms: number, p: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const CLOSE_DEADLINE_MS = 10_000;
const LAUNCH_DEADLINE_MS = 30_000;

/**
 * Collapse the task list to one probe target per site.
 *
 * The representative URL is the one belonging to the lowest `task_id` on that
 * site, so the target set is a deterministic function of the input file rather
 * than of its row order.
 */
export function siteTargets(tasks: Om2wTask[]): { site: string; url: string; taskCount: number }[] {
  const bySite = new Map<string, Om2wTask[]>();
  for (const t of tasks) {
    const k = siteKey(t.website);
    const g = bySite.get(k);
    if (g) g.push(t);
    else bySite.set(k, [t]);
  }
  return [...bySite.entries()]
    .map(([site, group]) => {
      const rep = [...group].sort((a, b) => a.task_id.localeCompare(b.task_id))[0]!;
      return { site, url: rep.website, taskCount: group.length };
    })
    .sort((a, b) => a.site.localeCompare(b.site));
}

/**
 * Wait until the page stops changing, or until `capMs`. Returns how long it took.
 *
 * "Stops changing" is `document.readyState === "complete"` plus a visible-text
 * length that has held steady across `SETTLE_STABLE_POLLS` consecutive samples.
 * Text length is the right signal because it is exactly what `classify()` reads:
 * settling until *the input to the verdict* is stable is what decouples the
 * verdict from machine load.
 *
 * A page whose text never stabilises — a ticker, an autoplaying feed — falls
 * through to the cap, which is the old fixed-sleep behaviour and no worse.
 */
async function settlePage(page: Page, capMs: number): Promise<{ ms: number; end: string }> {
  const started = Date.now();
  let state = initialSettleState;
  let misses = 0;
  while (Date.now() - started < capMs) {
    const seen = await page
      .evaluate(() => ({ len: (document.body?.innerText ?? "").length, ready: document.readyState }))
      .catch(() => null);

    // A failed evaluate is almost always "execution context was destroyed" —
    // the page redirected mid-poll. Treating that as settled is how amazon.com,
    // booking.com and airbnb.com came back as `0 chars of text` after ~1.2s,
    // *below* the settle floor: they bounce through a redirect on load, the
    // evaluate threw, and the old code broke out of the loop and classified the
    // empty intermediate document. A navigation is a reason to keep waiting for
    // the page that replaces it, not a reason to stop looking.
    if (seen === null) {
      if (page.isClosed()) return { ms: Date.now() - started, end: "page-closed" };
      misses += 1;
      await page.waitForTimeout(SETTLE_POLL_MS);
      continue;
    }
    misses = 0;

    const next = stepSettle(state, seen, Date.now() - started);
    state = next.state;
    if (next.done) return { ms: Date.now() - started, end: "stable" };
    await page.waitForTimeout(SETTLE_POLL_MS);
  }
  return { ms: Date.now() - started, end: misses > 0 ? "cap-after-navigation" : "cap" };
}

/** Read the visible text and a rough interactive-element count. */
async function readPage(page: Page) {
  const bodyText = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")) as string;
  const interactiveCount = await page
    .evaluate(() => document.querySelectorAll("a[href], button, input, select, textarea, [role=button]").length)
    .catch(() => null);
  const title = await page.title().catch(() => null);
  return { bodyText, interactiveCount, title };
}

/**
 * Take one generic first action.
 *
 * Search submit is preferred: it is a server round-trip carrying a query, which
 * is exactly the interaction that Google refused while serving a clean landing
 * page. A same-origin link click is the weaker fallback for sites with no search
 * affordance — recorded as such so it can be discounted.
 */
async function takeFirstAction(
  page: Page,
): Promise<{ action: ProbeAction; matchedSelector: string | null }> {
  /** Scan the selector ladder for a field that is genuinely usable right now. */
  const findBox = async () => {
    for (const selector of SEARCH_SELECTORS) {
      const all = page.locator(selector);
      const n = Math.min(await all.count().catch(() => 0), MAX_CANDIDATES_PER_SELECTOR);
      for (let i = 0; i < n; i++) {
        // Pages carry hidden duplicates of their search form; take the first
        // candidate that is actually usable rather than the first in the DOM.
        const box = all.nth(i);
        const usable = await box
          .isVisible({ timeout: 1_500 })
          .then((v) => v && box.isEditable({ timeout: 1_500 }))
          .catch(() => false);
        if (usable) return { box, selector: `${selector}#${i}` };
      }
    }
    return null;
  };

  let hit = await findBox();
  let revealedBy: string | null = null;
  const startPath = new URL(page.url()).pathname;

  // Nothing usable on the surface: try to reveal a collapsed search field.
  if (!hit) {
    for (const toggle of SEARCH_TOGGLES) {
      const t = page.locator(toggle).first();
      const clickable = await t.isVisible({ timeout: 1_000 }).catch(() => false);
      if (!clickable) continue;
      await t.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1_500);
      // Some disclosure controls carry a real href their own JS suppresses. If
      // this one navigated, that IS a completed first action — record it as the
      // link-click it turned out to be, rather than measuring a page we did not
      // mean to be on.
      if (new URL(page.url()).pathname !== startPath) {
        return { action: "link-click", matchedSelector: `${toggle} (navigated)` };
      }
      hit = await findBox();
      if (hit) {
        revealedBy = toggle;
        break;
      }
    }
  }

  if (hit) {
    await hit.box.fill(PROBE_QUERY, { timeout: 5_000 });
    await hit.box.press("Enter", { timeout: 5_000 });
    return {
      action: "search-submit",
      matchedSelector: revealedBy ? `${hit.selector} (revealed by ${revealedBy})` : hit.selector,
    };
  }

  // No query affordance at all. Fall back to a same-origin link that actually
  // goes somewhere else — the smoke run clicked an in-page toggle on arxiv.org
  // and recorded a "completed" action that never left the page.
  const here = new URL(page.url());
  const links = page
    .locator(`a[href]:not([href^="#"]):not([href^="mailto:"]):not([href^="tel:"]):not([href^="javascript:"])`)
    .filter({ hasText: /\S/ });
  const n = Math.min(await links.count().catch(() => 0), 20);
  for (let i = 0; i < n; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href", { timeout: 2_000 }).catch(() => null);
    if (href === null) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, page.url());
    } catch {
      continue;
    }
    if (resolved.origin !== here.origin) continue;
    if (resolved.pathname === here.pathname) continue;
    if (!(await link.isVisible({ timeout: 1_000 }).catch(() => false))) continue;
    await link.click({ timeout: 8_000 }).catch(() => {});
    // A link-click only counts if it actually went somewhere. arxiv.org's
    // `/search` anchor opens an in-page overlay and never navigates; scoring
    // that as a completed action would mark the site reachable on the strength
    // of a click that did nothing. A search-submit is not held to this, because
    // typing a query and pressing Enter is itself the evidence and plenty of
    // real search UIs answer in place.
    await page.waitForURL((u) => u.pathname !== here.pathname, { timeout: 6_000 }).catch(() => {});
    if (new URL(page.url()).pathname === here.pathname) {
      return { action: "none", matchedSelector: `link-click to ${resolved.pathname} did not navigate` };
    }
    return { action: "link-click", matchedSelector: `a[href=${resolved.pathname}]` };
  }
  return { action: "none", matchedSelector: null };
}

/** Probe one site at one rung. Never throws — a failure is a recorded verdict. */
async function probeRung(
  context: BrowserContext,
  target: { site: string; url: string },
  rung: ProbeRung,
  shotDir: string,
): Promise<RungRecord> {
  const started = Date.now();
  const rec: RungRecord = {
    site: target.site,
    url: target.url,
    rung,
    loadVerdict: "error",
    actionVerdict: null,
    action: "none",
    detail: "",
    finalUrlAfterLoad: null,
    finalUrlAfterAction: null,
    loadStatus: null,
    actionStatus: null,
    matchedSelector: null,
    settleMs: null,
    settleEnd: null,
    actionSettleMs: null,
    pageShape: null,
    userAgent: null,
    ms: 0,
  };

  const page = await context.newPage();
  // Track main-frame document responses so the post-action status is real and
  // not inferred from the pre-action navigation.
  let lastDocStatus: number | null = null;
  page.on("response", (r) => {
    if (r.frame() === page.mainFrame() && r.request().resourceType() === "document") {
      lastDocStatus = r.status();
    }
  });

  try {
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    rec.loadStatus = response?.status() ?? lastDocStatus;
    const settled = await settlePage(page, SETTLE_CAP_MS);
    rec.settleMs = settled.ms;
    rec.settleEnd = settled.end;
    rec.userAgent = (await page.evaluate(() => navigator.userAgent).catch(() => null)) as string | null;
    rec.finalUrlAfterLoad = page.url();

    const loaded = await readPage(page);
    const loadClass = classify({
      httpStatus: rec.loadStatus,
      title: loaded.title,
      bodyText: loaded.bodyText,
      textChars: loaded.bodyText.length,
      interactiveCount: loaded.interactiveCount,
    });
    rec.loadVerdict = loadClass.verdict;
    rec.detail = `load: ${loadClass.detail}`;

    if (loadClass.verdict !== "ok") return rec;

    // Cleared BEFORE the action, not after: the smoke run submitted Allrecipes'
    // search, navigated to /search?q=blue, and then recorded a null status,
    // because the navigation response arrived while the action was still in
    // flight and the reset landed on top of it. classify() then fell back to the
    // pre-action status, which is exactly the stale reading this probe exists to
    // avoid.
    lastDocStatus = null;
    const acted = await takeFirstAction(page);
    rec.action = acted.action;
    rec.matchedSelector = acted.matchedSelector;
    if (acted.action === "none") {
      rec.detail += " | no generic first action available";
      return rec;
    }

    // A search submit usually navigates; an SPA may not. Wait for the document
    // if one arrives, then settle regardless — the smoke run saw Allrecipes
    // scored on a results page that had not finished rendering.
    await page.waitForLoadState("domcontentloaded", { timeout: ACTION_SETTLE_CAP_MS }).catch(() => {});
    rec.actionSettleMs = (await settlePage(page, ACTION_SETTLE_CAP_MS)).ms;
    rec.finalUrlAfterAction = page.url();
    rec.actionStatus = lastDocStatus;

    const after = await readPage(page);
    // Recorded, not classified. A page that collapses from thousands of
    // characters to a handful after one keystroke is worth a human look, but
    // inventing a verdict from it would change feat-002's pinned rules on a
    // hunch. The numbers and the screenshot are the evidence; the reader judges.
    rec.pageShape = {
      textCharsBefore: loaded.bodyText.length,
      textCharsAfter: after.bodyText.length,
      interactiveBefore: loaded.interactiveCount,
      interactiveAfter: after.interactiveCount,
    };
    const actionClass = classify({
      // A same-document (SPA) response produces no new navigation. Falling back
      // to the load status keeps a served page from being read as HTTP 0.
      httpStatus: rec.actionStatus ?? rec.loadStatus,
      title: after.title,
      bodyText: after.bodyText,
      textChars: after.bodyText.length,
      interactiveCount: after.interactiveCount,
    });
    rec.actionVerdict = actionClass.verdict;
    rec.detail += ` | ${acted.action}: ${actionClass.detail}`;

    const dir = `${shotDir}/${rung}`;
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${target.site}.png` }).catch(() => {});
  } catch (err) {
    rec.detail += ` | probe error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
    if (rec.loadVerdict === "ok") rec.actionVerdict = "error";
  } finally {
    rec.ms = Date.now() - started;
    await page.close().catch(() => {});
  }
  return rec;
}

/** Contexts differ only in the UA. Everything else is identical across rungs. */
async function makeContext(browser: Browser, userAgent: string | undefined): Promise<BrowserContext> {
  return browser.newContext({
    locale: LOCALE,
    timezoneId: TIMEZONE_ID,
    ...(userAgent ? { userAgent } : {}),
  });
}

/**
 * Run one rung over `todo`, with `width` workers each owning its own browser.
 *
 * **Each worker owns a browser and replaces it on any failure.** The first
 * attempt at this sweep shared one browser across all workers, exactly as
 * `check-reachability.ts` does for its serial loop but without that file's
 * `isConnected()` relaunch guard. Chromium died two sites in, and all 143
 * remaining sites then sat at their 90s deadline against a dead browser — an
 * eight-hour run producing nothing but `error`. `session-handoff.md` had flagged
 * this precise class ("the single real bug typecheck found was in the
 * browser-relaunch path — error recovery that no run had ever executed"), and it
 * fired on the first real run.
 *
 * The rule that follows: a browser that produced a failure is never reused. It
 * is closed and replaced, so one bad site cannot poison the rest of the sweep.
 */
async function runRung(
  todo: SiteRecord[],
  rung: ProbeRung,
  width: number,
  ua: string | undefined,
  shotDir: string,
  onResult: (rec: SiteRecord, attempt: RungRecord) => void,
): Promise<void> {
  const headless = rung !== "headed";
  /** Launch, bounded. Returns null rather than hanging or throwing. */
  const launch = async (): Promise<Browser | null> =>
    orAfter(LAUNCH_DEADLINE_MS, chromium.launch({ headless }), null);
  const shutDown = async (b: Browser | null) => {
    if (b) await orAfter(CLOSE_DEADLINE_MS, b.close(), undefined);
  };
  let cursor = 0;

  const worker = async () => {
    let browser: Browser | null = await launch();
    try {
      for (;;) {
        const i = cursor++;
        if (i >= todo.length) return;
        const rec = todo[i]!;

        let attempt: RungRecord;
        try {
          // A browser that died on the previous site must not cascade. Bounded,
          // because the unbounded version of this line is what hung the rung.
          if (!browser || !browser.isConnected()) {
            await shutDown(browser);
            browser = await launch();
          }
          if (!browser) throw new Error(`could not launch a browser within ${LAUNCH_DEADLINE_MS}ms`);
          attempt = await withDeadline(RUNG_DEADLINE_MS, async () => {
            const ctx = await makeContext(browser!, ua);
            try {
              return await probeRung(ctx, rec, rung, shotDir);
            } finally {
              await ctx.close().catch(() => {});
            }
          });
        } catch (err) {
          attempt = {
            site: rec.site, url: rec.url, rung, loadVerdict: "error", actionVerdict: null,
            action: "none",
            detail: `rung-level failure: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
            finalUrlAfterLoad: null, finalUrlAfterAction: null, loadStatus: null, actionStatus: null,
            matchedSelector: null, settleMs: null, settleEnd: null, actionSettleMs: null, pageShape: null,
            userAgent: null, ms: RUNG_DEADLINE_MS,
          };
          // The browser may itself be the reason, and a wedged one stays wedged.
          // Replace it rather than carrying it to the next site — both steps
          // bounded, so the recovery cannot become the hang.
          await shutDown(browser);
          browser = await launch();
        }
        onResult(rec, attempt);
      }
    } finally {
      await shutDown(browser);
    }
  };

  await Promise.all(Array.from({ length: Math.min(width, todo.length) }, worker));
}

const { concurrency, limit, only, source, outRun, outAudit, shotDir } = parseArgs();

/**
 * Log to stdout *and* to a progress file, flushed per line.
 *
 * Bun block-buffers stdout when it is redirected to a file, so a 20-minute
 * unattended run looks identical whether it is working or wedged — which is
 * exactly how the first attempt's dead browser went unnoticed. This costs one
 * small append per site and makes the run observable while it happens.
 */
mkdirSync("runs/feat-004", { recursive: true });
mkdirSync(shotDir, { recursive: true });
const PROGRESS = `${shotDir}-progress.log`;
writeFileSync(PROGRESS, "");
const say = (line: string) => {
  console.log(line);
  appendFileSync(PROGRESS, line + "\n");
};

const tasks = parseOm2wJson(readFileSync(source, "utf8"));
let targets = siteTargets(tasks);
if (only) targets = targets.filter((t) => only.includes(t.site));
if (limit) targets = targets.slice(0, limit);

say(`feat-004 first-action audit — ${tasks.length} tasks, ${targets.length} sites to probe`);
say(`Ladder: ${RUNG_ORDER.join(" -> ")}. Query typed at every site: "${PROBE_QUERY}".`);
say(`Locale ${LOCALE}, timezone ${TIMEZONE_ID}, no proxying.`);
say("Masking: the HeadlessChrome token only. No stealth plugin, no fingerprint patching.\n");

/** Discover the stock headless UA once, so the mask is derived and not invented. */
const uaProbe = await chromium.launch({ headless: true });
const uaCtx = await uaProbe.newContext();
const uaPage = await uaCtx.newPage();
const STOCK_HEADLESS_UA = (await uaPage.evaluate(() => navigator.userAgent)) as string;
const MASKED_UA = maskHeadlessUserAgent(STOCK_HEADLESS_UA);
await uaProbe.close();
say(`stock headless UA: ${STOCK_HEADLESS_UA}`);
say(`masked UA        : ${MASKED_UA}\n`);

const records = new Map<string, SiteRecord>();
for (const t of targets) {
  records.set(t.site, { site: t.site, url: t.url, taskCount: t.taskCount, attempts: [], resolved: {
    verdict: "error", passedAt: null, neededEscalation: false, detail: "not yet probed",
  } });
}

/**
 * Completed attempts are appended as they happen, and replayed on startup.
 *
 * A 145-site sweep is long enough that something will interrupt it — a hang, a
 * kill, a code fix — and without this every interruption costs the whole run
 * from scratch. Each line is one finished rung-attempt, so a restart re-probes
 * only what is genuinely missing. It also means a crashed sweep leaves its
 * partial evidence on disk instead of nothing, which is the same argument
 * AGENTS.md makes for traces.
 *
 * Delete `runs/feat-004/attempts.jsonl` to force a clean re-measurement.
 */
const ATTEMPTS = `${shotDir}/attempts.jsonl`;
let replayed = 0;
if (existsSync(ATTEMPTS)) {
  for (const line of readFileSync(ATTEMPTS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let a: RungRecord;
    try {
      a = JSON.parse(line) as RungRecord;
    } catch {
      continue; // a torn last line from a kill mid-write
    }
    const rec = records.get(a.site);
    if (!rec || rec.attempts.some((x) => x.rung === a.rung)) continue;
    rec.attempts.push(a);
    rec.resolved = resolveSiteVerdict(rec.attempts);
    replayed += 1;
  }
  say(`resumed: replayed ${replayed} completed attempt(s) from ${ATTEMPTS}`);
}

/**
 * Sites that still need the next rung.
 *
 * Only verdicts a more permissive rung could actually *change the exclusion
 * decision* for: `blocked`, `degraded`, `error`. Deliberately **not**
 * `no-action` — such a site already loaded successfully at this rung, so it is
 * not blocked and will not be excluded, and no amount of extra permissiveness
 * can make it more blocked. Escalating it would spend the slowest rung's budget
 * on sites whose answer cannot move.
 *
 * The cost, stated rather than hidden: a site recorded `no-action` might expose
 * a search affordance under a headed browser that the headless one did not
 * render, so the published `no-action` count is an upper bound on "sites this
 * probe could not exercise", not a claim that they have no search box. It does
 * not affect the blocked list, which is the number the scored set depends on.
 */
function pending(): SiteRecord[] {
  return [...records.values()].filter(
    (r) => r.resolved.verdict === "blocked" || r.resolved.verdict === "degraded" || r.resolved.verdict === "error",
  );
}

for (const rung of RUNG_ORDER) {
  const candidates = rung === RUNG_ORDER[0] ? [...records.values()] : pending();
  // Never re-probe a site that already has a recorded attempt at this rung.
  const todo = candidates.filter((r) => !r.attempts.some((a) => a.rung === rung));
  const skipped = candidates.length - todo.length;
  if (todo.length === 0) {
    if (skipped) say(`\n=== rung ${rung} — all ${skipped} site(s) already recorded, skipping ===`);
    continue;
  }

  const headless = rung !== "headed";
  const width = headless ? concurrency : Math.min(HEADED_CONCURRENCY, concurrency);
  const ua = rung === "headless-masked" ? MASKED_UA : undefined;

  say(`\n=== rung ${rung} — ${todo.length} sites, concurrency ${width}${skipped ? `, ${skipped} already recorded` : ""} ===`);
  let done = 0;
  await runRung(todo, rung, width, ua, shotDir, (rec, attempt) => {
    appendFileSync(ATTEMPTS, JSON.stringify(attempt) + "\n");
    rec.attempts.push(attempt);
    rec.resolved = resolveSiteVerdict(rec.attempts);
    const flag = { ok: "OK       ", blocked: "BLOCKED  ", degraded: "DEGRADED ", error: "ERROR    ", "no-action": "NO-ACTION" }[
      rec.resolved.verdict
    ];
    done += 1;
    say(
      `${flag} [${String(done).padStart(3)}/${todo.length}] ${rec.site.padEnd(28)} ` +
        `${String(attempt.ms).padStart(6)}ms  ${attempt.detail.slice(0, 110)}`,
    );
  });
}

const all = [...records.values()];
mkdirSync("runs/feat-004", { recursive: true });
writeFileSync(outRun, JSON.stringify(all, null, 2) + "\n");

const count = (v: string) => all.filter((r) => r.resolved.verdict === v).length;
const tasksOn = (pred: (r: SiteRecord) => boolean) =>
  all.filter(pred).reduce((n, r) => n + r.taskCount, 0);

const audit = {
  feature: "feat-004",
  date: new Date().toISOString().slice(0, 10),
  source,
  totalTasks: tasks.length,
  sitesProbed: all.length,
  method:
    `One completed first action per site, not a goto. Escalation ladder ${RUNG_ORDER.join(" -> ")}, ` +
    `stopping at the first rung where an action completed; a site is blocked only if every rung refused it. ` +
    `Generic selectors only, query "${PROBE_QUERY}" typed unchanged at every site. ` +
    `Locale ${LOCALE}, timezone ${TIMEZONE_ID}, no proxying. Masking is the HeadlessChrome token and nothing else.`,
  stockHeadlessUserAgent: STOCK_HEADLESS_UA,
  maskedUserAgent: MASKED_UA,
  counts: {
    ok: count("ok"),
    blocked: count("blocked"),
    degraded: count("degraded"),
    "no-action": count("no-action"),
    error: count("error"),
  },
  tasksOnBlockedSites: tasksOn((r) => r.resolved.verdict === "blocked"),
  sitesNeedingEscalation: all.filter((r) => r.resolved.neededEscalation).map((r) => ({
    site: r.site,
    passedAt: r.resolved.passedAt,
  })),
  sites: all.map((r) => ({
    site: r.site,
    url: r.url,
    taskCount: r.taskCount,
    verdict: r.resolved.verdict,
    passedAt: r.resolved.passedAt,
    action: r.attempts.find((a) => a.rung === r.resolved.passedAt)?.action ?? null,
    detail: r.resolved.detail,
  })),
};
writeFileSync(outAudit, JSON.stringify(audit, null, 2) + "\n");

console.log("\n=== summary ===");
console.log(
  `ok=${audit.counts.ok} blocked=${audit.counts.blocked} degraded=${audit.counts.degraded} ` +
    `no-action=${audit.counts["no-action"]} error=${audit.counts.error}  (of ${all.length} sites)`,
);
console.log(`tasks on blocked sites: ${audit.tasksOnBlockedSites} of ${tasks.length}`);
console.log(`sites that needed escalation past ${RUNG_ORDER[0]}: ${audit.sitesNeedingEscalation.length}`);
console.log(`\nWrote ${outRun} and ${outAudit}`);
