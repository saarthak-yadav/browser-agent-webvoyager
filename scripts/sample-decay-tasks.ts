/**
 * feat-003 — draw the task-decay audit sample.
 *
 * Deterministic and reproducible: a fixed-seed PRNG, no Math.random, so anyone
 * re-running this gets byte-identical output and can check the audit was not
 * drawn to flatter the result.
 *
 * Selection rule
 * --------------
 * 1. Group the 643 WebVoyager tasks by site (15 sites, 41-46 tasks each).
 * 2. Sort each group by task id so the input order is fixed.
 * 3. Draw exactly 1 task per site — every site is represented, because decay is
 *    expected to be site-specific and a proportional sample would let a small
 *    site vanish.
 * 4. Draw the remaining 5 from the global pool of not-yet-drawn tasks, so the
 *    sample is 20 without over-weighting any site by hand.
 *
 * Run: bun run scripts/sample-decay-tasks.ts
 * Writes: tasks/decay-sample.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const SEED = 20260730;
const SAMPLE_SIZE = 20;
const SOURCE = "tasks/WebVoyager_data.jsonl";
const OUT = "tasks/decay-sample.json";

interface Task {
  web_name: string;
  id: string;
  ques: string;
  web: string;
}

/** mulberry32 — small, deterministic, and reproducible across runtimes. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
/** Draw one element, removing it from `pool`. */
function draw<T>(pool: T[]): T {
  const i = Math.floor(rand() * pool.length);
  return pool.splice(i, 1)[0];
}

const tasks: Task[] = readFileSync(SOURCE, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Task);

const bySite = new Map<string, Task[]>();
for (const t of tasks) {
  if (!bySite.has(t.web_name)) bySite.set(t.web_name, []);
  bySite.get(t.web_name)!.push(t);
}
// Fixed input order: sites alphabetical, tasks by numeric suffix within site.
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

// Top up to SAMPLE_SIZE from everything not already drawn, in a fixed order.
remaining.sort((a, b) => a.id.localeCompare(b.id));
while (picked.length < SAMPLE_SIZE) picked.push(draw(remaining));

picked.sort((a, b) => a.web_name.localeCompare(b.web_name) || a.id.localeCompare(b.id));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      seed: SEED,
      source: SOURCE,
      totalTasks: tasks.length,
      sampleSize: picked.length,
      rule: "1 task per site (15 sites) + 5 more drawn from the remaining pool, mulberry32 seeded 20260730, sites alphabetical and tasks id-ordered before drawing",
      tasks: picked,
    },
    null,
    2,
  ) + "\n",
);

console.log(`${tasks.length} tasks in ${siteNames.length} sites -> sample of ${picked.length}\n`);
for (const t of picked) console.log(`${t.id.padEnd(24)} ${t.ques}`);
console.log(`\nWrote ${OUT}`);
