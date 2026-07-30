/**
 * feat-005 — the bounded action space, as types and a strict parser.
 *
 * Seven actions, fixed, from `docs/ARCHITECTURE.md`: click, type, scroll,
 * navigate, back, wait, answer. Everything downstream is shaped by this file —
 * feat-006 must produce ids these actions can consume, feat-008 traces one of
 * these per step, feat-009 emits them and feat-010 decides whether a failure is
 * worth retrying. A missing or wrong action here is expensive later, so the
 * space is closed (`ACTION_KINDS`) and pinned by a test.
 *
 * Kept separate from `driver.ts` so the whole space can be tested without a
 * browser: the parser, the failure taxonomy and the "exactly seven" invariant
 * are pure functions over plain data.
 *
 * NO SITE-SPECIFIC CODE. Nothing here knows a hostname, and there is no place
 * for one: an action names an element by numeric id, never by selector, and the
 * only URL it carries is the one the caller asked to visit. `tests/actions.test.ts`
 * holds this line by grepping the source of this file, `driver.ts` and the
 * acceptance script for domain literals and brand names, the same way
 * feat-002's classifier test does.
 */

/** The closed action space. Adding an eighth action is a deliberate change. */
export const ACTION_KINDS = ["click", "type", "scroll", "navigate", "back", "wait", "answer"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export type ScrollDirection = "up" | "down";

/**
 * What a scroll is aimed at: the viewport in a direction, or one element.
 *
 * ARCHITECTURE.md specifies "direction, or element id" — exactly one, never
 * both, which a union makes unrepresentable rather than merely discouraged.
 */
export type ScrollTarget =
  | { by: "direction"; direction: ScrollDirection }
  | { by: "element"; id: number };

export type Action =
  | { kind: "click"; id: number }
  /** `submit` presses Enter after typing; see `TYPE_SUBMIT_DEFAULT`. */
  | { kind: "type"; id: number; text: string; submit: boolean }
  | { kind: "scroll"; target: ScrollTarget }
  | { kind: "navigate"; url: string }
  | { kind: "back" }
  | { kind: "wait" }
  /** Terminates the episode. feat-011 owns what happens next. */
  | { kind: "answer"; text: string };

/**
 * Whether `type` presses Enter when the caller did not say.
 *
 * **False.** Submitting by default is the more dangerous mistake: a multi-field
 * form filled one field at a time would be submitted half-empty on the first
 * `type`, and that failure looks like a planning error in the trace rather than
 * a driver default. A forgotten `submit: true` costs one extra step and is
 * visible in the trace as a step that typed and did nothing else.
 */
export const TYPE_SUBMIT_DEFAULT = false;

/** URL schemes `navigate` will accept. Everything else is a parse failure. */
export const ALLOWED_NAVIGATE_PROTOCOLS = ["http:", "https:"];

/**
 * Why an action did not do what it said.
 *
 * These names exist so feat-010 can keep its two paths distinct **from recorded
 * data rather than from a guess at the message text**: a `retry` is "the action
 * was right, the page was not ready" (`timeout`, `not-interactable`,
 * `stale-element`) and a `replan` is "the action was wrong" (`unknown-element`,
 * `no-history`, `bad-action`). feat-005 does not implement that mapping — it
 * only makes sure the distinction is recorded at the moment it is knowable.
 */
export type ActionFailure =
  /** The id was not in the current step's element registry. */
  | "unknown-element"
  /** The id was valid when serialized; the node is gone from the DOM now. */
  | "stale-element"
  /** Found, but never became clickable/editable within the action timeout. */
  | "not-interactable"
  /** The action itself timed out (navigation, load). */
  | "timeout"
  /** `navigate` reached no document. */
  | "navigation-failed"
  /** `back` with nothing to go back to. */
  | "no-history"
  /** The action was rejected before it touched the page. */
  | "bad-action"
  /** Anything else, including a dead browser. */
  | "driver-error";

/** Structured, per-action facts for the trace. Never prose. */
export type ActionEvidence = Record<string, string | number | boolean | null>;

export interface ActionResult {
  action: Action;
  ok: boolean;
  failure: ActionFailure | null;
  /** Human-readable, for logs. Machines read `failure` and `evidence`. */
  detail: string;
  urlBefore: string;
  urlAfter: string;
  navigated: boolean;
  /** Status of the main-frame document the action produced, if any. */
  httpStatus: number | null;
  /** True only for `answer`. */
  terminal: boolean;
  ms: number;
  settleMs: number | null;
  settleEnd: string | null;
  evidence: ActionEvidence;
}

export type ParseErrorCode =
  | "not-an-object"
  | "unknown-kind"
  | "missing-field"
  | "bad-field"
  | "unknown-field"
  | "bad-url"
  | "bad-json";

export type ParseResult = { ok: true; action: Action } | { ok: false; code: ParseErrorCode; error: string };

/** Fields each kind is allowed to carry, beyond `kind` itself. */
const ALLOWED_FIELDS: Record<ActionKind, string[]> = {
  click: ["id"],
  type: ["id", "text", "submit"],
  // Exactly one of these two, enforced below.
  scroll: ["direction", "id"],
  navigate: ["url"],
  back: [],
  wait: [],
  answer: ["text"],
};

const fail = (code: ParseErrorCode, error: string): ParseResult => ({ ok: false, code, error });

/** Element ids are non-negative integers, as issued by the serializer. */
function parseId(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

/**
 * Parse one action from a plain object, strictly.
 *
 * Strict means three things, each of which is a real defence rather than
 * fussiness:
 *
 * 1. **The kind must be one of the seven.** feat-009 logs the rejection rate as
 *    a finding, so silently coercing a near-miss would erase the measurement.
 * 2. **Unknown fields are rejected, not ignored.** `{kind:"click", selector:
 *    ".btn"}` is the failure mode this guards: an action that names an element
 *    by anything except an id from the current observation is outside the
 *    contract, and quietly dropping the extra field would let a model believe
 *    its selector was honoured.
 * 3. **A URL is validated before the browser sees it.** `javascript:` and
 *    `file:` are not navigation.
 *
 * Returns a result rather than throwing: a malformed action is a logged failed
 * step, never a crash (ARCHITECTURE.md).
 */
export function parseAction(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("not-an-object", `action must be a JSON object, got ${Array.isArray(raw) ? "array" : typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !(ACTION_KINDS as readonly string[]).includes(kind)) {
    return fail("unknown-kind", `kind must be one of ${ACTION_KINDS.join(", ")}, got ${JSON.stringify(kind)}`);
  }
  const k = kind as ActionKind;

  const extra = Object.keys(obj).filter((f) => f !== "kind" && !ALLOWED_FIELDS[k].includes(f));
  if (extra.length > 0) {
    return fail("unknown-field", `${k} does not take ${extra.join(", ")} (allowed: kind, ${ALLOWED_FIELDS[k].join(", ") || "none"})`);
  }

  switch (k) {
    case "click": {
      const id = parseId(obj.id);
      if (id === null) return fail("bad-field", `click needs an integer id >= 0, got ${JSON.stringify(obj.id)}`);
      return { ok: true, action: { kind: "click", id } };
    }
    case "type": {
      const id = parseId(obj.id);
      if (id === null) return fail("bad-field", `type needs an integer id >= 0, got ${JSON.stringify(obj.id)}`);
      if (obj.text === undefined) return fail("missing-field", "type needs text");
      // Empty text is legal: it means "clear this field", which is a real thing
      // an agent needs to do to fix its own earlier typing.
      if (typeof obj.text !== "string") return fail("bad-field", `type text must be a string, got ${typeof obj.text}`);
      if (obj.submit !== undefined && typeof obj.submit !== "boolean") {
        return fail("bad-field", `type submit must be a boolean, got ${typeof obj.submit}`);
      }
      return { ok: true, action: { kind: "type", id, text: obj.text, submit: obj.submit ?? TYPE_SUBMIT_DEFAULT } };
    }
    case "scroll": {
      const hasDirection = obj.direction !== undefined;
      const hasId = obj.id !== undefined;
      if (hasDirection === hasId) {
        return fail("bad-field", "scroll takes exactly one of direction or id");
      }
      if (hasDirection) {
        if (obj.direction !== "up" && obj.direction !== "down") {
          return fail("bad-field", `scroll direction must be up or down, got ${JSON.stringify(obj.direction)}`);
        }
        return { ok: true, action: { kind: "scroll", target: { by: "direction", direction: obj.direction } } };
      }
      const id = parseId(obj.id);
      if (id === null) return fail("bad-field", `scroll needs an integer id >= 0, got ${JSON.stringify(obj.id)}`);
      return { ok: true, action: { kind: "scroll", target: { by: "element", id } } };
    }
    case "navigate": {
      if (typeof obj.url !== "string") return fail("missing-field", "navigate needs a url string");
      let parsed: URL;
      try {
        parsed = new URL(obj.url);
      } catch {
        return fail("bad-url", `navigate url is not a URL: ${JSON.stringify(obj.url)}`);
      }
      if (!ALLOWED_NAVIGATE_PROTOCOLS.includes(parsed.protocol)) {
        return fail("bad-url", `navigate only accepts ${ALLOWED_NAVIGATE_PROTOCOLS.join(" and ")}, got ${parsed.protocol}`);
      }
      return { ok: true, action: { kind: "navigate", url: obj.url } };
    }
    case "back":
      return { ok: true, action: { kind: "back" } };
    case "wait":
      return { ok: true, action: { kind: "wait" } };
    case "answer": {
      if (typeof obj.text !== "string") return fail("missing-field", "answer needs a text string");
      // An empty answer terminates the episode with nothing to judge, which is
      // indistinguishable from a crash in the results table. Reject it here so
      // it is a logged malformed step instead.
      if (obj.text.trim().length === 0) return fail("bad-field", "answer text must not be empty");
      return { ok: true, action: { kind: "answer", text: obj.text } };
    }
  }
}

/** `parseAction` over a JSON string. Extracting JSON from prose is feat-009's. */
export function parseActionJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return fail("bad-json", `not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseAction(raw);
}

/** One-line rendering of an action, for logs and traces. */
export function describeAction(action: Action): string {
  switch (action.kind) {
    case "click":
      return `click #${action.id}`;
    case "type":
      return `type #${action.id} ${JSON.stringify(action.text)}${action.submit ? " + submit" : ""}`;
    case "scroll":
      return action.target.by === "direction" ? `scroll ${action.target.direction}` : `scroll to #${action.target.id}`;
    case "navigate":
      return `navigate ${action.url}`;
    case "back":
      return "back";
    case "wait":
      return "wait";
    case "answer":
      return `answer ${JSON.stringify(action.text)}`;
  }
}

/**
 * Map a Playwright error message onto the failure taxonomy.
 *
 * Pure and tested, because the alternative is feat-010 pattern-matching on
 * error prose at the point where it has to decide retry versus replan. Playwright
 * reports "element is not attached to the DOM" for a node that has gone away and
 * a `TimeoutError` for one that never became actionable, and those are different
 * decisions: the first means re-observe, the second means the page was not ready.
 */
export function classifyActionError(message: string): ActionFailure {
  const m = message.toLowerCase();
  if (m.includes("not attached to the dom") || m.includes("element is detached") || m.includes("execution context was destroyed")) {
    return "stale-element";
  }
  if (m.includes("net::") || m.includes("navigation failed") || m.includes("err_")) return "navigation-failed";
  if (m.includes("timeout") || m.includes("exceeded")) {
    // A timeout waiting on actionability is a page-not-ready signal; Playwright
    // spells out which check it was still waiting for.
    if (m.includes("not visible") || m.includes("not enabled") || m.includes("not editable") || m.includes("intercepts pointer events")) {
      return "not-interactable";
    }
    return "timeout";
  }
  if (m.includes("not visible") || m.includes("not enabled") || m.includes("not editable")) return "not-interactable";
  if (m.includes("closed") || m.includes("crashed") || m.includes("disconnected")) return "driver-error";
  return "driver-error";
}
