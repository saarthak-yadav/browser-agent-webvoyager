/**
 * feat-005 acceptance — one scripted sequence, run unchanged against two or more
 * sites, completing a search on each.
 *
 * The check in `docs/TASKS.md` is "a scripted sequence completes a search on two
 * different sites using the same code path". The interesting word is *same*: it
 * is easy to write two site-shaped scripts and call the driver generic. So the
 * sites are **arguments, not literals** — this file contains no hostname at all,
 * and `tests/actions.test.ts` enforces that by grepping its source. Swapping in
 * two other sites is a command-line change, which is the strongest available
 * evidence that the path does not know where it is.
 *
 * The sequence exercises all seven actions in order:
 *
 *   navigate -> wait -> [click to reveal search, if needed] -> type + submit
 *            -> scroll -> click a result -> back -> answer
 *
 * Element choices are made from the driver's numbered snapshot using generic
 * predicates (is it editable, does its accessible name or role read as search),
 * exactly the way the model will choose in feat-009 — never from a selector
 * written for a particular page.
 *
 * Run:
 *   bun run scripts/search-two-sites.ts --site=<url> --site=<url> [--query=blue]
 *                                       [--headed] [--no-mask]
 * Writes: runs/feat-005/result.json and runs/feat-005/site-N/*.png
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { classify } from "./lib/classify.ts";
import { describeAction, type Action, type ActionResult } from "./lib/actions.ts";
import { Driver, type ElementRef } from "./lib/driver.ts";
import { PROBE_QUERY } from "./lib/first-action.ts";

function parseArgs() {
  const argv = process.argv.slice(2);
  const many = (k: string) =>
    argv.filter((a) => a.startsWith(`--${k}=`)).map((a) => a.slice(k.length + 3)).filter(Boolean);
  const one = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const sites = [...many("site"), ...(one("sites")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])];
  if (sites.length < 2) {
    throw new Error(
      "need at least two --site=<url> arguments: the check is two DIFFERENT sites through the same code path",
    );
  }
  return {
    sites,
    // feat-004's probe query, reused for the same reasons: one fixed, innocuous,
    // high-recall word, typed unchanged everywhere. Varying it per site would be
    // site-specific handling wearing a different hat.
    query: one("query") ?? PROBE_QUERY,
    headless: !argv.includes("--headed"),
    maskHeadless: !argv.includes("--no-mask"),
  };
}

/** Reads as a place to type a query: editable, and named or roled like search. */
function looksLikeSearchField(e: ElementRef): boolean {
  if (!e.editable) return false;
  if (e.role === "searchbox") return true;
  return /search|query|find|look ?up/i.test(`${e.name} ${e.role}`);
}

/** Reads as a control that reveals a hidden search field. */
function looksLikeSearchToggle(e: ElementRef): boolean {
  if (e.editable) return false;
  return /search/i.test(`${e.name} ${e.role}`);
}

/**
 * Pick the field to type into.
 *
 * Prefer an explicitly search-shaped field; fall back to the first editable one
 * on the page. The fallback matters because plenty of sites label their search
 * box with nothing but an icon, and a predicate that only accepts a labelled
 * field would quietly measure "sites with good labels" instead of the driver.
 */
function pickSearchField(elements: ElementRef[]): ElementRef | null {
  return (
    elements.find((e) => looksLikeSearchField(e) && e.inViewport) ??
    elements.find((e) => looksLikeSearchField(e)) ??
    elements.find((e) => e.editable && e.inViewport) ??
    elements.find((e) => e.editable) ??
    null
  );
}

/** A result worth clicking: a link with a real name, on screen, not an anchor. */
function pickResultLink(elements: ElementRef[]): ElementRef | null {
  return (
    elements.find((e) => (e.role === "link" || e.tag === "a") && e.inViewport && e.name.trim().length >= 12) ?? null
  );
}

interface StepRecord {
  step: number;
  action: string;
  ok: boolean;
  failure: string | null;
  detail: string;
  ms: number;
  urlAfter: string;
  httpStatus: number | null;
  /** Structured per-action facts. Diagnosing a run from prose does not work. */
  evidence: Record<string, string | number | boolean | null>;
}

interface SiteRecord {
  index: number;
  startUrl: string;
  query: string;
  searchCompleted: boolean;
  searchEvidence: string;
  actionsUsed: string[];
  steps: StepRecord[];
}

const { sites, query, headless, maskHeadless } = parseArgs();

mkdirSync("runs/feat-005", { recursive: true });

/**
 * Log to stdout *and* to a file, flushed per line.
 *
 * Bun block-buffers stdout when it is redirected, so an unattended run looks
 * identical whether it is working or wedged — which is exactly how the first
 * attempt at this run went unnoticed for nine minutes. The "starting" line
 * before each action is what makes a hang name itself.
 */
const PROGRESS = "runs/feat-005/progress.log";
writeFileSync(PROGRESS, "");
const say = (line: string) => {
  console.log(line);
  appendFileSync(PROGRESS, line + "\n");
};

/**
 * The sequence. One function, called once per site, with nothing in it that can
 * tell the sites apart.
 */
async function runSite(index: number, startUrl: string): Promise<SiteRecord> {
  const shotDir = `runs/feat-005/site-${index}`;
  mkdirSync(shotDir, { recursive: true });

  const driver = await Driver.launch({ headless, maskHeadless });
  const steps: StepRecord[] = [];
  const used = new Set<string>();
  let stepNo = 0;

  const run = async (action: Action): Promise<ActionResult> => {
    say(`  ->   [${String(stepNo + 1).padStart(2)}] ${describeAction(action)}`);
    const result = await driver.execute(action);
    stepNo += 1;
    used.add(action.kind);
    steps.push({
      step: stepNo,
      action: describeAction(action),
      ok: result.ok,
      failure: result.failure,
      detail: result.detail,
      ms: result.ms,
      urlAfter: result.urlAfter,
      httpStatus: result.httpStatus,
      evidence: result.evidence,
    });
    const flag = result.ok ? "ok  " : "FAIL";
    say(
      `  ${flag} [${String(stepNo).padStart(2)}] ${describeAction(action).slice(0, 64).padEnd(64)} ` +
        `${String(result.ms).padStart(6)}ms  ${result.detail.slice(0, 92)}`,
    );
    return result;
  };

  let searchCompleted = false;
  let searchEvidence = "search was never submitted";

  try {
    say(`\n=== site ${index}: ${startUrl} ===`);
    if (index === 1) {
      say(
        `  config: headless=${driver.config.headless} maskHeadless=${driver.config.maskHeadless} ` +
          `locale=${driver.config.locale} tz=${driver.config.timezoneId} proxied=${driver.config.proxied}`,
      );
      say(`  stock UA    : ${driver.config.stockUserAgent}`);
      say(`  effective UA: ${driver.config.effectiveUserAgent}`);
    }

    await run({ kind: "navigate", url: startUrl });
    await run({ kind: "wait" });

    let elements = await driver.snapshot();
    let field = pickSearchField(elements);

    // No visible field: the site keeps its search behind a disclosure control.
    // That is a whole genre, not a site, so the recovery is one generic step —
    // click the control, re-observe, look again.
    if (!field) {
      const toggle = elements.find(looksLikeSearchToggle);
      if (toggle) {
        say(`  (no search field in snapshot ${driver.currentSnapshot()}; clicking #${toggle.id} ${JSON.stringify(toggle.name)})`);
        await run({ kind: "click", id: toggle.id });
        await run({ kind: "wait" });
        elements = await driver.snapshot();
        field = pickSearchField(elements);
      }
    }

    if (!field) {
      searchEvidence = `no editable field found in ${elements.length} snapshotted elements`;
    } else {
      say(`  search field: #${field.id} <${field.tag}> role=${field.role} name=${JSON.stringify(field.name)}`);
      const typed = await run({ kind: "type", id: field.id, text: query, submit: true });
      await driver.activePage().screenshot({ path: `${shotDir}/after-search.png` }).catch(() => {});

      // "Completed a search" has to mean something checkable. Three conditions,
      // all generic: the page that came back is not a block wall, and the query
      // shows up either in the URL or in the text of the page.
      const page = driver.activePage();
      const bodyText = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")) as string;
      const title = await page.title().catch(() => null);
      const interactiveCount = await page
        .evaluate(() => document.querySelectorAll("a[href], button, input, select, textarea, [role=button]").length)
        .catch(() => null);
      const verdict = classify({
        httpStatus: typed.httpStatus,
        title,
        bodyText,
        textChars: bodyText.length,
        interactiveCount,
      });
      const inUrl = decodeURIComponent(page.url()).toLowerCase().includes(query.toLowerCase());
      const inText = bodyText.toLowerCase().includes(query.toLowerCase());
      searchCompleted = typed.ok && verdict.verdict === "ok" && (inUrl || inText);
      searchEvidence =
        `verdict=${verdict.verdict}, query in url=${inUrl}, query in text=${inText}, ` +
        `url=${page.url().slice(0, 120)}, ${bodyText.length} chars, ${interactiveCount} interactive`;
      say(`  search ${searchCompleted ? "COMPLETED" : "NOT COMPLETED"}: ${searchEvidence}`);
    }

    // The remaining actions, on whatever page the search produced.
    await run({ kind: "scroll", target: { by: "direction", direction: "down" } });

    const resultElements = await driver.snapshot();
    const link = pickResultLink(resultElements);
    if (link) {
      say(`  result link : #${link.id} ${JSON.stringify(link.name.slice(0, 60))}`);
      await run({ kind: "click", id: link.id });

      // Re-observe before naming an element again. Ids belong to one snapshot,
      // and a click that navigates drops the registry — the first version of
      // this script skipped this and asked for `#1` on the page it had just
      // arrived at. The driver refused it with "snapshot() has not run since the
      // last navigation", which is the contract working: the mistake surfaced
      // as a named failure instead of scrolling to whatever now sits at index 1.
      const landed = await driver.snapshot();
      const last = landed[landed.length - 1];
      if (last) await run({ kind: "scroll", target: { by: "element", id: last.id } });
      await run({ kind: "back" });
    } else {
      say("  (no result link on screen; exercising back on the search page itself)");
      await run({ kind: "back" });
    }

    await driver.activePage().screenshot({ path: `${shotDir}/final.png` }).catch(() => {});
    await run({ kind: "answer", text: `searched for ${JSON.stringify(query)} on site ${index}` });
  } finally {
    await driver.close();
  }

  return {
    index,
    startUrl,
    query,
    searchCompleted,
    searchEvidence,
    actionsUsed: [...used].sort(),
    steps,
  };
}

say("feat-005 — one scripted sequence, two or more sites, same code path");
say(`sites: ${sites.join("  ")}`);
say(`query typed unchanged everywhere: ${JSON.stringify(query)}`);

const records: SiteRecord[] = [];
for (const [i, site] of sites.entries()) {
  records.push(await runSite(i + 1, site));
}

const allActions = [...new Set(records.flatMap((r) => r.actionsUsed))].sort();
const passed = records.filter((r) => r.searchCompleted).length;

writeFileSync(
  "runs/feat-005/result.json",
  JSON.stringify(
    { feature: "feat-005", date: new Date().toISOString().slice(0, 10), query, headless, maskHeadless, records },
    null,
    2,
  ) + "\n",
);

say("\n=== summary ===");
for (const r of records) {
  const failures = r.steps.filter((s) => !s.ok);
  say(
    `site ${r.index}  search=${r.searchCompleted ? "COMPLETED" : "FAILED"}  ` +
      `steps=${r.steps.length} failed=${failures.length}  actions=${r.actionsUsed.join(",")}  ${r.startUrl}`,
  );
}
say(`\nsearch completed on ${passed}/${records.length} sites; actions exercised: ${allActions.join(", ")}`);
say("Wrote runs/feat-005/result.json");

// Two sites is the acceptance bar; all seven actions having run is the feature.
const ok = passed >= 2 && allActions.length === 7;
say(ok ? "\nPASS" : "\nFAIL");
process.exit(ok ? 0 : 1);
