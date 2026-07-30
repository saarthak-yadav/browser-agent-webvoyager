/**
 * feat-003 — draw the task-decay audit sample.
 *
 * Deterministic and reproducible: a fixed-seed PRNG, no Math.random, so anyone
 * re-running this gets byte-identical output and can check the audit was not
 * drawn to flatter the result.
 *
 * The selection rule and the PRNG live in `scripts/lib/decay-sample.ts` so they
 * can be tested without touching the filesystem; this file is the I/O shell.
 * See `tests/decay-sample.test.ts`, which pins the draw to `tasks/decay-sample.json`.
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
import {
  DECAY_SAMPLE_SEED,
  DECAY_SAMPLE_SIZE,
  drawDecaySample,
  parseTaskJsonl,
} from "./lib/decay-sample.ts";

const SEED = DECAY_SAMPLE_SEED;
const SAMPLE_SIZE = DECAY_SAMPLE_SIZE;
const SOURCE = "tasks/WebVoyager_data.jsonl";
const OUT = "tasks/decay-sample.json";

const tasks = parseTaskJsonl(readFileSync(SOURCE, "utf8"));
const { siteNames, picked } = drawDecaySample(tasks, { seed: SEED, sampleSize: SAMPLE_SIZE });

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
