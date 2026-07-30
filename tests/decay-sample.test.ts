/**
 * The feat-003 sampler must reproduce its recorded sample exactly.
 *
 * docs/DECISIONS.md says the decay audit was drawn with seed 20260730 and that
 * re-running reproduces it byte-for-byte. That sentence is what makes the audit
 * checkable by a reader — 14 still-valid / 2 changed / 4 impossible only means
 * something if the 20 tasks were not chosen to flatter the result. This test is
 * the guard on that claim: if the draw ever changes, the recorded audit stops
 * describing the sample in tasks/decay-sample.json and must be re-run.
 *
 * No network. Reads the committed task set and the committed sample only.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DECAY_SAMPLE_SEED,
  DECAY_SAMPLE_SIZE,
  drawDecaySample,
  mulberry32,
  parseTaskJsonl,
  type Task,
} from "../scripts/lib/decay-sample.ts";

const tasks = parseTaskJsonl(readFileSync("tasks/WebVoyager_data.jsonl", "utf8"));
const recorded = JSON.parse(readFileSync("tasks/decay-sample.json", "utf8")) as {
  seed: number;
  sampleSize: number;
  totalTasks: number;
  tasks: Task[];
};

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(DECAY_SAMPLE_SEED);
    const b = mulberry32(DECAY_SAMPLE_SEED);
    const first = [a(), a(), a(), a(), a()];
    const second = [b(), b(), b(), b(), b()];
    expect(first).toEqual(second);
  });

  it("returns values in [0, 1)", () => {
    const rand = mulberry32(DECAY_SAMPLE_SEED);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("gives a different stream for a different seed", () => {
    // Guards against a broken seed path that would make every audit identical.
    const seeded = mulberry32(DECAY_SAMPLE_SEED)();
    const other = mulberry32(DECAY_SAMPLE_SEED + 1)();
    expect(seeded).not.toBe(other);
  });
});

describe("the recorded feat-003 sample", () => {
  it("was drawn from the task set now in the repo", () => {
    // If the source JSONL changed, reproducing the draw proves nothing.
    expect(tasks.length).toBe(recorded.totalTasks);
    expect(recorded.seed).toBe(DECAY_SAMPLE_SEED);
    expect(recorded.sampleSize).toBe(DECAY_SAMPLE_SIZE);
  });

  it("is reproduced exactly by seed 20260730", () => {
    const { picked } = drawDecaySample(tasks, {
      seed: DECAY_SAMPLE_SEED,
      sampleSize: DECAY_SAMPLE_SIZE,
    });
    // Compared by full task object, not just id, so a shifted question text or
    // start URL is caught too.
    expect(picked).toEqual(recorded.tasks);
  });

  it("is reproduced identically on a second, independent draw", () => {
    const first = drawDecaySample(tasks).picked.map((t) => t.id);
    const second = drawDecaySample(tasks).picked.map((t) => t.id);
    expect(second).toEqual(first);
  });
});

describe("the sampling rule", () => {
  it("draws 20 distinct tasks", () => {
    const { picked } = drawDecaySample(tasks);
    expect(picked).toHaveLength(DECAY_SAMPLE_SIZE);
    expect(new Set(picked.map((t) => t.id)).size).toBe(DECAY_SAMPLE_SIZE);
  });

  it("covers every site at least once", () => {
    const { siteNames, picked } = drawDecaySample(tasks);
    expect(siteNames).toHaveLength(15);
    const covered = new Set(picked.map((t) => t.web_name));
    expect([...covered].sort()).toEqual([...siteNames].sort());
  });

  it("only picks tasks that exist in the source set", () => {
    const ids = new Set(tasks.map((t) => t.id));
    for (const t of drawDecaySample(tasks).picked) expect(ids.has(t.id)).toBe(true);
  });

  it("does not depend on the order of the input file", () => {
    // The rule sorts sites and ids before drawing, so a reshuffled source file
    // must give the same sample. If this fails, the audit is not reproducible
    // by anyone who regenerates the JSONL from the WebVoyager repo.
    const rand = mulberry32(1);
    const shuffled = [...tasks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const a = shuffled[i]!;
      const b = shuffled[j]!;
      shuffled[i] = b;
      shuffled[j] = a;
    }
    expect(drawDecaySample(shuffled).picked).toEqual(recorded.tasks);
  });

  it("changes the sample when the seed changes", () => {
    const other = drawDecaySample(tasks, { seed: DECAY_SAMPLE_SEED + 1 }).picked.map((t) => t.id);
    expect(other).not.toEqual(recorded.tasks.map((t) => t.id));
  });

  it("throws rather than returning a short sample", () => {
    const oneSite = tasks.filter((t) => t.web_name === (tasks[0]?.web_name ?? ""));
    // Asking for more than the pool holds must fail loudly: a silently short
    // audit sample would change the denominator without anyone noticing.
    expect(() => drawDecaySample(oneSite, { sampleSize: oneSite.length + 1 })).toThrow(
      /empty pool/,
    );
  });
});
