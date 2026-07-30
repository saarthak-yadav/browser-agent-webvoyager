/**
 * feat-005 — the driver against a real Chromium, on a local fixture.
 *
 * A live site cannot test error recovery: you cannot ask a site to have no
 * history, to hide a duplicate search box, or to open a popup on demand. So the
 * fixture is a local server serving pages built to exercise exactly the paths
 * that live runs will hit and that no live run reliably reproduces.
 *
 * `session-handoff.md` after feat-004: *"Error-recovery paths are the untested
 * ones. The single real bug typecheck found was in the browser-relaunch path,
 * which no run had ever executed."* This file is the answer to that for feat-005
 * — `unknown-element`, `no-history`, the hidden-duplicate field and popup
 * adoption are all failure paths that the acceptance run may never touch.
 *
 * The fixture is served from the loopback interface. It is not a site and there
 * is no site-specific code being tested here; `tests/actions.test.ts` is what
 * holds that invariant, by grepping the driver's source.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Driver } from "../scripts/lib/driver.ts";

const HOME = `<!doctype html>
<html><head><title>Fixture home</title></head><body>
  <h1>Fixture home</h1>
  <p>Some text so the page is not near-empty. ${"filler ".repeat(60)}</p>
  <!-- A hidden duplicate of the search box, in its own form and in DOM order
       BEFORE the real one — the collapsed mobile header every second site
       ships. This is the shape feat-004 hit live: taking the first match lands
       on an invisible input and the type silently does nothing. -->
  <form action="/search" method="get">
    <input type="text" name="q" aria-label="Search (mobile)" style="display:none">
  </form>
  <form action="/search" method="get">
    <input type="search" name="q" aria-label="Search the fixture">
    <button type="submit">Go</button>
  </form>
  <a href="/other">A second page on the fixture</a>
  <!-- A same-document history entry: the shape every single-page app uses. -->
  <a href="#deep-anchor">A fragment link that commits no document</a>
  <div id="deep-anchor" style="height:10px">anchor</div>
  <a href="/popup" target="_blank">Opens in a new tab entirely</a>
  <div style="height:4000px">tall</div>
</body></html>`;

const OTHER = `<!doctype html><html><head><title>Other</title></head><body>
  <h1>Other page</h1><p>${"more text ".repeat(60)}</p></body></html>`;

const POPUP = `<!doctype html><html><head><title>Popup</title></head><body>
  <h1>The popup page</h1><p>${"popup text ".repeat(60)}</p></body></html>`;

const results = (q: string) => `<!doctype html><html><head><title>Results</title></head><body>
  <h1>Results for ${q}</h1>
  <p>${"result text ".repeat(60)}</p>
  <a href="/other">A result link with a good long name</a>
</body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
let driver: Driver;

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const html =
        url.pathname === "/other"
          ? OTHER
          : url.pathname === "/popup"
            ? POPUP
            : url.pathname === "/search"
              ? results(url.searchParams.get("q") ?? "")
              : HOME;
      return new Response(html, { headers: { "content-type": "text/html" } });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  // Short settle caps: the settle rule itself is already pinned by
  // tests/first-action.test.ts, and this file is about the driver's actions.
  driver = await Driver.launch({ settleCapMs: 2_500, waitCapMs: 2_000, navigationTimeoutMs: 15_000 });
}, 60_000);

afterAll(async () => {
  await driver?.close();
  server?.stop(true);
});

describe("browser configuration is the settled one, and is reported", () => {
  it("declares en-US and a fixed timezone, and is not proxied", () => {
    expect(driver.config.locale).toBe("en-US");
    expect(driver.config.timezoneId.length).toBeGreaterThan(0);
    expect(driver.config.proxied).toBe(false);
  });

  it("masks the HeadlessChrome token and nothing else", () => {
    // The permitted masking, and the whole of it: same version, same everything,
    // one token dropped. A UA that differs anywhere else would be a different
    // client, which the 2026-07-30 amendment does not allow.
    expect(driver.config.stockUserAgent).toContain("HeadlessChrome");
    expect(driver.config.effectiveUserAgent).not.toContain("HeadlessChrome");
    expect(driver.config.effectiveUserAgent).toBe(driver.config.stockUserAgent.replace("HeadlessChrome/", "Chrome/"));
  });
});

describe("navigate, snapshot and type", () => {
  it("navigates and records the status", async () => {
    const r = await driver.execute({ kind: "navigate", url: `${base}/` });
    expect(r.ok).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(r.navigated).toBe(true);
    expect(driver.url()).toBe(`${base}/`);
  }, 30_000);

  it("skips the hidden duplicate field and numbers what is visible", async () => {
    const elements = await driver.snapshot();
    const editable = elements.filter((e) => e.editable);
    expect(editable.length).toBe(1);
    expect(editable[0]!.name).toBe("Search the fixture");
    // Ids are 1-based and dense, so an id in an observation is an index a model
    // can reason about.
    expect(elements.map((e) => e.id)).toEqual(elements.map((_, i) => i + 1));
  }, 30_000);

  it("types into an element by id and submits", async () => {
    const field = (await driver.snapshot()).find((e) => e.editable)!;
    const r = await driver.execute({ kind: "type", id: field.id, text: "blue", submit: true });
    expect(r.ok).toBe(true);
    expect(r.evidence.submitted).toBe(true);
    expect(driver.url()).toContain("/search?q=blue");
  }, 30_000);

  it("clears the field before typing, as the contract says", async () => {
    await driver.execute({ kind: "navigate", url: `${base}/` });
    const field = (await driver.snapshot()).find((e) => e.editable)!;
    await driver.execute({ kind: "type", id: field.id, text: "first", submit: false });
    await driver.execute({ kind: "type", id: field.id, text: "second", submit: true });
    expect(driver.url()).toContain("q=second");
    expect(driver.url()).not.toContain("first");
  }, 30_000);
});

describe("failures come back as results, never as exceptions", () => {
  it("reports an id that is not in the registry", async () => {
    await driver.execute({ kind: "navigate", url: `${base}/` });
    await driver.snapshot();
    const r = await driver.execute({ kind: "click", id: 9_999 });
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("unknown-element");
    expect(r.evidence.requestedId).toBe(9_999);
  }, 30_000);

  it("reports an id used before any snapshot, pointing at the real mistake", async () => {
    // A navigation drops the registry: ids from the previous page must not
    // silently resolve to whatever occupies that index now.
    await driver.execute({ kind: "navigate", url: `${base}/other` });
    const r = await driver.execute({ kind: "click", id: 1 });
    expect(r.ok).toBe(false);
    expect(r.failure).toBe("unknown-element");
    expect(r.detail).toContain("snapshot() has not run");
  }, 30_000);

  it("reports back with no history as no-history, not as an error", async () => {
    // Its own driver: a fresh tab with nothing behind it. This is the case
    // feat-010 must treat as replan (the action was wrong), not retry.
    const fresh = await Driver.launch({ settleCapMs: 2_000, waitCapMs: 2_000 });
    try {
      const r = await fresh.execute({ kind: "back" });
      expect(r.ok).toBe(false);
      expect(r.failure).toBe("no-history");
    } finally {
      await fresh.close();
    }
  }, 60_000);
});

describe("history entries that commit no document", () => {
  it("treats a same-document back as success, not as no-history", async () => {
    // Playwright returns null for a same-document entry, exactly as it does when
    // there is no history at all. Reading that null as failure made `back`
    // report `no-history` on every SPA — caught on a live site, pinned here.
    await driver.execute({ kind: "navigate", url: `${base}/` });
    const link = (await driver.snapshot()).find((e) => e.name.includes("fragment"))!;
    await driver.execute({ kind: "click", id: link.id });
    expect(driver.url()).toBe(`${base}/#deep-anchor`);

    const r = await driver.execute({ kind: "back" });
    expect(r.ok).toBe(true);
    expect(r.failure).toBeNull();
    expect(r.evidence.sameDocument).toBe(true);
    expect(driver.url()).toBe(`${base}/`);
  }, 30_000);
});

describe("the element registry holds marks, not handles", () => {
  it("clears the previous scan's marks, so no stale mark survives in the page", async () => {
    // Marks are per-snapshot, and the page changes between snapshots. An element
    // that drops out of the second scan must not keep the first scan's mark:
    // two elements carrying the same mark make the locator ambiguous, and the
    // action would resolve neither. Hiding elements between the two scans is
    // what makes this test able to fail — a static page re-marks identically
    // whether or not the clearing step runs.
    await driver.execute({ kind: "navigate", url: `${base}/` });
    const first = await driver.snapshot();
    expect(first.length).toBeGreaterThan(2);

    await driver.activePage().evaluate(() => {
      document.querySelectorAll("a").forEach((a) => ((a as HTMLElement).style.display = "none"));
    });
    const second = await driver.snapshot();
    expect(second.length).toBeLessThan(first.length);

    const marked = await driver
      .activePage()
      .evaluate(() => Array.from(document.querySelectorAll("[data-agent-el]"), (e) => e.getAttribute("data-agent-el")));
    expect(marked.length).toBe(second.length);
    expect(new Set(marked).size).toBe(marked.length);
    expect(second.map((e) => e.mark)).toEqual(second.map((_, i) => i));
  }, 30_000);

  it("fails cleanly when the marked node is gone from the page", async () => {
    // The handle version returned a detached node here. A mark that no longer
    // resolves is a bounded, named failure instead.
    await driver.execute({ kind: "navigate", url: `${base}/` });
    const els = await driver.snapshot();
    const link = els.find((e) => e.tag === "a")!;
    await driver.activePage().evaluate(() => {
      document.querySelectorAll("a").forEach((a) => a.remove());
    });
    const r = await driver.execute({ kind: "click", id: link.id });
    expect(r.ok).toBe(false);
    expect(["timeout", "not-interactable", "stale-element"]).toContain(r.failure ?? "none");
  }, 40_000);
});

describe("scroll, back, wait and answer", () => {
  it("scrolls the viewport and records how far it moved", async () => {
    await driver.execute({ kind: "navigate", url: `${base}/` });
    const down = await driver.execute({ kind: "scroll", target: { by: "direction", direction: "down" } });
    expect(down.ok).toBe(true);
    expect(down.evidence.movedPx as number).toBeGreaterThan(0);
    const up = await driver.execute({ kind: "scroll", target: { by: "direction", direction: "up" } });
    expect(up.evidence.movedPx as number).toBeLessThan(0);
  }, 30_000);

  it("reports a scroll that could not move rather than calling it a failure", async () => {
    // Already at the top: zero pixels is evidence for feat-012's stuck detector,
    // not a failed action.
    const r = await driver.execute({ kind: "scroll", target: { by: "direction", direction: "up" } });
    expect(r.ok).toBe(true);
    expect(r.evidence.movedPx).toBe(0);
  }, 30_000);

  it("goes back to the previous page", async () => {
    await driver.execute({ kind: "navigate", url: `${base}/other` });
    const r = await driver.execute({ kind: "back" });
    expect(r.ok).toBe(true);
    expect(driver.url()).toBe(`${base}/`);
  }, 30_000);

  it("waits within its bound", async () => {
    const r = await driver.execute({ kind: "wait" });
    expect(r.ok).toBe(true);
    expect(r.ms).toBeLessThan(6_000);
    expect(r.settleEnd).not.toBeNull();
  }, 30_000);

  it("answers without touching the page, and terminates", async () => {
    const before = driver.url();
    const r = await driver.execute({ kind: "answer", text: "the fixture says blue" });
    expect(r.ok).toBe(true);
    expect(r.terminal).toBe(true);
    expect(r.urlAfter).toBe(before);
  }, 30_000);
});

describe("a page the site opens for us", () => {
  it("follows a target=_blank click instead of watching the old tab", async () => {
    // Without adoption the trace shows a click that "worked" and an observation
    // that did not change — a driver failure that reads as a model failure.
    await driver.execute({ kind: "navigate", url: `${base}/` });
    const link = (await driver.snapshot()).find((e) => e.name.includes("new tab"))!;
    const r = await driver.execute({ kind: "click", id: link.id });
    expect(r.ok).toBe(true);
    expect(r.evidence.popupAdopted).toBe(true);
    expect(driver.url()).toBe(`${base}/popup`);
  }, 30_000);
});
