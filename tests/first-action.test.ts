/**
 * The feat-004 first-action probe must not repeat feat-002's mistake, and must
 * not manufacture exclusions.
 *
 * Two claims are pinned here.
 *
 * 1. **A site that loads is not a site that works.** feat-003 found Google
 *    Search serving a clean landing page and then answering the first real query
 *    with /sorry/index. feat-002's goto-only probe scored it reachable. So a rung
 *    whose page loaded `ok` and whose action came back `blocked` must resolve to
 *    blocked, not ok.
 * 2. **A site is blocked only if every rung refused it.** feat-002 separated
 *    Cambridge Dictionary (403 in both modes, a real block) from Allrecipes (402
 *    headless, 200 headed, a mode artefact). Getting this wrong inflates the
 *    published exclusion count, which the project promises to stand behind.
 *
 * Plus the one thing the 2026-07-30 evasion amendment permits: the masked user
 * agent drops the HeadlessChrome token and changes nothing else.
 *
 * No network, no browser.
 */
import { describe, expect, it } from "bun:test";
import {
  PROBE_QUERY,
  RUNG_ORDER,
  SEARCH_SELECTORS,
  SEARCH_TOGGLES,
  SETTLE_FLOOR_MS,
  SETTLE_POLL_MS,
  announcesHeadless,
  blockedSiteKeys,
  maskHeadlessUserAgent,
  initialSettleState,
  resolveSiteVerdict,
  stepSettle,
  type ProbeAttempt,
  type SettleSample,
  type SiteVerdict,
} from "../scripts/lib/first-action.ts";

/** The UA Chromium 151 actually sent during the feat-002 headless run. */
const STOCK_HEADLESS =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36";

const attempt = (o: Partial<ProbeAttempt> & Pick<ProbeAttempt, "rung">): ProbeAttempt => ({
  loadVerdict: "ok",
  actionVerdict: "ok",
  action: "search-submit",
  detail: "",
  ...o,
});

describe("maskHeadlessUserAgent — the only permitted masking", () => {
  it("drops the HeadlessChrome token", () => {
    expect(announcesHeadless(STOCK_HEADLESS)).toBe(true);
    expect(announcesHeadless(maskHeadlessUserAgent(STOCK_HEADLESS))).toBe(false);
  });

  it("changes nothing else, including the version", () => {
    // Substituting a headed build's version would be fabricating a different
    // client, which is the line the amendment explicitly does not move.
    const masked = maskHeadlessUserAgent(STOCK_HEADLESS);
    expect(masked).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36",
    );
    expect(masked).toBe(STOCK_HEADLESS.replace("HeadlessChrome/", "Chrome/"));
    expect(masked.length).toBe(STOCK_HEADLESS.length - "Headless".length);
  });

  it("leaves an already-headed UA untouched", () => {
    const headed =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
    expect(maskHeadlessUserAgent(headed)).toBe(headed);
  });
});

describe("the probe is generic", () => {
  it("names no host in any selector", () => {
    // The no-site-specific-code invariant, enforced rather than asserted.
    for (const sel of [...SEARCH_SELECTORS, ...SEARCH_TOGGLES]) {
      expect(sel).not.toMatch(/\.(com|org|net|gov|edu|io|co)\b/i);
      expect(sel).not.toMatch(/google|amazon|booking|allrecipes|cambridge|bestbuy|arxiv/i);
    }
  });

  it("can reach a search box that is not an input", () => {
    // google.com's search field is a textarea, and an input-only ladder scored
    // it `no-action` — silently failing to probe the one site that motivated
    // this whole feature.
    expect(SEARCH_SELECTORS).toContain('textarea[name="q"]');
  });

  it("leads the toggle list with the ARIA disclosure pattern", () => {
    // What the markup is for, and what assistive tech reads. Text matching
    // alone finds arxiv.org's toggle only by luck, because the same page has a
    // dozen navigating links whose text is also "search".
    expect(SEARCH_TOGGLES[0]).toBe('[aria-expanded="false"][aria-controls*="search" i]');
  });

  it("types one fixed query everywhere", () => {
    // Varying the query per site would be site-specific handling wearing a hat.
    expect(PROBE_QUERY).toBe("blue");
  });

  it("climbs the ladder from the most restrictive rung", () => {
    expect(RUNG_ORDER).toEqual(["headless-masked", "headless-stock", "headed"]);
  });
});

describe("resolveSiteVerdict — a site that loads is not a site that works", () => {
  it("scores the Google Search case as blocked, not ok", () => {
    // The exact shape feat-003 found: landing page fine, first query refused.
    const v = resolveSiteVerdict(
      RUNG_ORDER.map((rung) =>
        attempt({ rung, loadVerdict: "ok", actionVerdict: "blocked", detail: "unusual traffic" }),
      ),
    );
    expect(v.verdict).toBe("blocked");
    expect(v.passedAt).toBe(null);
  });

  it("would have scored that same site ok on load alone", () => {
    // Guards the guard: if this ever passes, the probe has silently become a goto.
    const loadOnly = resolveSiteVerdict([
      attempt({ rung: "headless-masked", loadVerdict: "ok", actionVerdict: "ok" }),
    ]);
    expect(loadOnly.verdict).toBe("ok");
  });

  it("treats a completed action on a served page as ok", () => {
    const v = resolveSiteVerdict([attempt({ rung: "headless-masked" })]);
    expect(v.verdict).toBe("ok");
    expect(v.passedAt).toBe("headless-masked");
    expect(v.neededEscalation).toBe(false);
  });
});

describe("resolveSiteVerdict — blocked only if every rung refused", () => {
  it("does not block a site that the headed rung serves (the Allrecipes shape)", () => {
    const v = resolveSiteVerdict([
      attempt({ rung: "headless-masked", loadVerdict: "blocked", actionVerdict: null, action: "none", detail: "HTTP 402" }),
      attempt({ rung: "headless-stock", loadVerdict: "blocked", actionVerdict: null, action: "none", detail: "HTTP 402" }),
      attempt({ rung: "headed", loadVerdict: "ok", actionVerdict: "ok", detail: "HTTP 200" }),
    ]);
    expect(v.verdict).toBe("ok");
    expect(v.passedAt).toBe("headed");
    expect(v.neededEscalation).toBe(true);
  });

  it("blocks a site refused at every rung (the Cambridge shape)", () => {
    const v = resolveSiteVerdict(
      RUNG_ORDER.map((rung) =>
        attempt({ rung, loadVerdict: "blocked", actionVerdict: null, action: "none", detail: "just a moment (HTTP 403)" }),
      ),
    );
    expect(v.verdict).toBe("blocked");
    expect(v.detail).toContain("headed");
  });

  it("records that masking alone was enough when it was", () => {
    // This is what makes the run answer the open "what does masking buy" question.
    const v = resolveSiteVerdict([
      attempt({ rung: "headless-masked", loadVerdict: "ok", actionVerdict: "ok" }),
    ]);
    expect(v.neededEscalation).toBe(false);
    const escalated = resolveSiteVerdict([
      attempt({ rung: "headless-masked", loadVerdict: "blocked", action: "none", actionVerdict: null }),
      attempt({ rung: "headless-stock", loadVerdict: "ok", actionVerdict: "ok" }),
    ]);
    expect(escalated.neededEscalation).toBe(true);
    expect(escalated.passedAt).toBe("headless-stock");
  });

  it("reports the last rung's reason, not the first", () => {
    const v = resolveSiteVerdict([
      attempt({ rung: "headless-masked", loadVerdict: "blocked", action: "none", actionVerdict: null, detail: "HTTP 402" }),
      attempt({ rung: "headless-stock", loadVerdict: "blocked", action: "none", actionVerdict: null, detail: "HTTP 402" }),
      attempt({ rung: "headed", loadVerdict: "blocked", action: "none", actionVerdict: null, detail: "captcha" }),
    ]);
    expect(v.detail).toContain("captcha");
    expect(v.detail).not.toContain("402");
  });

  it("does not silently pass an unprobed site", () => {
    const v = resolveSiteVerdict([attempt({ rung: "headed", loadVerdict: "ok", action: "none", actionVerdict: null })]);
    expect(v.verdict).toBe("no-action");
    expect(v.verdict).not.toBe("ok");
  });

  it("calls an empty ladder an error rather than ok", () => {
    expect(resolveSiteVerdict([]).verdict).toBe("error");
  });

  it("does not let a later error erase an earlier observation", () => {
    // The smoke run produced exactly this: Cambridge Dictionary returned a clean
    // 403 interstitial at both headless rungs, then hung the headed rung past
    // its 90s deadline. Taking the last rung verbatim reported the site as
    // `error` — quietly moving it out of the published exclusion list on the
    // strength of a hang.
    const v = resolveSiteVerdict([
      attempt({ rung: "headless-masked", loadVerdict: "blocked", action: "none", actionVerdict: null, detail: "HTTP 403" }),
      attempt({ rung: "headless-stock", loadVerdict: "blocked", action: "none", actionVerdict: null, detail: "HTTP 403" }),
      attempt({ rung: "headed", loadVerdict: "error", action: "none", actionVerdict: null, detail: "deadline exceeded" }),
    ]);
    expect(v.verdict).toBe("blocked");
    expect(v.detail).toContain("headless-stock");
    expect(v.detail).toMatch(/errored and were not treated as evidence/);
  });

  it("still reports error when no rung observed anything", () => {
    const v = resolveSiteVerdict(
      RUNG_ORDER.map((rung) =>
        attempt({ rung, loadVerdict: "error", action: "none", actionVerdict: null, detail: "timeout" }),
      ),
    );
    expect(v.verdict).toBe("error");
  });
});

describe("blockedSiteKeys — only a block is an exclusion", () => {
  const v = (verdict: SiteVerdict["verdict"]): SiteVerdict => ({
    verdict,
    passedAt: null,
    neededEscalation: false,
    detail: "",
  });

  it("excludes blocked sites and nothing else", () => {
    // degraded / no-action / error mean the probe was inconclusive. Excluding on
    // an inconclusive probe would shrink the published denominator on a guess.
    expect(
      blockedSiteKeys({
        "a.example": v("blocked"),
        "b.example": v("degraded"),
        "c.example": v("no-action"),
        "d.example": v("error"),
        "e.example": v("ok"),
      }),
    ).toEqual(["a.example"]);
  });

  it("returns a sorted list, so the published site list is stable", () => {
    expect(
      blockedSiteKeys({ "z.example": v("blocked"), "a.example": v("blocked"), "m.example": v("blocked") }),
    ).toEqual(["a.example", "m.example", "z.example"]);
  });

  it("returns empty when nothing is blocked", () => {
    expect(blockedSiteKeys({ "a.example": v("ok") })).toEqual([]);
  });
});

describe("stepSettle — an empty shell is not a settled page", () => {
  const run = (samples: SettleSample[], pollMs = SETTLE_POLL_MS) => {
    let state = initialSettleState;
    for (const [i, s] of samples.entries()) {
      const next = stepSettle(state, s, i * pollMs);
      state = next.state;
      if (next.done) return { doneAt: i * pollMs, polls: i + 1 };
    }
    return { doneAt: null, polls: samples.length };
  };

  it("never settles on a zero-length body, however 'complete' it claims to be", () => {
    // The bug this is the guard on: amazon.com, booking.com, imdb.com and
    // airbnb.com all report readyState "complete" with an empty body while their
    // app boots. The first version of this rule called that settled after ~610ms
    // and classify() recorded "0 chars of text, 0 interactive elements" —
    // `degraded` verdicts that feat-002 directly contradicts.
    const emptyShell = Array.from({ length: 40 }, () => ({ len: 0, ready: "complete" }));
    expect(run(emptyShell).doneAt).toBe(null);
  });

  it("settles once real content arrives and holds", () => {
    const samples = [
      { len: 0, ready: "loading" },
      { len: 0, ready: "complete" },
      { len: 5200, ready: "complete" },
      ...Array.from({ length: 10 }, () => ({ len: 5200, ready: "complete" })),
    ];
    const { doneAt } = run(samples);
    expect(doneAt).not.toBe(null);
    expect(doneAt!).toBeGreaterThanOrEqual(SETTLE_FLOOR_MS);
  });

  it("does not settle before the floor even on an instantly-complete page", () => {
    // Content that lands in one burst looks stable the moment it arrives.
    const instant = Array.from({ length: 30 }, () => ({ len: 8000, ready: "complete" }));
    expect(run(instant).doneAt!).toBeGreaterThanOrEqual(SETTLE_FLOOR_MS);
  });

  it("keeps waiting while a progressive renderer is still growing", () => {
    // google.com was measured at 54 of its ~187 characters after 1.6s.
    const growing = [
      { len: 54, ready: "complete" },
      { len: 120, ready: "complete" },
      { len: 187, ready: "complete" },
    ];
    expect(run(growing).doneAt).toBe(null);
    const settled = run([...growing, ...Array.from({ length: 8 }, () => ({ len: 187, ready: "complete" }))]);
    expect(settled.doneAt).not.toBe(null);
  });

  it("requires consecutive stability, not cumulative", () => {
    // A page that flickers back and forth must not accumulate credit.
    const flapping = Array.from({ length: 40 }, (_, i) => ({ len: i % 2 ? 100 : 200, ready: "complete" }));
    expect(run(flapping).doneAt).toBe(null);
  });

  it("resets its counter when the page changes again", () => {
    const s = stepSettle({ previous: 500, stable: 2 }, { len: 900, ready: "complete" }, 9_000);
    expect(s.state.stable).toBe(0);
    expect(s.done).toBe(false);
  });
});
