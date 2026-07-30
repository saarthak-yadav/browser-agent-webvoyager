/**
 * feat-005 — the action space, its parser, and the invariant that none of it
 * knows what site it is on.
 *
 * No browser here. Everything below is a pure function over plain data, plus a
 * grep of the driver's own source — the same technique feat-002's classifier
 * test uses to keep "no site-specific code" a control rather than a promise.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ACTION_KINDS,
  TYPE_SUBMIT_DEFAULT,
  classifyActionError,
  describeAction,
  parseAction,
  parseActionJson,
} from "../scripts/lib/actions.ts";

describe("the action space is closed at seven", () => {
  it("is exactly the seven actions ARCHITECTURE.md specifies", () => {
    // feat-006, feat-008, feat-009 and feat-010 are all shaped by this list.
    // Changing it is a deliberate act, and this test is where it gets noticed.
    expect([...ACTION_KINDS].sort()).toEqual(["answer", "back", "click", "navigate", "scroll", "type", "wait"]);
  });

  it("accepts every one of them in its documented form", () => {
    const valid = [
      { kind: "click", id: 3 },
      { kind: "type", id: 3, text: "blue", submit: true },
      { kind: "scroll", direction: "down" },
      { kind: "scroll", id: 7 },
      { kind: "navigate", url: "https://example.invalid/x" },
      { kind: "back" },
      { kind: "wait" },
      { kind: "answer", text: "42" },
    ];
    for (const raw of valid) {
      const parsed = parseAction(raw);
      expect(parsed.ok, `${JSON.stringify(raw)} should parse`).toBe(true);
    }
  });
});

describe("parseAction is strict, because the rejection rate is a finding", () => {
  it("rejects an action outside the space", () => {
    const parsed = parseAction({ kind: "screenshot" });
    expect(parsed).toMatchObject({ ok: false, code: "unknown-kind" });
  });

  it("rejects a selector smuggled in beside the id", () => {
    // The whole contract is that an element is named by an id from the current
    // observation. Silently ignoring a `selector` field would let a model believe
    // it had addressed an element some other way.
    const parsed = parseAction({ kind: "click", id: 2, selector: ".submit-btn" });
    expect(parsed).toMatchObject({ ok: false, code: "unknown-field" });
    if (!parsed.ok) expect(parsed.error).toContain("selector");
  });

  it("rejects a non-integer or negative id", () => {
    expect(parseAction({ kind: "click", id: 1.5 })).toMatchObject({ ok: false, code: "bad-field" });
    expect(parseAction({ kind: "click", id: -1 })).toMatchObject({ ok: false, code: "bad-field" });
    expect(parseAction({ kind: "click", id: "3" })).toMatchObject({ ok: false, code: "bad-field" });
  });

  it("defaults type submit to false rather than pressing Enter unasked", () => {
    // Defaulting to submit would send a half-filled multi-field form on the
    // first `type`, and the trace would read as a planning error that never was.
    const parsed = parseAction({ kind: "type", id: 1, text: "x" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.action.kind === "type") expect(parsed.action.submit).toBe(TYPE_SUBMIT_DEFAULT);
    expect(TYPE_SUBMIT_DEFAULT).toBe(false);
  });

  it("allows empty type text, because clearing a field is a real action", () => {
    expect(parseAction({ kind: "type", id: 1, text: "" }).ok).toBe(true);
  });

  it("rejects an empty answer, which would terminate with nothing to judge", () => {
    expect(parseAction({ kind: "answer", text: "   " })).toMatchObject({ ok: false, code: "bad-field" });
    expect(parseAction({ kind: "answer" })).toMatchObject({ ok: false, code: "missing-field" });
  });

  it("requires scroll to name exactly one target", () => {
    expect(parseAction({ kind: "scroll" })).toMatchObject({ ok: false, code: "bad-field" });
    expect(parseAction({ kind: "scroll", direction: "down", id: 2 })).toMatchObject({ ok: false, code: "bad-field" });
    expect(parseAction({ kind: "scroll", direction: "sideways" })).toMatchObject({ ok: false, code: "bad-field" });
  });

  it("refuses to navigate to anything that is not http or https", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,<b>x", "chrome://settings"]) {
      expect(parseAction({ kind: "navigate", url })).toMatchObject({ ok: false, code: "bad-url" });
    }
    expect(parseAction({ kind: "navigate", url: "not a url" })).toMatchObject({ ok: false, code: "bad-url" });
  });

  it("rejects non-objects instead of throwing", () => {
    for (const raw of [null, undefined, 3, "click", ["click"]]) {
      expect(parseAction(raw)).toMatchObject({ ok: false, code: "not-an-object" });
    }
  });

  it("reports malformed JSON as a parse failure, not an exception", () => {
    expect(parseActionJson("{oops")).toMatchObject({ ok: false, code: "bad-json" });
    expect(parseActionJson('{"kind":"back"}')).toMatchObject({ ok: true });
  });
});

describe("failure classification keeps retry and replan separable", () => {
  it("calls a detached node stale, not a timeout", () => {
    // feat-010 reads this: stale means re-observe, timeout means the page was
    // not ready. Pattern-matching on error prose at the policy layer instead
    // would put the distinction in the wrong place.
    expect(classifyActionError("Element is not attached to the DOM")).toBe("stale-element");
    expect(classifyActionError("Execution context was destroyed")).toBe("stale-element");
  });

  it("separates a plain timeout from an actionability timeout", () => {
    expect(classifyActionError("Timeout 10000ms exceeded waiting for locator")).toBe("timeout");
    expect(classifyActionError("Timeout 10000ms exceeded: element is not visible")).toBe("not-interactable");
    expect(classifyActionError("element is not editable")).toBe("not-interactable");
  });

  it("recognises a network failure as a navigation failure", () => {
    expect(classifyActionError("page.goto: net::ERR_NAME_NOT_RESOLVED")).toBe("navigation-failed");
  });

  it("falls back to driver-error rather than guessing", () => {
    expect(classifyActionError("something nobody predicted")).toBe("driver-error");
    expect(classifyActionError("Target page, context or browser has been closed")).toBe("driver-error");
  });
});

describe("describeAction renders every action for the trace", () => {
  it("has a line for each kind", () => {
    expect(describeAction({ kind: "click", id: 4 })).toBe("click #4");
    expect(describeAction({ kind: "type", id: 4, text: "blue", submit: true })).toBe('type #4 "blue" + submit');
    expect(describeAction({ kind: "scroll", target: { by: "direction", direction: "up" } })).toBe("scroll up");
    expect(describeAction({ kind: "scroll", target: { by: "element", id: 9 } })).toBe("scroll to #9");
    expect(describeAction({ kind: "navigate", url: "https://example.invalid/" })).toBe("navigate https://example.invalid/");
    expect(describeAction({ kind: "back" })).toBe("back");
    expect(describeAction({ kind: "wait" })).toBe("wait");
    expect(describeAction({ kind: "answer", text: "42" })).toBe('answer "42"');
  });
});

describe("the no-site-specific-code invariant, enforced on the source", () => {
  /**
   * The three files that make up feat-005. If a site-specific hack is ever going
   * to appear, it appears in one of these.
   */
  const SOURCES = ["scripts/lib/actions.ts", "scripts/lib/driver.ts", "scripts/search-two-sites.ts"];

  /**
   * Strip comments, then grep the code that is left.
   *
   * Comments are excluded deliberately: explaining *why* a generic rule exists
   * ("a site was seen doing X") is documentation and feat-004's libraries are
   * full of it. What must not exist is a domain or a brand the running code can
   * branch on. The `[^:]` guard keeps `https://` inside a string from being read
   * as the start of a comment.
   */
  const code = (path: string) =>
    readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n");

  it("contains no domain literal anywhere in the executable code", () => {
    const domainish = /\b[a-z0-9][a-z0-9-]{1,}\.(com|org|net|io|co|gov|edu|ai|dev|uk|de|fr|jp|cn)\b/i;
    for (const path of SOURCES) {
      const hit = code(path).match(domainish);
      expect(hit?.[0] ?? null, `${path} must not name a domain`).toBeNull();
    }
  });

  it("names no site or brand", () => {
    const brands =
      /\b(amazon|google|booking|allrecipes|cambridge|arxiv|coursera|youtube|wikipedia|facebook|twitter|reddit|ebay|walmart|espn|kaggle|apple|microsoft|cloudflare|yelp|airbnb|imdb)\b/i;
    for (const path of SOURCES) {
      const hit = code(path).match(brands);
      expect(hit?.[0] ?? null, `${path} must not name a site`).toBeNull();
    }
  });

  it("never inspects the host of the page it is on", () => {
    // Stronger than "no literal domain": the driver cannot branch on where it
    // is, because it never asks. A future `if (host === ...)` needs this line
    // deleted first, which is exactly the moment to argue about it.
    for (const path of SOURCES) {
      const hit = code(path).match(/\bhostname\b|\.host\b|\bdomain\b/i);
      expect(hit?.[0] ?? null, `${path} must not read the host`).toBeNull();
    }
  });

  it("takes its sites as arguments, not as constants", () => {
    // The acceptance script proves "same code path" only if swapping the sites
    // is a command-line change. If a default URL ever appears here, the claim
    // weakens and this test fails.
    const script = readFileSync("scripts/search-two-sites.ts", "utf8");
    expect(script).toContain("--site=");
    expect(code("scripts/search-two-sites.ts")).not.toMatch(/https?:\/\/[a-z]/i);
  });
});
