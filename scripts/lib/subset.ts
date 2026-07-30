/**
 * feat-004 — the Online-Mind2Web subset selection rule, as a pure function.
 *
 * Lives apart from `scripts/select-subset.ts` so the draw can be tested without
 * reading or writing files, the same split feat-003 uses for
 * `lib/decay-sample.ts`. The reproducibility claim in docs/DECISIONS.md is only
 * checkable if the draw is exercisable in isolation.
 *
 * Nothing here touches the clock, the filesystem, the network, or Math.random.
 *
 * THE RULE, in full, so a reader can reproduce it without reading the code:
 *
 *   1. Start from the 300 canonical Online-Mind2Web tasks.
 *   2. Drop every task whose site the feat-004 first-action audit recorded as
 *      `blocked`. The dropped ids and their sites are published, never silently
 *      removed (docs/DECISIONS.md, 2026-07-30 blocked-task decision).
 *   3. Partition what remains by the benchmark's own `level` field — the single
 *      stratification axis. See `docs/SUBSET-RULE.md` for why that axis and what
 *      it gives up.
 *   4. Allocate the target size across the levels in proportion to their
 *      eligible counts, by the largest-remainder method, so the parts sum to the
 *      target exactly with no hand-adjustment.
 *   5. Within each level, sort the eligible tasks by `task_id` and draw the
 *      allocated number without replacement with mulberry32, consuming the
 *      stream in a fixed level order.
 *   6. Sort the result by level then `task_id`.
 *
 * There is deliberately NO second axis and no per-site cap. The spec asks for
 * one axis; a cap would smuggle in a second one. The site concentration the
 * draw inherits is reported as a property of the subset instead of engineered
 * away — see `siteCounts` below.
 */
import { mulberry32 } from "./decay-sample.ts";

/** One task as the canonical Online-Mind2Web JSON stores it. */
export interface Om2wTask {
  task_id: string;
  confirmed_task: string;
  website: string;
  /** Human reference trajectory length, in steps. */
  reference_length: number;
  /** The benchmark's own difficulty label. The stratification axis. */
  level: string;
}

/**
 * Seed for the subset draw. Same date-derived value feat-003 used, but a
 * different draw over a different pool — reusing the constant does not make the
 * two samples related. Changing it invalidates the committed subset.
 */
export const SUBSET_SEED = 20260730;
export const SUBSET_TARGET_SIZE = 100;

/**
 * Fixed level order. The PRNG stream is consumed in this order, so changing it
 * changes the subset. Levels found in the data but not listed here are appended
 * in sort order rather than dropped — a silently ignored level would be a
 * silently shrunken denominator.
 */
export const LEVEL_ORDER = ["easy", "medium", "hard"];

/**
 * Normalise a task's `website` to a host key.
 *
 * The canonical file stores full start URLs, and the same site appears under
 * more than one URL string (trailing paths, `www.` prefixes). Reachability is a
 * property of the host, not of the URL string, so the audit and the site counts
 * both key on this. Purely mechanical — no hostname is special-cased.
 */
export function siteKey(website: string): string {
  let host: string;
  try {
    host = new URL(website).hostname.toLowerCase();
  } catch {
    // Not a parseable URL. Fall back to the raw string rather than guessing, so
    // a malformed row is visible in the output instead of being merged away.
    return website.trim().toLowerCase();
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Split `total` across `weights` in proportion, by the largest-remainder method.
 * `weights` must be non-negative integers (they are stratum sizes).
 *
 * Floor every share, then hand the leftover units to the largest remainders,
 * ties broken by earlier index — which is why the caller passes levels in a
 * fixed order. Deterministic, and the parts sum to `total` exactly.
 *
 * The remainders are compared as **exact integers**, `(w * total) mod sum`, not
 * as floating-point fractions. This is not fussiness. The real allocation is
 * 80/143/77 of 300 scaled to 100, where all three fractional parts are exactly
 * 2/3 — mathematically a three-way tie that the documented rule breaks by index.
 * In floating point those three thirds are three *different* values, and the
 * order they sort into is an artefact of rounding, not of the rule. Written that
 * way this returned [27, 47, 26] where the rule says [27, 48, 25], and it could
 * differ again on another engine. A subset that is reproducible only on one
 * machine is not reproducible.
 */
export function largestRemainder(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);

  const base = weights.map((w) => Math.floor((w * total) / sum));
  let left = total - base.reduce((a, b) => a + b, 0);

  const order = weights
    .map((w, i) => ({ i, rem: (w * total) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);

  const out = [...base];
  for (const { i } of order) {
    if (left <= 0) break;
    // Never allocate a stratum more tasks than it has.
    if ((out[i] ?? 0) >= (weights[i] ?? 0)) continue;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

export interface SubsetOptions {
  seed?: number;
  targetSize?: number;
  /** Site keys the first-action audit recorded as blocked. */
  blockedSites?: Iterable<string>;
}

export interface StratumReport {
  level: string;
  /** Tasks at this level in the full set, before exclusions. */
  inFullSet: number;
  /** Tasks at this level still eligible after blocked sites are dropped. */
  eligible: number;
  /** How many the largest-remainder allocation gave this level. */
  allocated: number;
}

export interface SubsetResult {
  picked: Om2wTask[];
  strata: StratumReport[];
  /** Tasks dropped because their site is blocked, in task_id order. */
  excluded: Om2wTask[];
  /** Blocked site keys that actually removed at least one task, sorted. */
  excludedSites: string[];
  /** Distinct site keys represented in `picked`, sorted. */
  subsetSites: string[];
  /** site key -> tasks contributed to `picked`, for the concentration report. */
  siteCounts: Record<string, number>;
}

/**
 * Draw the scored subset. See the rule in this file's header.
 *
 * Throws rather than returning a short subset: a benchmark denominator that is
 * quietly smaller than it claims is the exact failure this project exists to
 * avoid.
 */
export function drawSubset(tasks: Om2wTask[], opts: SubsetOptions = {}): SubsetResult {
  const seed = opts.seed ?? SUBSET_SEED;
  const targetSize = opts.targetSize ?? SUBSET_TARGET_SIZE;
  const blocked = new Set(opts.blockedSites ?? []);

  const eligible: Om2wTask[] = [];
  const excluded: Om2wTask[] = [];
  const excludedSites = new Set<string>();
  for (const t of tasks) {
    const key = siteKey(t.website);
    if (blocked.has(key)) {
      excluded.push(t);
      excludedSites.add(key);
    } else {
      eligible.push(t);
    }
  }

  if (eligible.length < targetSize) {
    throw new Error(
      `drawSubset: ${eligible.length} eligible tasks cannot fill a subset of ${targetSize}`,
    );
  }

  // Levels in the fixed order, then any unexpected level appended in sort order
  // so it is represented rather than dropped.
  const present = new Set(tasks.map((t) => t.level));
  const levels = [
    ...LEVEL_ORDER.filter((l) => present.has(l)),
    ...[...present].filter((l) => !LEVEL_ORDER.includes(l)).sort(),
  ];

  const byLevel = new Map<string, Om2wTask[]>(levels.map((l) => [l, []]));
  for (const t of eligible) byLevel.get(t.level)!.push(t);

  const allocation = largestRemainder(
    levels.map((l) => byLevel.get(l)!.length),
    targetSize,
  );

  const rand = mulberry32(seed);
  const picked: Om2wTask[] = [];
  const strata: StratumReport[] = [];

  for (const [i, level] of levels.entries()) {
    // Sorted by id, so the draw does not depend on the order of the source file.
    const pool = [...byLevel.get(level)!].sort((a, b) => a.task_id.localeCompare(b.task_id));
    const want = allocation[i] ?? 0;
    for (let n = 0; n < want; n++) {
      const j = Math.floor(rand() * pool.length);
      const [item] = pool.splice(j, 1);
      // Unreachable while largestRemainder caps each stratum at its own size;
      // kept so a future change to the allocator fails loudly instead of short.
      if (item === undefined) throw new Error(`drawSubset: drew from an empty pool at ${level}`);
      picked.push(item);
    }
    strata.push({
      level,
      inFullSet: tasks.filter((t) => t.level === level).length,
      eligible: byLevel.get(level)!.length,
      allocated: want,
    });
  }

  if (picked.length !== targetSize) {
    throw new Error(`drawSubset: drew ${picked.length}, wanted ${targetSize}`);
  }

  const levelRank = (l: string) => {
    const i = levels.indexOf(l);
    return i === -1 ? levels.length : i;
  };
  picked.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.task_id.localeCompare(b.task_id));
  excluded.sort((a, b) => a.task_id.localeCompare(b.task_id));

  const siteCounts: Record<string, number> = {};
  for (const t of picked) {
    const k = siteKey(t.website);
    siteCounts[k] = (siteCounts[k] ?? 0) + 1;
  }

  return {
    picked,
    strata,
    excluded,
    excludedSites: [...excludedSites].sort(),
    subsetSites: Object.keys(siteCounts).sort(),
    siteCounts,
  };
}

/** Parse the canonical Online-Mind2Web JSON: a bare array of task objects. */
export function parseOm2wJson(text: string): Om2wTask[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("parseOm2wJson: expected a JSON array of tasks");
  return parsed.map((row, i) => {
    const t = row as Partial<Om2wTask>;
    for (const field of ["task_id", "confirmed_task", "website", "level"] as const) {
      if (typeof t[field] !== "string") {
        throw new Error(`parseOm2wJson: row ${i} is missing a string \`${field}\``);
      }
    }
    if (typeof t.reference_length !== "number") {
      throw new Error(`parseOm2wJson: row ${i} is missing a numeric \`reference_length\``);
    }
    return t as Om2wTask;
  });
}
