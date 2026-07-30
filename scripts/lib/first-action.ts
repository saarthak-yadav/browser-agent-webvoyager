/**
 * feat-004 — first-action probe logic, as pure functions.
 *
 * feat-003's most transferable finding: **a site that loads is not a site that
 * works.** Google Search returned a clean landing page and then answered the
 * first real query with `/sorry/index`. feat-002 probed a `goto` and would have
 * scored it reachable. So the feat-004 audit probes a *completed action* and
 * classifies the page that comes back from it.
 *
 * Split out of `scripts/check-first-action.ts` so the selector ladder, the
 * user-agent mask and the escalation rule can be tested without a browser.
 *
 * NO SITE-SPECIFIC CODE. Every selector below is a standard HTML role, type or
 * conventional attribute value used by thousands of unrelated sites. There is no
 * hostname branch here and there must never be one. `input[name="q"]` is a
 * cross-site naming convention, not a per-domain rule: it is applied uniformly
 * and no site is exempted from or singled out by it.
 *
 * Evasion: the only thing masked is the `HeadlessChrome` token, per the
 * 2026-07-30 policy amendment in AGENTS.md. Nothing else about the browser is
 * altered — see `maskHeadlessUserAgent`.
 */

/**
 * Generic ways a page offers a primary text query, most specific first.
 *
 * Ordered so that an explicit search affordance wins over a guess. The later
 * entries are deliberately weaker and the matched selector is recorded per site,
 * so a reader can discount a probe that only found a heuristic match.
 *
 * `textarea` is in here because the smoke run found google.com scoring
 * `no-action`: its search box has been a `textarea[name="q"]`, not an `input`,
 * for years. An input-only ladder silently failed to probe the single site this
 * whole feature exists to catch — a probe that cannot reach the known-hard case
 * measures nothing.
 */
export const SEARCH_SELECTORS = [
  'input[type="search"]',
  'textarea[name="q"]',
  '[role="searchbox"]',
  'input[name="q"]',
  'input[name="query"]',
  'input[name="search"]',
  'textarea[role="combobox"]',
  'form[role="search"] input[type="text"]',
  'form[role="search"] textarea',
  'input[type="text"][placeholder*="search" i]',
  'input[type="text"][aria-label*="search" i]',
  'textarea[aria-label*="search" i]',
];

/**
 * How many matches of one selector to try before moving on.
 *
 * `.first()` alone was not enough: pages carry hidden or off-screen duplicates
 * of their search form (a mobile variant, a collapsed header). Allrecipes' first
 * `input[name="q"]` in DOM order is hidden and the second is the real one.
 */
export const MAX_CANDIDATES_PER_SELECTOR = 4;

/**
 * Controls that reveal a hidden search field, by accessible name.
 *
 * A very common pattern, and one the smoke run hit immediately: arxiv.org keeps
 * its `input[name="query"]` inside a `display:none` overlay behind a search
 * toggle, so a selector-only scan finds nothing usable and the probe drops to
 * the weaker link-click fallback. Sites like that would be audited on a weaker
 * action than sites that show their search box, which is a bias in the audit,
 * not just a missed opportunity.
 *
 * Led by the standard ARIA disclosure pattern — `aria-expanded="false"` plus an
 * `aria-controls` pointing at something search-shaped — because that is what the
 * markup is *for*, and it is what assistive tech reads. arxiv.org's real toggle
 * is `<a id="arxiv-search-toggle" href="https://arxiv.org/search"
 * aria-controls="arxiv-search-overlay" aria-expanded="false">`: text matching
 * alone finds it only by luck, since the same page carries a dozen category
 * links whose text is also "search".
 *
 * Matched on ARIA state and accessible name, never on a hostname.
 *
 * A toggle may or may not navigate — arxiv's carries an `href` that its own JS
 * suppresses. The caller handles both outcomes explicitly rather than trying to
 * pick only non-navigating controls: if the click navigated, that is itself a
 * completed first action and is recorded as a link-click; if it did not, the
 * selector ladder is rescanned for the field it revealed.
 */
export const SEARCH_TOGGLES = [
  '[aria-expanded="false"][aria-controls*="search" i]',
  '[aria-expanded="false"][aria-label*="search" i]',
  'button[aria-label*="search" i]',
  '[role="button"][aria-label*="search" i]',
  'button[title*="search" i]',
  'button:has-text("search")',
  'a:not([href]):has-text("search")',
  'a[href^="#"]:has-text("search")',
];

/**
 * The query typed into every site, unchanged.
 *
 * One fixed, innocuous, high-recall word. Fixed because varying it per site
 * would be site-specific handling; innocuous because the probe should not look
 * like an attack; high-recall because a zero-result page is harder to tell apart
 * from a refusal than a page of hits.
 */
export const PROBE_QUERY = "blue";

/** What the probe actually managed to do on the page. */
export type ProbeAction = "search-submit" | "link-click" | "none";

/** How the browser was configured for one rung of the escalation ladder. */
export type ProbeRung = "headless-masked" | "headless-stock" | "headed";

/** The ladder, in the order it is climbed. */
export const RUNG_ORDER: ProbeRung[] = ["headless-masked", "headless-stock", "headed"];

/**
 * Drop the `HeadlessChrome` token from a user-agent string, and change nothing
 * else.
 *
 * This is the entire extent of the masking permitted by the 2026-07-30 evasion
 * amendment. The version number is left exactly as the browser reported it —
 * substituting a headed build's version would be fabricating a different client,
 * which is the line the amendment does not move. Returns the input unchanged if
 * there is no token to drop, so callers can apply it unconditionally.
 */
export function maskHeadlessUserAgent(userAgent: string): string {
  return userAgent.replace(/HeadlessChrome\//g, "Chrome/");
}

/** Whether a UA string still announces itself as headless. */
export function announcesHeadless(userAgent: string): boolean {
  return /HeadlessChrome/.test(userAgent);
}

/**
 * When a page counts as "finished rendering", as a pure state machine.
 *
 * Split out and tested because the first version of this rule silently
 * corrupted a full 145-site sweep. It accepted "visible text length unchanged
 * across two polls, document `complete`" as settled — which an SPA shell
 * satisfies **instantly at zero characters**, before its app has rendered
 * anything. amazon.com, booking.com, imdb.com, airbnb.com and three others
 * settled in ~610ms with `0 chars of text, 0 interactive elements` and were
 * classified `degraded`, a verdict feat-002 directly contradicts.
 *
 * Two rules fix it, and both are load-bearing:
 *
 * 1. **Zero-length text is never stable.** An empty body is not a rendered page;
 *    it is a page that has not started. Keep waiting.
 * 2. **A floor before stability may be accepted at all.** Content that arrives
 *    in one burst looks stable the instant it lands, and progressive renderers
 *    (google.com was measured at 54 of its ~187 characters after 1.6s) need to
 *    be given the chance to keep going.
 *
 * A page that never stabilises falls through to the caller's cap, which is the
 * old fixed-sleep behaviour and no worse.
 */
export const SETTLE_POLL_MS = 400;
/** Consecutive unchanged polls required before a page counts as settled. */
export const SETTLE_STABLE_POLLS = 3;
/** No page is declared settled before this, however quiet it looks. */
export const SETTLE_FLOOR_MS = 2_000;

export interface SettleSample {
  /** Length of the visible body text. */
  len: number;
  /** `document.readyState`. */
  ready: string;
}

export interface SettleState {
  previous: number;
  stable: number;
}

export const initialSettleState: SettleState = { previous: -1, stable: 0 };

/** Fold one poll into the settle state. `done` means stop waiting. */
export function stepSettle(
  state: SettleState,
  sample: SettleSample,
  elapsedMs: number,
): { state: SettleState; done: boolean } {
  // Rule 1: an empty body is not a rendered page, whatever readyState claims.
  const couldBeStable = sample.ready === "complete" && sample.len > 0 && sample.len === state.previous;
  if (!couldBeStable) {
    return { state: { previous: sample.len, stable: 0 }, done: false };
  }
  const stable = state.stable + 1;
  // Rule 2: never settle before the floor, however quiet the page looks.
  const done = stable >= SETTLE_STABLE_POLLS && elapsedMs >= SETTLE_FLOOR_MS;
  return { state: { previous: sample.len, stable }, done };
}

import type { Verdict } from "./classify.ts";

/** One rung of the ladder, as recorded by the driving script. */
export interface ProbeAttempt {
  rung: ProbeRung;
  /** Verdict of the landing page, before any action was taken. */
  loadVerdict: Verdict;
  /** Verdict of the page that came back after the action, or null if none ran. */
  actionVerdict: Verdict | null;
  action: ProbeAction;
  detail: string;
}

export interface SiteVerdict {
  /**
   * `ok`        — a first action completed and the resulting page was served.
   * `blocked`   — refused at every rung.
   * `degraded`  — served, but the page came back thin or self-declared broken.
   * `no-action` — loaded fine at some rung, but the probe found no generic
   *               action to take. NOT a block: an unprobed site, and it is
   *               reported as its own category so it cannot be quietly counted
   *               as either reachable or blocked.
   * `error`     — the probe itself failed (timeout, browser death).
   */
  verdict: Verdict | "no-action";
  /** The rung that produced `ok`, or null if none did. */
  passedAt: ProbeRung | null;
  /** True when the site needed more than the masked-headless rung. */
  neededEscalation: boolean;
  detail: string;
}

/**
 * Resolve one site's verdict from its ladder of attempts.
 *
 * A site counts as blocked only when **every** rung refused it — the same
 * standard feat-002 used to separate Cambridge Dictionary (403 in both modes,
 * a real block) from Allrecipes (402 headless, 200 headed, a mode artefact).
 * Getting this wrong inflates the published exclusion count, which is a number
 * this project promises to stand behind.
 *
 * `loadVerdict` losing to `actionVerdict` is the whole point of the feature: a
 * rung where the page loaded `ok` and the action came back `blocked` is a
 * blocked rung, not an ok one.
 *
 * When nothing passed, the answer is the **last rung that actually observed
 * something**, not simply the last rung tried. `error` means the probe failed —
 * a timeout, a dead browser — so it is not an observation and must not erase
 * one. The smoke run produced exactly this: Cambridge Dictionary returned a
 * clean 403 interstitial at both headless rungs and then hung the headed rung
 * past its deadline, and taking the last rung verbatim reported the site as
 * `error` when two solid observations said `blocked`. That would have quietly
 * moved a site out of the published exclusion list on the strength of a hang.
 */
export function resolveSiteVerdict(attempts: ProbeAttempt[]): SiteVerdict {
  if (attempts.length === 0) {
    return { verdict: "error", passedAt: null, neededEscalation: false, detail: "no attempts recorded" };
  }

  const rungVerdict = (a: ProbeAttempt): Verdict | "no-action" => {
    if (a.loadVerdict !== "ok") return a.loadVerdict;
    if (a.action === "none") return "no-action";
    return a.actionVerdict ?? "error";
  };

  for (const a of attempts) {
    if (rungVerdict(a) === "ok") {
      return {
        verdict: "ok",
        passedAt: a.rung,
        neededEscalation: a.rung !== RUNG_ORDER[0],
        detail: `${a.action} completed at ${a.rung}: ${a.detail}`,
      };
    }
  }

  // Nothing passed. Prefer the last rung that observed something — it is the
  // most permissive configuration that produced real evidence.
  const observed = attempts.filter((a) => rungVerdict(a) !== "error");
  const decisive = observed[observed.length - 1] ?? attempts[attempts.length - 1]!;
  const v = rungVerdict(decisive);
  const erased = attempts.length - observed.length;
  return {
    verdict: v,
    passedAt: null,
    neededEscalation: false,
    detail:
      `${v} at every rung through ${decisive.rung}: ${decisive.detail}` +
      (erased > 0 && observed.length > 0 ? ` (${erased} later rung(s) errored and were not treated as evidence)` : ""),
  };
}

/**
 * Which sites the subset draw must exclude.
 *
 * Only `blocked`. `degraded`, `no-action` and `error` are explicitly NOT
 * exclusions: they mean the probe is inconclusive, and excluding on an
 * inconclusive probe would shrink the denominator on a guess. They are published
 * as their own counts instead, and a task on such a site that fails mid-episode
 * is feat-020's `site-blocked` label rather than a pre-run exclusion.
 */
export function blockedSiteKeys(verdicts: Record<string, SiteVerdict>): string[] {
  return Object.entries(verdicts)
    .filter(([, v]) => v.verdict === "blocked")
    .map(([site]) => site)
    .sort();
}
