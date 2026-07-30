/**
 * feat-002 — Site reachability audit.
 *
 * Loads each WebVoyager start URL in stock Playwright Chromium, headless and
 * headed, and records what came back. The point is to find out which sites
 * refuse automated access *before* the benchmark denominator depends on it.
 *
 * NO EVASION. No stealth plugin, no UA override, no fingerprint patching, no
 * CAPTCHA handling. The user agent is whatever the browser build sends, and it
 * is recorded per mode so the headless/headed comparison stays honest — the
 * headless shell announces itself as HeadlessChrome and that is part of the
 * finding, not something to hide. A blocked site is a result.
 *
 * Block detection is generic: HTTP status plus a set of phrases that any
 * interstitial uses. There is no per-domain branch anywhere in this file. The
 * verdict rules themselves live in `lib/classify.ts` so they can be tested
 * without a browser; this file is the driving shell.
 *
 * Run: bun run scripts/check-reachability.ts [--mode=headless|headed|both] [--only=github,amazon]
 * Writes: runs/feat-002/<mode>/<site>.png and runs/feat-002/results.json
 */
import { chromium, type Browser, type Page } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { classify, type Verdict } from "./lib/classify.ts";

/** The 15 WebVoyager sites, with the start URL the benchmark uses. */
const SITES: { id: string; name: string; url: string; tier: "easy" | "hard" }[] = [
  { id: "cambridge", name: "Cambridge Dictionary", url: "https://dictionary.cambridge.org/", tier: "easy" },
  { id: "arxiv", name: "ArXiv", url: "https://arxiv.org/", tier: "easy" },
  { id: "github", name: "GitHub", url: "https://github.com/", tier: "easy" },
  { id: "huggingface", name: "Hugging Face", url: "https://huggingface.co/", tier: "easy" },
  { id: "wolfram", name: "Wolfram Alpha", url: "https://www.wolframalpha.com/", tier: "easy" },
  { id: "allrecipes", name: "Allrecipes", url: "https://www.allrecipes.com/", tier: "easy" },
  { id: "apple", name: "Apple", url: "https://www.apple.com/", tier: "easy" },
  { id: "bbc", name: "BBC News", url: "https://www.bbc.com/news", tier: "easy" },
  { id: "coursera", name: "Coursera", url: "https://www.coursera.org/", tier: "easy" },
  { id: "espn", name: "ESPN", url: "https://www.espn.com/", tier: "easy" },
  { id: "google-search", name: "Google Search", url: "https://www.google.com/", tier: "hard" },
  { id: "google-maps", name: "Google Maps", url: "https://www.google.com/maps/", tier: "hard" },
  { id: "google-flights", name: "Google Flights", url: "https://www.google.com/travel/flights", tier: "hard" },
  { id: "amazon", name: "Amazon", url: "https://www.amazon.com/", tier: "hard" },
  { id: "booking", name: "Booking.com", url: "https://www.booking.com/", tier: "hard" },
];

const NAV_TIMEOUT_MS = 45_000;
/** Time to let client-side interstitials render after DOMContentLoaded. */
const SETTLE_MS = 4_000;
/**
 * Hard wall-clock cap per site. Playwright's own timeouts do not cover every
 * hang — a headed Chromium that never finishes creating a window will sit in
 * `newContext()` forever. Observed in practice, hence this backstop.
 */
const SITE_DEADLINE_MS = 120_000;

interface Result {
  site: string;
  name: string;
  tier: string;
  mode: string;
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  title: string | null;
  loadMs: number;
  textChars: number;
  interactiveCount: number | null;
  matchedPhrases: string[];
  verdict: Verdict;
  detail: string;
  screenshot: string | null;
  userAgent: string | null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  const modeArg = get("mode") ?? "both";
  const modes = modeArg === "both" ? (["headless", "headed"] as const) : ([modeArg] as const);
  const only = get("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  return { modes: modes as readonly ("headless" | "headed")[], only };
}

/** Reject if `work` has not settled within `ms`. The caller kills the browser. */
function withDeadline<T>(ms: number, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`site deadline of ${ms}ms exceeded`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function probe(page: Page, site: (typeof SITES)[number], mode: string): Promise<Result> {
  const base: Result = {
    site: site.id,
    name: site.name,
    tier: site.tier,
    mode,
    url: site.url,
    finalUrl: null,
    httpStatus: null,
    title: null,
    loadMs: 0,
    textChars: 0,
    interactiveCount: null,
    matchedPhrases: [],
    verdict: "error",
    detail: "",
    screenshot: null,
    userAgent: null,
  };

  const started = Date.now();
  try {
    const response = await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    base.httpStatus = response?.status() ?? null;
    await page.waitForTimeout(SETTLE_MS);
    base.loadMs = Date.now() - started;
  } catch (err) {
    base.loadMs = Date.now() - started;
    base.verdict = "error";
    base.detail = err instanceof Error ? `${err.name}: ${err.message.split("\n")[0]}` : String(err);
    return base;
  }

  base.userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null);
  base.finalUrl = page.url();
  base.title = await page.title().catch(() => null);

  const bodyText = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")) as string;
  base.textChars = bodyText.length;
  // A rough "is there anything to act on" count. Not a serializer — feat-006 owns that.
  base.interactiveCount = await page
    .evaluate(() => document.querySelectorAll("a[href], button, input, select, textarea, [role=button]").length)
    .catch(() => null);

  const { verdict, detail, matchedPhrases } = classify({
    httpStatus: base.httpStatus,
    title: base.title,
    bodyText,
    textChars: base.textChars,
    interactiveCount: base.interactiveCount,
  });
  base.verdict = verdict;
  base.detail = detail;
  base.matchedPhrases = matchedPhrases;

  const dir = `runs/feat-002/${mode}`;
  mkdirSync(dir, { recursive: true });
  const shot = `${dir}/${site.id}.png`;
  await page.screenshot({ path: shot }).catch(() => {});
  base.screenshot = shot;

  return base;
}

async function runMode(mode: "headless" | "headed", sites: typeof SITES): Promise<Result[]> {
  const results: Result[] = [];
  const launch = (): Promise<Browser> => chromium.launch({ headless: mode === "headless" });

  // Assigned at each call site rather than from inside `launch` so that the
  // handle is never nullable: a relaunch replaces it, it is never absent.
  let browser: Browser = await launch();
  console.log(`\n=== ${mode} — Chromium ${browser.version()} ===`);
  try {
    for (const site of sites) {
      let result: Result;
      try {
        // A dead browser from the previous site must not cascade.
        if (!browser.isConnected()) browser = await launch();
        result = await withDeadline(SITE_DEADLINE_MS, async () => {
          // Fresh context per site: no shared cookies, no warmed-up reputation.
          const context = await browser.newContext();
          const page = await context.newPage();
          const r = await probe(page, site, mode);
          await context.close();
          return r;
        });
      } catch (err) {
        // Chromium itself can die on a challenge page. That is a finding, not a
        // crash to route around — record it and relaunch for the next site.
        result = {
          site: site.id, name: site.name, tier: site.tier, mode, url: site.url,
          finalUrl: null, httpStatus: null, title: null, loadMs: 0, textChars: 0,
          interactiveCount: null, matchedPhrases: [], verdict: "error",
          detail: `browser-level failure: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
          screenshot: null, userAgent: null,
        };
        try { await browser.close(); } catch { /* already gone */ }
        browser = await launch();
      }
      results.push(result);
      const flag = { ok: "OK      ", blocked: "BLOCKED ", degraded: "DEGRADED", error: "ERROR   " }[result.verdict];
      console.log(`${flag} ${result.name.padEnd(20)} ${String(result.loadMs).padStart(6)}ms  ${result.detail}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

const { modes, only } = parseArgs();
const sites = only ? SITES.filter((s) => only.includes(s.id)) : SITES;

console.log(`feat-002 site reachability — ${sites.length} sites, modes: ${modes.join(", ")}`);
console.log("No evasion tooling: stock Chromium, stock user agent, no stealth patches.\n");

const all: Result[] = [];
for (const mode of modes) {
  all.push(...(await runMode(mode, sites)));
}

// Merge into any previous run so a partial `--only` pass does not erase the rest.
mkdirSync("runs/feat-002", { recursive: true });
const RESULTS_PATH = "runs/feat-002/results.json";
const merged = new Map<string, Result>();
if (existsSync(RESULTS_PATH)) {
  try {
    for (const r of JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as Result[]) {
      merged.set(`${r.mode}:${r.site}`, r);
    }
  } catch {
    console.warn("existing results.json unreadable — starting fresh");
  }
}
for (const r of all) merged.set(`${r.mode}:${r.site}`, r);
writeFileSync(RESULTS_PATH, JSON.stringify([...merged.values()], null, 2) + "\n");

console.log("\n=== summary ===");
for (const mode of modes) {
  const rows = all.filter((r) => r.mode === mode);
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  console.log(
    `${mode.padEnd(9)} ok=${count("ok")} blocked=${count("blocked")} degraded=${count("degraded")} error=${count("error")}`,
  );
  const ua = rows.find((r) => r.userAgent)?.userAgent;
  if (ua) console.log(`${" ".repeat(10)}UA: ${ua}`);
}
console.log("\nWrote runs/feat-002/results.json and per-site screenshots.");
