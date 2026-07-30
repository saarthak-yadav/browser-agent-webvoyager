/**
 * The feat-003 decay-audit sampler, as a pure function.
 *
 * Lives apart from `scripts/sample-decay-tasks.ts` so it can be tested without
 * reading or writing files. The reproducibility claim in docs/DECISIONS.md
 * ("re-running reproduces the sample byte-for-byte") is only checkable if the
 * draw is exercisable in isolation — `tests/decay-sample.test.ts` pins it to the
 * committed `tasks/decay-sample.json`.
 *
 * Nothing here touches the clock, the filesystem, the network, or Math.random.
 */

export interface Task {
  web_name: string;
  id: string;
  ques: string;
  web: string;
}

/** Seed the feat-003 audit was drawn with. Changing it invalidates that audit. */
export const DECAY_SAMPLE_SEED = 20260730;
export const DECAY_SAMPLE_SIZE = 20;

/** mulberry32 — small, deterministic, and reproducible across runtimes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DecaySample {
  /** Sites in the order they were drawn from, alphabetical. */
  siteNames: string[];
  /** The sample, sorted by site then id. */
  picked: Task[];
}

/**
 * Draw the audit sample.
 *
 * 1. Group by site, sites alphabetical, tasks ordered by numeric id suffix, so
 *    the input order does not depend on the order of the source file.
 * 2. Draw exactly 1 task per site — every site is represented, because decay is
 *    expected to be site-specific and a proportional sample of 20 would let a
 *    small site vanish.
 * 3. Top up to `sampleSize` from the global pool of not-yet-drawn tasks.
 *
 * The PRNG is consumed in that exact order: one call per site, then one call per
 * top-up draw. Reordering any step changes the sample.
 */
export function drawDecaySample(
  tasks: Task[],
  opts: { seed?: number; sampleSize?: number } = {},
): DecaySample {
  const seed = opts.seed ?? DECAY_SAMPLE_SEED;
  const sampleSize = opts.sampleSize ?? DECAY_SAMPLE_SIZE;

  const rand = mulberry32(seed);
  /** Draw one element, removing it from `pool`. */
  const draw = <T>(pool: T[]): T => {
    const i = Math.floor(rand() * pool.length);
    const [item] = pool.splice(i, 1);
    // Only reachable if the caller asks for more tasks than exist; the audit
    // sample must never be silently short.
    if (item === undefined) throw new Error("drawDecaySample: drew from an empty pool");
    return item;
  };

  const bySite = new Map<string, Task[]>();
  for (const t of tasks) {
    const group = bySite.get(t.web_name);
    if (group) group.push(t);
    else bySite.set(t.web_name, [t]);
  }

  const siteNames = [...bySite.keys()].sort();
  for (const s of siteNames) {
    bySite.get(s)!.sort((a, b) => {
      const n = (x: string) => Number(x.split("--")[1] ?? 0);
      return n(a.id) - n(b.id);
    });
  }

  const picked: Task[] = [];
  const remaining: Task[] = [];
  for (const site of siteNames) {
    const pool = [...bySite.get(site)!];
    picked.push(draw(pool));
    remaining.push(...pool);
  }

  // Top up from everything not already drawn, in a fixed order.
  remaining.sort((a, b) => a.id.localeCompare(b.id));
  while (picked.length < sampleSize) picked.push(draw(remaining));

  picked.sort((a, b) => a.web_name.localeCompare(b.web_name) || a.id.localeCompare(b.id));

  return { siteNames, picked };
}

/** Parse the WebVoyager JSONL task set. One task per non-blank line. */
export function parseTaskJsonl(text: string): Task[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Task);
}
