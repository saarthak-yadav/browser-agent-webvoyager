/**
 * feat-005 — the Playwright driver: the only thing in this project that touches
 * a page.
 *
 * The agent (feat-009) never sees a Locator, a selector or a URL of its own
 * choosing beyond `navigate`. It sees numbered elements and it emits one of the
 * seven actions in `actions.ts`. That narrow seam is what makes "works across
 * unseen sites" a testable claim instead of a hope: there is exactly one place
 * a site-specific hack could live, and it is this file.
 *
 * NO SITE-SPECIFIC CODE. No hostname is read, compared or branched on anywhere
 * below — not for element finding, not for waiting, not for deciding whether an
 * action worked. `tests/actions.test.ts` greps this file's source for domain
 * literals, brand names and any host inspection at all, the same way feat-002's
 * classifier test pins its own invariant. A promise in a comment is not a
 * control; the test is.
 *
 * Browser configuration is settled and is not re-decided here (docs/DECISIONS.md,
 * 2026-07-30):
 *
 * - **Locale `en-US`, fixed `timezoneId`, declared**, set in the context and
 *   reported in `config` so every trace can carry it. No proxying: the
 *   originating region is not controlled and is not claimed to be.
 * - **Headless masking only.** The user agent is overridden so the
 *   `HeadlessChrome` token is not announced, using feat-004's
 *   `maskHeadlessUserAgent`, which drops the token and changes nothing else —
 *   the version string stays exactly as the browser reported it. No stealth
 *   plugin, no fingerprint patching, no `navigator.webdriver` games, no CAPTCHA
 *   handling, no proxy. Both the stock and the effective UA are recorded.
 *
 * What this file deliberately does NOT do:
 *
 * - It does not serialize observations. `snapshot()` assigns ids to visible
 *   interactive nodes and stops there; feat-006 replaces the provider with the
 *   CDP accessibility tree. The seam is `ElementProvider`, and the id -> element
 *   registry is the contract both arms must satisfy.
 * - It does not retry or replan. It records a typed `ActionFailure` at the
 *   moment the cause is knowable and leaves the policy to feat-010.
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import {
  classifyActionError,
  describeAction,
  type Action,
  type ActionEvidence,
  type ActionFailure,
  type ActionResult,
} from "./actions.ts";
import { SETTLE_POLL_MS, initialSettleState, maskHeadlessUserAgent, stepSettle } from "./first-action.ts";

/**
 * Locale and timezone, from the 2026-07-30 decision. Declared configuration a
 * real user sets, reported rather than hidden.
 */
export const LOCALE = "en-US";
export const TIMEZONE_ID = "America/New_York";

export const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

/** Per-action timeout for element interactions. */
export const ACTION_TIMEOUT_MS = 10_000;
/** Per-navigation timeout, matching feat-004's sweep. */
export const NAVIGATION_TIMEOUT_MS = 45_000;
/**
 * Upper bound on waiting for a page to stop changing after an action.
 *
 * Settling is adaptive, not a fixed sleep, and the state machine is feat-004's
 * `stepSettle` — imported rather than re-implemented, because the naive version
 * of that rule ("text length unchanged, document complete") silently corrupted a
 * completed 145-site sweep by declaring empty SPA shells settled. Its 2s floor
 * is inherited, so a settling action costs at least that; feat-007 and feat-015
 * can revisit the number with measurement, not by rewriting the rule.
 */
export const SETTLE_CAP_MS = 12_000;
/** `wait` is bounded (ARCHITECTURE.md). This is the bound. */
export const WAIT_CAP_MS = 8_000;

/**
 * Hard wall-clock backstop per action, above every Playwright timeout.
 *
 * feat-004 recorded this exact lesson twice — "Playwright's timeouts do not
 * cover every hang" — and paid for it with an eight-hour run that produced
 * nothing. It fired again here: the first live acceptance run sat on one site
 * for nine minutes inside a single action with every sub-timeout set to 45s or
 * less. Timeouts on individual operations are not a bound on the whole; only a
 * race against the clock is.
 *
 * Set above the sum of a navigation (45s) and a settle (12s) so it never
 * pre-empts a slow-but-working page — it exists to convert a hang into a
 * recorded `timeout` failure, not to tighten anything. The abandoned work may
 * still be running in the browser afterwards; the next action re-observes, and
 * feat-010's caps end the episode if this keeps happening.
 */
export const ACTION_DEADLINE_MS = 75_000;
/** The same backstop for a snapshot, which also runs page code. */
export const SNAPSHOT_DEADLINE_MS = 30_000;

/** How far a directional scroll moves, as a fraction of the viewport. */
export const SCROLL_VIEWPORT_FRACTION = 0.8;

/** Hard cap on elements in one snapshot. Not a token budget — that is feat-007. */
export const MAX_SNAPSHOT_ELEMENTS = 300;

/**
 * Generic ways a page exposes something interactive.
 *
 * Roles, element types and ARIA attributes — the vocabulary of HTML itself,
 * applied uniformly. Nothing here names or exempts a site. This is a stand-in
 * for feat-006's accessibility-tree serializer, kept minimal on purpose: the
 * driver needs *some* id -> element mapping for `click` and `type` to mean
 * anything, and building the real one here would be feat-006's job done badly.
 */
export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='searchbox']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** One numbered element in the current step's registry. */
export interface ElementRef {
  /** Stable for the life of one snapshot. Reassigned on the next snapshot. */
  id: number;
  /**
   * The `MARK_ATTRIBUTE` value this element carries in the page.
   *
   * The registry stores a mark, **not** an `ElementHandle`, and this is a
   * correctness fix rather than a style choice — see `MARK_ATTRIBUTE`.
   */
  mark: number;
  /** ARIA role if present, else the tag name. Descriptive only. */
  role: string;
  /** Best-effort accessible name. feat-006 replaces this with the real one. */
  name: string;
  tag: string;
  /** Editable text field: what `type` can be aimed at. */
  editable: boolean;
  /** True when the element's box is inside the viewport at snapshot time. */
  inViewport: boolean;
}

/** Where a snapshot's elements come from. feat-006 supplies the arm-A provider. */
export type ElementProvider = (page: Page) => Promise<Omit<ElementRef, "id">[]>;

export interface DriverOptions {
  headless?: boolean;
  /** Mask the `HeadlessChrome` token. Permitted; nothing else is altered. */
  maskHeadless?: boolean;
  locale?: string;
  timezoneId?: string;
  viewport?: { width: number; height: number };
  elementProvider?: ElementProvider;
  actionTimeoutMs?: number;
  navigationTimeoutMs?: number;
  settleCapMs?: number;
  waitCapMs?: number;
  actionDeadlineMs?: number;
}

/** Exactly what the browser was configured with, for the trace and the README. */
export interface DriverConfig {
  headless: boolean;
  maskHeadless: boolean;
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };
  stockUserAgent: string;
  effectiveUserAgent: string;
  proxied: false;
}

interface SettleOutcome {
  ms: number;
  end: "stable" | "cap" | "cap-after-navigation" | "page-closed";
}

/**
 * What one action produced, before `execute` stamps timing and URLs on it.
 *
 * Declared rather than inferred so every branch is forced into the same shape —
 * an action that forgot to record `evidence` or `failure` is a type error here,
 * not a hole in a trace discovered at feat-020.
 */
interface Outcome {
  ok: boolean;
  failure: ActionFailure | null;
  detail: string;
  evidence: ActionEvidence;
  settle: SettleOutcome | null;
  terminal?: boolean;
}

/**
 * Reject if `work` has not settled within `ms`.
 *
 * The whole-operation bound that per-operation timeouts do not give you.
 */
function withDeadline<T>(ms: number, what: string, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} exceeded its ${ms}ms wall-clock backstop`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Wait until the page stops changing, or until `capMs`.
 *
 * The wrapper around `stepSettle`: a failed `evaluate` almost always means the
 * page navigated mid-poll, and treating that as settled is what made feat-004's
 * sweep classify redirecting sites as empty. A navigation is a reason to keep
 * waiting for the document that replaces it.
 */
async function settlePage(page: Page, capMs: number): Promise<SettleOutcome> {
  const started = Date.now();
  let state = initialSettleState;
  let misses = 0;
  while (Date.now() - started < capMs) {
    const seen = await page
      .evaluate(() => ({ len: (document.body?.innerText ?? "").length, ready: document.readyState }))
      .catch(() => null);
    if (seen === null) {
      if (page.isClosed()) return { ms: Date.now() - started, end: "page-closed" };
      misses += 1;
      await page.waitForTimeout(SETTLE_POLL_MS).catch(() => {});
      continue;
    }
    misses = 0;
    const next = stepSettle(state, seen, Date.now() - started);
    state = next.state;
    if (next.done) return { ms: Date.now() - started, end: "stable" };
    await page.waitForTimeout(SETTLE_POLL_MS).catch(() => {});
  }
  return { ms: Date.now() - started, end: misses > 0 ? "cap-after-navigation" : "cap" };
}

/**
 * The attribute the scan writes onto every element it numbers.
 *
 * **The registry holds marks, not `ElementHandle`s, and that is load-bearing.**
 * The handle version of this file cost roughly three CDP messages per element
 * per step — Playwright materialises a preview for every handle `$$` returns and
 * a `releaseObject` for every one it disposes — so a 300-element page produced
 * close to a thousand messages per observation. On a large results page, run
 * back to back with a click's actionability loop, that flood **broke the CDP
 * pipe**: Chromium logged `Connection terminated while reading from pipe` and
 * exited 0, and every action afterwards failed with "Target page, context or
 * browser has been closed". It reproduced on the same element of the same site
 * across runs and was invisible in the trace until the driver started recording
 * `browserConnected`.
 *
 * With a mark, a snapshot is ONE `evaluate` and an action resolves exactly one
 * locator. Two further properties fall out, both worth having on their own:
 * there is no handle bookkeeping to leak, and an element that the page has since
 * re-rendered simply fails to resolve — a clean `stale-element` instead of a
 * handle pointing at a node no longer in the document.
 *
 * Marks from the previous snapshot are cleared at the start of each scan, so
 * nothing accumulates in the DOM.
 */
export const MARK_ATTRIBUTE = "data-agent-el";

/**
 * The default element provider: visible interactive nodes, in DOM order.
 *
 * Visibility is computed in the page, because hidden duplicates of a control are
 * extremely common — a collapsed mobile header, a menu that is not open — and
 * feat-004 learned the hard way that taking the first match in DOM order picks
 * the invisible one.
 *
 * A stand-in for feat-006's accessibility-tree serializer, kept deliberately
 * minimal: the driver needs *some* id -> element mapping for `click` and `type`
 * to mean anything, and building the real one here would be feat-006's job done
 * badly. The seam that survives is the order contract below.
 */
export const domElementProvider: ElementProvider = async (page) => {
  const described = await page.evaluate(
    ({ selector, cap, attribute }) => {
      for (const stale of Array.from(document.querySelectorAll(`[${attribute}]`))) {
        stale.removeAttribute(attribute);
      }
      const out: { mark: number; role: string; name: string; tag: string; editable: boolean; inViewport: boolean }[] = [];
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (out.length >= cap) break;
        const node = el as HTMLElement;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        // `checkVisibility` over `getComputedStyle`: it answers the same
        // question (display, visibility, opacity, content-visibility) without
        // materialising a full style object per candidate. That mattered — the
        // per-candidate style read is the heaviest thing the driver asks a page
        // to do, and it is asked on every step of every episode.
        const check = (node as unknown as { checkVisibility?: (o: object) => boolean }).checkVisibility;
        if (typeof check === "function" && !check.call(node, { checkOpacity: true, checkVisibilityCSS: true })) {
          continue;
        }

        const tag = node.tagName.toLowerCase();
        const input = node as HTMLInputElement;
        const editable =
          (tag === "input" &&
            !["button", "submit", "reset", "checkbox", "radio", "file", "image"].includes(
              (input.type || "text").toLowerCase(),
            )) ||
          tag === "textarea" ||
          node.isContentEditable;

        // Best-effort accessible name, in the order assistive tech prefers.
        // Approximate on purpose: feat-006 computes the real one from the
        // accessibility tree, and this is the placeholder it replaces.
        const labelledBy = node.getAttribute("aria-labelledby");
        const labelledText = labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((ref) => document.getElementById(ref)?.textContent ?? "")
              .join(" ")
          : "";
        const name = (
          node.getAttribute("aria-label") ||
          labelledText ||
          input.placeholder ||
          node.getAttribute("title") ||
          node.getAttribute("alt") ||
          (node.innerText || node.textContent || "").trim() ||
          (tag === "input" ? input.value : "") ||
          node.getAttribute("name") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);

        const inViewport =
          rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;

        const mark = out.length;
        node.setAttribute(attribute, String(mark));
        out.push({ mark, role: node.getAttribute("role") || tag, name, tag, editable, inViewport });
      }
      return out;
    },
    { selector: INTERACTIVE_SELECTOR, cap: MAX_SNAPSHOT_ELEMENTS, attribute: MARK_ATTRIBUTE },
  );

  // One round trip, and nothing to clean up: the marks stay in the page and an
  // action resolves the one it needs, when it needs it.
  return described;
};

/**
 * A browser, a page, a numbered element registry and seven actions.
 *
 * One driver drives one episode. `launch()` owns the browser; `close()` releases
 * it. Nothing throws out of `execute()` — every failure comes back as an
 * `ActionResult` with `ok: false` and a typed `failure`, because a driver that
 * throws turns one bad step into a lost episode.
 */
export class Driver {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private page: Page,
    readonly config: DriverConfig,
    private readonly opts: Required<
      Pick<DriverOptions, "actionTimeoutMs" | "navigationTimeoutMs" | "settleCapMs" | "waitCapMs" | "actionDeadlineMs">
    > & {
      elementProvider: ElementProvider;
    },
  ) {
    this.watch(this.page);
    // Pages opened by the page itself — a `target="_blank"` result link is the
    // ordinary case. Registered after the first page exists so the event for
    // that page is not mistaken for a popup.
    this.context.on("page", (p) => {
      if (p !== this.page) this.popups.push(p);
    });
  }

  private elements: ElementRef[] = [];
  private byId = new Map<number, ElementRef>();
  /** Incremented per snapshot; ids are only valid for the current one. */
  private snapshotSeq = 0;
  /** Why the last snapshot came back empty, if it did. Null when it was fine. */
  private lastSnapshotDetail: string | null = null;
  private popups: Page[] = [];
  private lastDocStatus: number | null = null;
  /**
   * Set when Chromium's renderer dies under us.
   *
   * A crash makes every later action fail with "Target page, context or browser
   * has been closed" — text that reads exactly like a bad action. The first live
   * acceptance run produced three of those in a row and the trace could not say
   * which it was. feat-019 labels one `infra` and the other an agent failure, so
   * the driver records the browser's own event rather than leaving the taxonomy
   * to guess from prose.
   */
  private crashed = false;

  static async launch(options: DriverOptions = {}): Promise<Driver> {
    const headless = options.headless ?? true;
    const maskHeadless = options.maskHeadless ?? true;
    const locale = options.locale ?? LOCALE;
    const timezoneId = options.timezoneId ?? TIMEZONE_ID;
    const viewport = options.viewport ?? DEFAULT_VIEWPORT;

    const browser = await chromium.launch({ headless });

    // The mask is *derived* from the UA this browser actually reports, never
    // invented: a throwaway context reads it, `maskHeadlessUserAgent` drops the
    // token, and the version stays as-is. Substituting a headed build's version
    // would be fabricating a different client, which the policy does not permit.
    const probeContext = await browser.newContext();
    const probePage = await probeContext.newPage();
    const stockUserAgent = (await probePage.evaluate(() => navigator.userAgent)) as string;
    await probeContext.close();
    const effectiveUserAgent = maskHeadless ? maskHeadlessUserAgent(stockUserAgent) : stockUserAgent;

    const context = await browser.newContext({
      locale,
      timezoneId,
      viewport,
      ...(effectiveUserAgent !== stockUserAgent ? { userAgent: effectiveUserAgent } : {}),
    });
    const page = await context.newPage();

    return new Driver(
      browser,
      context,
      page,
      {
        headless,
        maskHeadless,
        locale,
        timezoneId,
        viewport,
        stockUserAgent,
        effectiveUserAgent,
        proxied: false,
      },
      {
        actionTimeoutMs: options.actionTimeoutMs ?? ACTION_TIMEOUT_MS,
        navigationTimeoutMs: options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS,
        settleCapMs: options.settleCapMs ?? SETTLE_CAP_MS,
        waitCapMs: options.waitCapMs ?? WAIT_CAP_MS,
        actionDeadlineMs: options.actionDeadlineMs ?? ACTION_DEADLINE_MS,
        elementProvider: options.elementProvider ?? domElementProvider,
      },
    );
  }

  /** The live page. feat-008 screenshots it; feat-006 serializes it. */
  activePage(): Page {
    return this.page;
  }

  url(): string {
    return this.page.url();
  }

  /** Which snapshot the current ids belong to. Ids from an older one are stale. */
  currentSnapshot(): number {
    return this.snapshotSeq;
  }

  /**
   * Re-number the page's interactive elements and return the registry.
   *
   * Ids are per-snapshot by design. Marks are rewritten from zero on every
   * scan, so carrying an id across a navigation would let `click 12` mean a
   * different element than the one the model was shown — the grounding failure
   * that is hardest to see in a trace. Ids restart at 1 every snapshot and the
   * snapshot number is recorded alongside them.
   */
  async snapshot(): Promise<ElementRef[]> {
    this.clearElements();
    const found = await withDeadline(SNAPSHOT_DEADLINE_MS, "snapshot", () => this.opts.elementProvider(this.page))
      .catch((err: unknown) => {
        // A snapshot that fails leaves an empty registry, so the next action
        // says "nothing is registered" rather than acting on a stale page.
        this.lastSnapshotDetail = err instanceof Error ? err.message.split("\n")[0]! : String(err);
        return [] as Omit<ElementRef, "id">[];
      });
    this.snapshotSeq += 1;
    this.elements = found.map((e, i) => ({ ...e, id: i + 1 }));
    this.byId = new Map(this.elements.map((e) => [e.id, e]));
    if (found.length > 0) this.lastSnapshotDetail = null;
    return this.elements;
  }

  /** Whether the browser is still there. feat-015 needs this between episodes. */
  isAlive(): boolean {
    return this.browser.isConnected() && !this.pageClosed() && !this.crashed;
  }

  /** Whether the renderer died under us. Distinguishes infra from agent error. */
  hasCrashed(): boolean {
    return this.crashed;
  }

  private pageClosed(): boolean {
    try {
      return this.page.isClosed();
    } catch {
      return true;
    }
  }

  /** Why the last snapshot was empty, if it was. For the trace. */
  snapshotFailure(): string | null {
    return this.lastSnapshotDetail;
  }

  /** The current registry without re-snapshotting. */
  currentElements(): ElementRef[] {
    return this.elements;
  }

  async close(): Promise<void> {
    this.clearElements();
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }

  /**
   * Run one action. Never throws.
   *
   * Every path records `urlBefore`/`urlAfter`, whether the page navigated, how
   * long settling took and a structured `evidence` bag — the raw material
   * feat-008 writes to the trace and feat-012's stuck detector reads.
   */
  async execute(action: Action): Promise<ActionResult> {
    const started = Date.now();
    const urlBefore = this.safeUrl();
    this.lastDocStatus = null;
    let outcome: Outcome;

    try {
      outcome = await withDeadline(this.opts.actionDeadlineMs, describeAction(action), () => this.dispatch(action));
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0]! : String(err);
      outcome = {
        ok: false,
        failure: classifyActionError(message),
        detail: `${describeAction(action)}: ${message}`,
        // A dead browser and a bad action produce error text that reads alike,
        // and they are not the same finding: one is feat-019's `infra`, the
        // other is an agent failure. Record the browser's own answer rather than
        // leaving the taxonomy to infer it from prose. The first live run needed
        // exactly this — three actions in a row failed with "Target page,
        // context or browser has been closed" and nothing in the trace said
        // whether the browser was still there.
        evidence: {
          browserConnected: this.browser.isConnected(),
          pageClosed: this.pageClosed(),
          pageCrashed: this.crashed,
        },
        settle: null,
      };
    }

    const urlAfter = this.safeUrl();
    return {
      action,
      ok: outcome.ok,
      failure: outcome.failure,
      detail: outcome.detail,
      urlBefore,
      urlAfter,
      navigated: urlAfter !== urlBefore,
      httpStatus: this.lastDocStatus,
      terminal: outcome.terminal ?? false,
      ms: Date.now() - started,
      settleMs: outcome.settle?.ms ?? null,
      settleEnd: outcome.settle?.end ?? null,
      evidence: outcome.evidence,
    };
  }

  // ---- the seven actions -------------------------------------------------

  private async dispatch(action: Action): Promise<Outcome> {
    switch (action.kind) {
      case "click":
        return this.doClick(action.id);
      case "type":
        return this.doType(action.id, action.text, action.submit);
      case "scroll":
        return action.target.by === "direction"
          ? this.doScrollDirection(action.target.direction)
          : this.doScrollToElement(action.target.id);
      case "navigate":
        return this.doNavigate(action.url);
      case "back":
        return this.doBack();
      case "wait":
        return this.doWait();
      case "answer":
        return this.doAnswer(action.text);
    }
  }

  private async doClick(id: number): Promise<Outcome> {
    const ref = this.byId.get(id);
    if (!ref) return this.unknownElement(id);
    const urlBefore = this.safeUrl();
    const target = this.locate(ref);
    await target.scrollIntoViewIfNeeded({ timeout: this.opts.actionTimeoutMs }).catch(() => {});
    await target.click({ timeout: this.opts.actionTimeoutMs });
    const settle = await this.afterInteraction();
    const popup = await this.adoptPopup();
    return {
      ok: true,
      failure: null,
      detail: `clicked #${id} <${ref.tag}> ${JSON.stringify(ref.name)}`,
      evidence: {
        elementRole: ref.role,
        elementName: ref.name,
        popupAdopted: popup,
        urlChanged: this.safeUrl() !== urlBefore,
      },
      settle,
    };
  }

  private async doType(id: number, text: string, submit: boolean): Promise<Outcome> {
    const ref = this.byId.get(id);
    if (!ref) return this.unknownElement(id);
    const target = this.locate(ref);
    await target.scrollIntoViewIfNeeded({ timeout: this.opts.actionTimeoutMs }).catch(() => {});

    // `fill` clears first, which is the documented contract. It refuses on
    // anything that is not a real editable, and some fields only become editable
    // once focused — so the fallback is the manual equivalent: focus, select
    // all, type. Both are generic; neither knows what page it is on.
    let method = "fill";
    try {
      await target.fill(text, { timeout: this.opts.actionTimeoutMs });
    } catch (err) {
      method = "click+keyboard";
      await target.click({ timeout: this.opts.actionTimeoutMs });
      await this.page.keyboard.press("ControlOrMeta+a").catch(() => {});
      await this.page.keyboard.press("Delete").catch(() => {});
      if (text.length > 0) await this.page.keyboard.type(text, { delay: 10 });
      void err;
    }

    if (submit) await target.press("Enter", { timeout: this.opts.actionTimeoutMs });
    const settle = submit ? await this.afterInteraction() : null;
    const popup = submit ? await this.adoptPopup() : false;
    return {
      ok: true,
      failure: null,
      detail: `typed ${JSON.stringify(text)} into #${id} <${ref.tag}>${submit ? " and submitted" : ""} (${method})`,
      evidence: { method, submitted: submit, chars: text.length, elementName: ref.name, popupAdopted: popup },
      settle,
    };
  }

  /**
   * Scroll the viewport, falling back to the largest scrollable container.
   *
   * The fallback is not a special case for any site: app layouts that scroll an
   * inner pane rather than the document are a whole genre, and without it every
   * such page reports a scroll that moved nothing. `movedPx` is recorded either
   * way, so a scroll that genuinely could not move — already at the bottom —
   * stays visible as evidence rather than being reported as a failure.
   */
  private async doScrollDirection(direction: "up" | "down"): Promise<Outcome> {
    const moved = await this.page.evaluate(
      ({ dir, fraction }) => {
        const delta = Math.round(window.innerHeight * fraction) * (dir === "down" ? 1 : -1);
        const before = window.scrollY;
        window.scrollBy(0, delta);
        if (window.scrollY !== before) return { movedPx: window.scrollY - before, container: "window" };

        // No document scroll: find the biggest element that can scroll and is
        // not already at its end in this direction.
        let best: HTMLElement | null = null;
        let bestArea = 0;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          if (el.scrollHeight - el.clientHeight <= 4) continue;
          const overflow = getComputedStyle(el).overflowY;
          if (overflow !== "auto" && overflow !== "scroll") continue;
          const rect = el.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > bestArea) {
            best = el;
            bestArea = area;
          }
        }
        if (!best) return { movedPx: 0, container: "window" };
        const wasAt = best.scrollTop;
        best.scrollBy(0, delta);
        return { movedPx: best.scrollTop - wasAt, container: "element" };
      },
      { dir: direction, fraction: SCROLL_VIEWPORT_FRACTION },
    );
    // Lazy-loading pages render on scroll; give them the same settle everything
    // else gets, so the next observation is not taken mid-render.
    const settle = await settlePage(this.page, this.opts.settleCapMs);
    return {
      ok: true,
      failure: null,
      detail: `scrolled ${direction} by ${moved.movedPx}px (${moved.container})`,
      evidence: { direction, movedPx: moved.movedPx, container: moved.container },
      settle,
    };
  }

  private async doScrollToElement(id: number): Promise<Outcome> {
    const ref = this.byId.get(id);
    if (!ref) return this.unknownElement(id);
    await this.locate(ref).scrollIntoViewIfNeeded({ timeout: this.opts.actionTimeoutMs });
    return {
      ok: true,
      failure: null,
      detail: `scrolled #${id} <${ref.tag}> into view`,
      evidence: { elementName: ref.name, elementRole: ref.role },
      settle: null,
    };
  }

  private async doNavigate(url: string): Promise<Outcome> {
    const response = await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: this.opts.navigationTimeoutMs,
    });
    this.lastDocStatus = response?.status() ?? this.lastDocStatus;
    const settle = await settlePage(this.page, this.opts.settleCapMs);
    this.clearElements();
    if (!response && this.safeUrl() === "about:blank") {
      return {
        ok: false,
        failure: "navigation-failed" as ActionFailure,
        detail: `navigate ${url}: no document`,
        evidence: { url },
        settle,
      };
    }
    return {
      ok: true,
      failure: null,
      detail: `navigated to ${this.safeUrl()} (HTTP ${this.lastDocStatus ?? "?"})`,
      evidence: { url, status: this.lastDocStatus },
      settle,
    };
  }

  /**
   * Go back one history entry.
   *
   * **A null response does not mean "no history".** Playwright returns the main
   * resource response, and a same-document entry — a hash change, a `pushState`
   * route, which is how most single-page apps navigate — commits no document and
   * so returns null even though the browser went back perfectly well. Reading
   * null as failure made `back` report `no-history` on every SPA in the pool: the
   * live run caught it doing exactly that on a site whose result click had only
   * changed the fragment, while the URL plainly showed it had moved.
   *
   * So the response is not the evidence; the URL is. Genuinely having nowhere to
   * go back to is the case where nothing moved at all.
   */
  private async doBack(): Promise<Outcome> {
    const before = this.safeUrl();
    const response = await this.page.goBack({
      waitUntil: "domcontentloaded",
      timeout: this.opts.navigationTimeoutMs,
    });
    const after = this.safeUrl();

    if (!response && after === before) {
      // Nothing moved. The action was wrong, not the page unready — which is
      // precisely the distinction feat-010 needs recorded here.
      return {
        ok: false,
        failure: "no-history" as ActionFailure,
        detail: "back: no previous entry in this tab's history",
        evidence: { url: before },
        settle: null,
      };
    }

    const sameDocument = response === null;
    if (response) this.lastDocStatus = response.status();
    const settle = await settlePage(this.page, this.opts.settleCapMs);
    this.clearElements();
    return {
      ok: true,
      failure: null,
      detail: sameDocument
        ? `went back to ${after} (same-document entry, no new document)`
        : `went back to ${after} (HTTP ${this.lastDocStatus})`,
      evidence: { status: sameDocument ? null : this.lastDocStatus, sameDocument },
      settle,
    };
  }

  private async doWait(): Promise<Outcome> {
    const settle = await settlePage(this.page, this.opts.waitCapMs);
    return {
      ok: true,
      failure: null,
      detail: `waited ${settle.ms}ms (${settle.end})`,
      evidence: { capMs: this.opts.waitCapMs, end: settle.end },
      settle,
    };
  }

  private async doAnswer(text: string): Promise<Outcome> {
    // Touches nothing. The episode ends here and feat-011 owns what that means.
    return {
      ok: true,
      failure: null,
      detail: `answered: ${text}`,
      evidence: { chars: text.length },
      settle: null,
      terminal: true,
    };
  }

  // ---- shared plumbing ---------------------------------------------------

  /** Resolve one registered element to a locator, at the moment it is needed. */
  private locate(ref: ElementRef): Locator {
    return this.page.locator(`[${MARK_ATTRIBUTE}="${ref.mark}"]`);
  }

  private unknownElement(id: number): Outcome {
    const available = this.elements.length;
    return {
      ok: false,
      failure: "unknown-element" as ActionFailure,
      detail:
        available === 0
          ? `no element #${id}: nothing is registered, snapshot() has not run since the last navigation`
          : `no element #${id}: snapshot ${this.snapshotSeq} has ids 1..${available}`,
      evidence: { requestedId: id, registeredIds: available, snapshot: this.snapshotSeq },
      settle: null,
    };
  }

  /** After a click or a submit: let a navigation start if one is coming, then settle. */
  private async afterInteraction(): Promise<SettleOutcome> {
    await this.page.waitForLoadState("domcontentloaded", { timeout: this.opts.settleCapMs }).catch(() => {});
    const settle = await settlePage(this.page, this.opts.settleCapMs);
    this.clearElements();
    return settle;
  }

  /**
   * Adopt a page the site opened for us.
   *
   * A result link with `target="_blank"` leaves the agent looking at the page it
   * came from while the content it asked for is in a tab it cannot see. Without
   * this the trace shows a click that "worked" and an observation that did not
   * change — a failure that reads as a model error and is not one.
   */
  private async adoptPopup(): Promise<boolean> {
    const alive = this.popups.filter((p) => !p.isClosed());
    this.popups = [];
    const adopted = alive[alive.length - 1];
    if (!adopted) return false;
    // Any others are noise (ad frames, interstitials); do not leave them open.
    for (const p of alive.slice(0, -1)) await p.close().catch(() => {});
    await adopted.waitForLoadState("domcontentloaded", { timeout: this.opts.settleCapMs }).catch(() => {});
    this.page = adopted;
    this.crashed = false;
    this.watch(adopted);
    await settlePage(adopted, this.opts.settleCapMs);
    this.clearElements();
    return true;
  }

  /** Record main-frame document statuses, so an action's HTTP status is its own. */
  private watch(page: Page): void {
    page.on("crash", () => {
      this.crashed = true;
    });
    page.on("response", (r) => {
      if (r.frame() === page.mainFrame() && r.request().resourceType() === "document") {
        this.lastDocStatus = r.status();
      }
    });
  }

  /**
   * Drop the registry after anything that can replace the DOM.
   *
   * Handles left behind would resolve to detached nodes and produce
   * `stale-element` — correct but late. Clearing means the next `click` says
   * "nothing is registered, snapshot() has not run", which points at the real
   * mistake in the loop rather than at the page.
   */
  private clearElements(): void {
    this.elements = [];
    this.byId = new Map();
  }

  private safeUrl(): string {
    try {
      return this.page.url();
    } catch {
      return "";
    }
  }
}
