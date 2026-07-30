/**
 * The feat-002 reachability rules, pinned against the run that produced them.
 *
 * Two corrections were made mid-run and recorded in docs/DECISIONS.md
 * ("Two classifier corrections made during the run"). Both were caught by
 * looking at a screenshot, not by the code, and both moved a site between
 * verdicts — which is to say, both moved the benchmark denominator:
 *
 *   1. Google Search was called `degraded` by a `textChars < 200 || interactive
 *      < 5` rule. Its homepage is genuinely ~185 chars of text with ~50
 *      controls and is perfectly usable. The rule became `&&`. A low-text
 *      landing page is NOT a blocked one.
 *   2. Allrecipes' HTTP 402 access-denial was called `degraded` because 402 was
 *      not in the hard-status list. A 402 IS blocked.
 *
 * These are regression tests in the strict sense: each one fails against the
 * pre-correction rule. No network, no browser — the classifier is pure.
 */
import { describe, expect, it } from "bun:test";
import { BLOCK_PHRASES, classify, isHardStatus, type ClassifyInput } from "../scripts/lib/classify.ts";

/** A page as the probe records it. Overrides go on top of a plain OK page. */
function page(over: Partial<ClassifyInput> = {}): ClassifyInput {
  const bodyText = over.bodyText ?? "Welcome. Search results, articles and links across this site.";
  const base: ClassifyInput = {
    httpStatus: 200,
    title: "Example",
    bodyText,
    textChars: bodyText.length,
    interactiveCount: 120,
  };
  // textChars tracks bodyText unless the caller pins it deliberately.
  return { ...base, ...over, textChars: over.textChars ?? bodyText.length };
}

/**
 * google.com as feat-002 actually measured it: short text, plenty of controls.
 * The real recorded figures were ~185 chars and ~50 interactive elements.
 */
const GOOGLE_LANDING_TEXT =
  "About Store Gmail Images Sign in Search I'm Feeling Lucky Advertising Business " +
  "How Search works Privacy Terms Settings Carbon neutral since 2007 Learn more here";

describe("correction 1 — a low-text landing page is not blocked", () => {
  const google = page({
    httpStatus: 200,
    title: "Google",
    bodyText: GOOGLE_LANDING_TEXT,
    interactiveCount: 50,
  });

  it("measures the way feat-002 recorded it: under 200 chars, over 20 controls", () => {
    expect(google.textChars).toBeLessThan(200);
    expect(google.interactiveCount).toBeGreaterThanOrEqual(20);
  });

  it("classifies Google's landing page as ok, not blocked and not degraded", () => {
    const { verdict, matchedPhrases } = classify(google);
    expect(verdict).toBe("ok");
    expect(matchedPhrases).toEqual([]);
  });

  it("still flags a page that is BOTH text-poor and control-poor", () => {
    // The `&&` must not have turned the rule off altogether.
    const { verdict, detail } = classify(page({ bodyText: "Loading…", interactiveCount: 1 }));
    expect(verdict).toBe("degraded");
    expect(detail).toContain("near-empty page");
  });

  it("does not flag a text-rich page that happens to have few controls", () => {
    const article = "word ".repeat(400);
    expect(classify(page({ bodyText: article, interactiveCount: 2 })).verdict).toBe("ok");
  });

  it("holds at the boundary of each threshold", () => {
    // 199/19 is the only combination that degrades; either one at its threshold
    // is enough to call the page usable.
    expect(classify(page({ textChars: 199, interactiveCount: 19 })).verdict).toBe("degraded");
    expect(classify(page({ textChars: 200, interactiveCount: 19 })).verdict).toBe("ok");
    expect(classify(page({ textChars: 199, interactiveCount: 20 })).verdict).toBe("ok");
  });
});

describe("correction 2 — a 402 is blocked", () => {
  it("classifies the Allrecipes 402 access denial as blocked", () => {
    const { verdict, detail } = classify(
      page({
        httpStatus: 402,
        title: "Allrecipes",
        bodyText:
          "If you are a reader experiencing an access issue, please contact support@people.inc",
      }),
    );
    expect(verdict).toBe("blocked");
    expect(detail).toBe("HTTP 402 on the main document");
  });

  it("treats 402 as a hard status alongside the other denials", () => {
    for (const status of [402, 403, 429, 451, 500, 503, 502]) {
      expect(isHardStatus(status)).toBe(true);
    }
  });

  it("does not treat served statuses as denials", () => {
    // 202 matters: Amazon and Booking, two of the hardest sites, land on 202
    // with full content. Anything gating on `=== 200` calls them unreachable.
    for (const status of [200, 201, 202, 204, 301, 302, 304, 401, 404]) {
      expect(isHardStatus(status)).toBe(false);
    }
    expect(classify(page({ httpStatus: 202 })).verdict).toBe("ok");
  });
});

describe("interstitial detection", () => {
  it("blocks the Cambridge Dictionary Cloudflare challenge", () => {
    const { verdict, matchedPhrases, detail } = classify(
      page({
        httpStatus: 403,
        title: "Just a moment...",
        bodyText: "dictionary.cambridge.org needs to review the security of your connection",
        interactiveCount: 2,
      }),
    );
    expect(verdict).toBe("blocked");
    expect(matchedPhrases).toContain("just a moment");
    // Phrase evidence, not just the status, so the finding says what blocked it.
    expect(detail).toContain("interstitial phrases");
  });

  it("blocks the Google /sorry page even though it is served with a 200", () => {
    // feat-003's finding: the block lands on the first action, not on load, and
    // arrives as a normal 200. Status alone would have missed it.
    const { verdict, matchedPhrases } = classify(
      page({
        httpStatus: 200,
        title: "https://www.google.com/sorry/index",
        bodyText:
          "Our systems have detected unusual traffic from your computer network. " +
          "This page checks to see if it's really you sending the requests, and not a robot.",
        interactiveCount: 3,
      }),
    );
    expect(verdict).toBe("blocked");
    expect(matchedPhrases).toContain("unusual traffic");
  });

  it("matches phrases in the title as well as the body", () => {
    expect(classify(page({ title: "Access Denied", bodyText: "nothing here" })).verdict).toBe(
      "blocked",
    );
  });

  it("is case-insensitive", () => {
    expect(classify(page({ bodyText: "Please Verify You Are Human" })).verdict).toBe("blocked");
  });

  it("prefers blocked over degraded when a page says both", () => {
    const { verdict } = classify(
      page({ bodyText: "Service unavailable. Please complete the CAPTCHA and try again later." }),
    );
    expect(verdict).toBe("blocked");
  });

  it("separates a degraded site from a blocking one", () => {
    const { verdict, detail } = classify(
      page({ httpStatus: 200, bodyText: "Our service is temporarily unavailable. " + "x".repeat(300) }),
    );
    expect(verdict).toBe("degraded");
    expect(detail).toContain("temporarily unavailable");
  });

  it("reports a missing status as HTTP 0 rather than guessing", () => {
    const { verdict, detail } = classify(page({ httpStatus: null }));
    expect(verdict).toBe("ok");
    expect(detail).toContain("HTTP 0");
  });
});

describe("the no-site-specific-code invariant", () => {
  it("has no hostname or brand in the block phrases", () => {
    // AGENTS.md: no per-domain branching, ever. The phrases must describe bot
    // walls generically, so a site the project has never seen classifies the
    // same way as one it has.
    const domainish = /\.(com|org|net|io|co)\b|amazon|google|booking|allrecipes|cambridge|cloudflare/i;
    for (const phrase of BLOCK_PHRASES) expect(phrase).not.toMatch(domainish);
  });

  it("classifies purely from the recorded page fields", () => {
    // No URL is passed in at all — the same page content gets the same verdict
    // whatever site served it. This is the structural half of the invariant.
    const fields = Object.keys(page()).sort();
    expect(fields).toEqual(["bodyText", "httpStatus", "interactiveCount", "textChars", "title"]);
  });
});
