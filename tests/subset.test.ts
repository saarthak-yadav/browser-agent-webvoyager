/**
 * The feat-004 subset draw must be reproducible, and must be reproducible for
 * the reason docs/SUBSET-RULE.md claims.
 *
 * The rule is the deliverable — "~100 tasks stratified across Online-Mind2Web"
 * only means something if a reader can re-derive the same 100 tasks and check
 * they were not chosen to flatter the pass rate. These tests are the guard on
 * the three properties that claim rests on: the allocation is proportional and
 * sums exactly to the target, the draw depends only on the seed and the input
 * set (not on the source file's row order), and blocked sites are removed
 * before the draw rather than after.
 *
 * No network, no filesystem beyond the committed artifacts.
 */
import { describe, expect, it } from "bun:test";
import {
  LEVEL_ORDER,
  SUBSET_SEED,
  drawSubset,
  largestRemainder,
  parseOm2wJson,
  siteKey,
  type Om2wTask,
} from "../scripts/lib/subset.ts";

/**
 * A synthetic stand-in for the benchmark: the same shape and the same awkward
 * properties (uneven level counts, one site carrying many tasks, a site
 * appearing under two URL spellings). Synthetic on purpose — these tests pin
 * the rule, and must not start passing or failing because the maintainers
 * updated a task.
 */
function fixture(): Om2wTask[] {
  const tasks: Om2wTask[] = [];
  const push = (site: string, level: string, n: number, refLen: number) => {
    for (let i = 0; i < n; i++) {
      tasks.push({
        task_id: `${site.replace(/\W/g, "")}-${level}-${String(i).padStart(3, "0")}`,
        confirmed_task: `do thing ${i} on ${site}`,
        website: site,
        reference_length: refLen,
        level,
      });
    }
  };
  push("https://www.bigshop.com/", "easy", 12, 4);
  push("https://bigshop.com/deals", "medium", 6, 8); // same host, different URL
  push("https://a.example/", "easy", 8, 3);
  push("https://b.example/", "medium", 20, 9);
  push("https://c.example/", "hard", 14, 18);
  push("https://d.example/", "hard", 5, 20);
  push("https://blocked.example/", "medium", 9, 7);
  push("https://blocked.example/x", "hard", 6, 16);
  return tasks;
}

describe("siteKey", () => {
  it("collapses www and path variants of one host", () => {
    // The audit is keyed on the host, so two URL spellings of one site must not
    // become two independently-audited sites.
    expect(siteKey("https://www.bigshop.com/")).toBe("bigshop.com");
    expect(siteKey("https://bigshop.com/deals")).toBe("bigshop.com");
  });

  it("lowercases and keeps distinct hosts distinct", () => {
    expect(siteKey("https://A.Example/")).toBe("a.example");
    expect(siteKey("https://b.example/")).not.toBe(siteKey("https://a.example/"));
  });

  it("keeps an unparseable website visible instead of merging it away", () => {
    expect(siteKey("not a url")).toBe("not a url");
  });
});

describe("largestRemainder", () => {
  it("sums to the target exactly", () => {
    for (const total of [10, 37, 100, 101]) {
      expect(largestRemainder([80, 143, 77], total).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("allocates in proportion", () => {
    // 80/143/77 of 300, scaled to 100, is 26.67 / 47.67 / 25.67.
    expect(largestRemainder([80, 143, 77], 100)).toEqual([27, 48, 25]);
  });

  it("breaks an exact tie by index, not by floating-point noise", () => {
    // All three remainders here are exactly 2/3. Computed in floating point they
    // sort by rounding artefact and this returns [27, 47, 26]; computed as exact
    // integers the documented index tie-break applies and it returns [27, 48, 25].
    // A subset reproducible only on one engine is not reproducible.
    expect(largestRemainder([80, 143, 77], 100)).toEqual([27, 48, 25]);
    expect(largestRemainder([2, 2, 2], 5)).toEqual([2, 2, 1]);
    expect(largestRemainder([10, 10, 10, 10], 6)).toEqual([2, 2, 1, 1]);
  });

  it("under-allocates rather than over-allocating when the target exceeds the pool", () => {
    // The per-stratum cap wins over the total. That is the safe direction, and
    // drawSubset never reaches it — it refuses upfront when the eligible pool
    // cannot fill the target — but the boundary is pinned so the guarantee is
    // "never more than exists", not "always exactly total".
    expect(largestRemainder([1, 1, 1], 5)).toEqual([1, 1, 1]);
  });

  it("never gives a stratum more than it has", () => {
    const out = largestRemainder([1, 1, 50], 10);
    expect(out[0]!).toBeLessThanOrEqual(1);
    expect(out[1]!).toBeLessThanOrEqual(1);
  });

  it("is total-preserving even when a cap bites", () => {
    expect(largestRemainder([1, 1, 50], 10).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("handles an all-zero weight vector without dividing by zero", () => {
    expect(largestRemainder([0, 0, 0], 5)).toEqual([0, 0, 0]);
  });
});

describe("drawSubset — the selection rule", () => {
  const tasks = fixture();

  it("draws exactly the target size", () => {
    expect(drawSubset(tasks, { targetSize: 30 }).picked).toHaveLength(30);
  });

  it("is reproducible for a given seed", () => {
    const a = drawSubset(tasks, { targetSize: 30, seed: SUBSET_SEED });
    const b = drawSubset(tasks, { targetSize: 30, seed: SUBSET_SEED });
    expect(a.picked).toEqual(b.picked);
  });

  it("does not depend on the order of the source file", () => {
    // The canonical file is maintained upstream and its row order can change
    // between revisions without any task changing. The draw must not move.
    const shuffled = [...tasks];
    let s = 7;
    for (let i = shuffled.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) >>> 0;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    expect(drawSubset(shuffled, { targetSize: 30 }).picked).toEqual(
      drawSubset(tasks, { targetSize: 30 }).picked,
    );
  });

  it("gives a different subset for a different seed", () => {
    const a = drawSubset(tasks, { targetSize: 30, seed: SUBSET_SEED }).picked.map((t) => t.task_id);
    const b = drawSubset(tasks, { targetSize: 30, seed: SUBSET_SEED + 1 }).picked.map((t) => t.task_id);
    expect(a).not.toEqual(b);
  });

  it("matches the level mix of the eligible pool", () => {
    // This is the whole claim of the axis: the subset's difficulty mix is the
    // benchmark's, so the pass rate is not inflated by over-sampling easy tasks.
    const r = drawSubset(tasks, { targetSize: 40 });
    const drawn = (level: string) => r.picked.filter((t) => t.level === level).length;
    for (const s of r.strata) {
      expect(drawn(s.level)).toBe(s.allocated);
      const expected = (s.eligible / tasks.length) * 40;
      expect(Math.abs(s.allocated - expected)).toBeLessThanOrEqual(1);
    }
  });

  it("consumes levels in the fixed order, so the stream is pinned", () => {
    expect(drawSubset(tasks, { targetSize: 30 }).strata.map((s) => s.level)).toEqual(LEVEL_ORDER);
  });

  it("never draws the same task twice", () => {
    const picked = drawSubset(tasks, { targetSize: 60 }).picked;
    expect(new Set(picked.map((t) => t.task_id)).size).toBe(picked.length);
  });

  it("throws rather than returning a short subset", () => {
    // A denominator quietly smaller than it claims is the exact failure this
    // project exists to avoid.
    expect(() => drawSubset(tasks, { targetSize: tasks.length + 1 })).toThrow(/cannot fill/);
  });
});

describe("drawSubset — blocked-site exclusion", () => {
  const tasks = fixture();

  it("removes every task on a blocked site", () => {
    const r = drawSubset(tasks, { targetSize: 30, blockedSites: ["blocked.example"] });
    expect(r.picked.some((t) => siteKey(t.website) === "blocked.example")).toBe(false);
  });

  it("excludes on the host key, so both URL spellings go", () => {
    const r = drawSubset(tasks, { targetSize: 30, blockedSites: ["bigshop.com"] });
    expect(r.excluded).toHaveLength(18); // 12 easy + 6 medium, across two URL forms
    expect(r.excludedSites).toEqual(["bigshop.com"]);
  });

  it("publishes what it excluded instead of dropping it silently", () => {
    const r = drawSubset(tasks, { targetSize: 30, blockedSites: ["blocked.example"] });
    expect(r.excluded).toHaveLength(15);
    expect(r.excludedSites).toEqual(["blocked.example"]);
    expect(r.excluded.map((t) => t.task_id)).toEqual([...r.excluded.map((t) => t.task_id)].sort());
  });

  it("excludes before allocating, so the strata describe the eligible pool", () => {
    // Excluding after the draw would leave a subset short of its target and a
    // level mix that no longer matches anything. Order matters, so it is pinned.
    const r = drawSubset(tasks, { targetSize: 30, blockedSites: ["blocked.example"] });
    for (const s of r.strata) {
      expect(s.eligible).toBe(tasks.filter((t) => t.level === s.level && siteKey(t.website) !== "blocked.example").length);
      expect(s.eligible).toBeLessThanOrEqual(s.inFullSet);
    }
    expect(r.picked).toHaveLength(30);
  });

  it("reports site concentration rather than capping it", () => {
    // The rule deliberately has one axis and no per-site cap; the concentration
    // it inherits is published so a reader can see it.
    const r = drawSubset(tasks, { targetSize: 40 });
    const total = Object.values(r.siteCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(40);
    expect(r.subsetSites).toEqual(Object.keys(r.siteCounts).sort());
  });

  it("ignores a blocked site that carries no tasks", () => {
    const r = drawSubset(tasks, { targetSize: 30, blockedSites: ["nowhere.example"] });
    expect(r.excluded).toHaveLength(0);
    expect(r.excludedSites).toEqual([]);
  });
});

describe("parseOm2wJson", () => {
  it("reads the canonical array shape", () => {
    const t = parseOm2wJson(
      JSON.stringify([
        { task_id: "a", confirmed_task: "q", website: "https://x.example/", reference_length: 4, level: "easy" },
      ]),
    );
    expect(t[0]!.level).toBe("easy");
  });

  it("rejects a row missing a field instead of defaulting it", () => {
    // A silently-defaulted level would land every malformed row in one stratum.
    expect(() =>
      parseOm2wJson(JSON.stringify([{ task_id: "a", confirmed_task: "q", website: "https://x/", reference_length: 4 }])),
    ).toThrow(/level/);
    expect(() =>
      parseOm2wJson(JSON.stringify([{ task_id: "a", confirmed_task: "q", website: "https://x/", level: "easy" }])),
    ).toThrow(/reference_length/);
  });

  it("rejects a non-array document", () => {
    expect(() => parseOm2wJson(JSON.stringify({ tasks: [] }))).toThrow(/array/);
  });
});
