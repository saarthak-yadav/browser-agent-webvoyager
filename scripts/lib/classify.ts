/**
 * feat-002 — the reachability verdict rules, as a pure function.
 *
 * Split out of `scripts/check-reachability.ts` so the rules can be tested
 * without a browser or a network call. The two corrections recorded in
 * docs/DECISIONS.md (a low-text landing page is not blocked; a 402 is) are
 * pinned by `tests/classify.test.ts` — they were both found by eye during the
 * feat-002 run, and a regression here would silently move the reachability
 * numbers the benchmark denominator is built on.
 *
 * Block detection is generic: HTTP status plus phrases any interstitial uses.
 * There is no per-domain branch here and there must never be one.
 */

/**
 * Phrases that appear on bot walls, CAPTCHA interstitials and hard denials,
 * whatever the vendor. Matched against the page's visible text and title.
 */
export const BLOCK_PHRASES = [
  "captcha",
  "are you a robot",
  "are you a human",
  "verify you are human",
  "verify that you are",
  "unusual traffic",
  "automated access",
  "automated queries",
  "access denied",
  "permission to access",
  "checking your browser",
  "just a moment",
  "enable javascript and cookies",
  "request blocked",
  "suspicious activity",
  "not a robot",
  "security check",
  "rate limit",
  "too many requests",
  "sorry, we just need to make sure",
  "type the characters",
];

/** Phrases that mean the page loaded but the site is degraded, not blocking. */
export const DEGRADED_PHRASES = ["service unavailable", "temporarily unavailable", "try again later"];

/** Below both of these, a page is too empty to be a working landing page. */
export const NEAR_EMPTY_TEXT_CHARS = 200;
export const NEAR_EMPTY_INTERACTIVE = 20;

export type Verdict = "ok" | "blocked" | "degraded" | "error";

export interface ClassifyInput {
  /** Status of the main document, or null if the navigation produced none. */
  httpStatus: number | null;
  title: string | null;
  /** Visible text of the page body. */
  bodyText: string;
  /** Length of the visible text, recorded separately in the result row. */
  textChars: number;
  interactiveCount: number | null;
}

export interface Classification {
  verdict: Verdict;
  detail: string;
  matchedPhrases: string[];
}

/**
 * Statuses that mean the request was refused outright rather than served.
 *
 * 402 is in here because Allrecipes serves its access-denied page with it. That
 * is a status-code fact, not a per-domain branch — any site using 402 the same
 * way is classified the same way. 401 is deliberately absent: it means "log in",
 * which is a different finding from "we do not serve automated clients".
 */
export function isHardStatus(status: number): boolean {
  return status === 402 || status === 403 || status === 429 || status === 451 || status === 503 || status >= 500;
}

/**
 * Decide what a loaded page means. Order matters: an interstitial phrase beats
 * the status code (a Cloudflare challenge can arrive with a 200), the status
 * code beats page-emptiness heuristics, and emptiness is the last resort.
 */
export function classify(input: ClassifyInput): Classification {
  const haystack = `${input.title ?? ""}\n${input.bodyText}`.toLowerCase();
  const matchedPhrases = BLOCK_PHRASES.filter((p) => haystack.includes(p));
  const degradedHits = DEGRADED_PHRASES.filter((p) => haystack.includes(p));

  const status = input.httpStatus ?? 0;

  if (matchedPhrases.length > 0) {
    return {
      verdict: "blocked",
      matchedPhrases,
      detail: `interstitial phrases: ${matchedPhrases.join(", ")} (HTTP ${status})`,
    };
  }
  if (isHardStatus(status)) {
    return { verdict: "blocked", matchedPhrases, detail: `HTTP ${status} on the main document` };
  }
  if (degradedHits.length > 0) {
    return {
      verdict: "degraded",
      matchedPhrases,
      detail: `HTTP ${status}, page says: ${degradedHits.join(", ")}`,
    };
  }
  // Both conditions, not either: a landing page can be legitimately text-poor
  // and still fully usable. google.com is ~185 chars with ~50 controls and is
  // perfectly reachable — an OR here flagged it as degraded, which was wrong.
  if (input.textChars < NEAR_EMPTY_TEXT_CHARS && (input.interactiveCount ?? 0) < NEAR_EMPTY_INTERACTIVE) {
    return {
      verdict: "degraded",
      matchedPhrases,
      detail: `HTTP ${status} but near-empty page: ${input.textChars} chars of text, ${input.interactiveCount} interactive elements`,
    };
  }
  return {
    verdict: "ok",
    matchedPhrases,
    detail: `HTTP ${status}, ${input.textChars} chars of text, ${input.interactiveCount} interactive elements`,
  };
}
