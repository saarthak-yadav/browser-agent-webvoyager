/**
 * The committed subset must be the one the committed rule produces.
 *
 * `docs/SUBSET-RULE.md` tells a reader that re-running the draw against the same
 * task file and the same audit reproduces `tasks/subset.json` byte for byte. That
 * sentence is what makes the subset checkable — "~100 tasks stratified across
 * Online-Mind2Web" only means something if a skeptic can re-derive the same 100
 * and confirm they were not chosen to flatter the pass rate. This test is the
 * guard on it: if the draw ever moves, the committed subset stops being what the
 * rule describes and every number built on it needs re-running.
 *
 * It also pins the source file itself. A subset is only reproducible against the
 * revision it came from, and Online-Mind2Web is actively maintained upstream —
 * reproducing a draw from a task file that has since changed proves nothing.
 *
 * No network. Reads the committed task set, audit and subset only.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  SUBSET_SEED,
  SUBSET_TARGET_SIZE,
  drawSubset,
  parseOm2wJson,
  siteKey,
  type Om2wTask,
} from "../scripts/lib/subset.ts";
import { blockedSiteKeys, type SiteVerdict } from "../scripts/lib/first-action.ts";

const rawSource = readFileSync("tasks/Online_Mind2Web.json");
const tasks = parseOm2wJson(rawSource.toString("utf8"));

const audit = JSON.parse(readFileSync("tasks/site-audit.json", "utf8")) as {
  sitesProbed: number;
  totalTasks: number;
  sites: { site: string; verdict: string; passedAt: string | null; detail: string }[];
};

const recorded = JSON.parse(readFileSync("tasks/subset.json", "utf8")) as {
  seed: number;
  sourceSha256: string;
  totalTasks: number;
  subsetSize: number;
  stratifiedOn: string;
  strata: { level: string; inFullSet: number; eligible: number; allocated: number }[];
  siteAudit: { blockedSites: string[] };
  excludedAsBlocked: { taskCount: number; sites: string[]; taskIds: string[] };
  siteCounts: Record<string, number>;
  tasks: Om2wTask[];
};

const blocked = blockedSiteKeys(
  Object.fromEntries(
    audit.sites.map((s) => [
      s.site,
      { verdict: s.verdict, passedAt: null, neededEscalation: false, detail: s.detail } as SiteVerdict,
    ]),
  ),
);

describe("the committed subset was drawn from the committed task file", () => {
  it("records the sha256 of the exact bytes it was drawn from", () => {
    expect(recorded.sourceSha256).toBe(createHash("sha256").update(rawSource).digest("hex"));
  });

  it("was drawn from a task file of the size it claims", () => {
    expect(recorded.totalTasks).toBe(tasks.length);
  });

  it("used the recorded seed and target size", () => {
    expect(recorded.seed).toBe(SUBSET_SEED);
    expect(recorded.subsetSize).toBe(SUBSET_TARGET_SIZE);
  });

  it("covers every site the audit probed", () => {
    // A task on an unprobed site would have no reachability verdict, so its
    // exclusion status would be unknown rather than decided-before-the-run.
    expect(audit.sitesProbed).toBe(new Set(tasks.map((t) => siteKey(t.website))).size);
  });
});

describe("the committed subset is reproduced by the committed rule", () => {
  it("is reproduced exactly, task for task", () => {
    const { picked } = drawSubset(tasks, {
      seed: SUBSET_SEED,
      targetSize: SUBSET_TARGET_SIZE,
      blockedSites: blocked,
    });
    // Compared by full task object, not just task_id, so a revised question or a
    // moved start URL is caught too.
    expect(picked).toEqual(recorded.tasks);
  });

  it("reproduces the strata and the allocation", () => {
    const { strata } = drawSubset(tasks, { blockedSites: blocked });
    expect(strata).toEqual(recorded.strata);
    expect(strata.reduce((n, s) => n + s.allocated, 0)).toBe(SUBSET_TARGET_SIZE);
  });

  it("reproduces the published exclusion list", () => {
    // The published count and site list are what make the exclusion auditable
    // rather than a quiet drop of the hard tasks.
    const { excluded, excludedSites } = drawSubset(tasks, { blockedSites: blocked });
    expect(excluded.map((t) => t.task_id)).toEqual(recorded.excludedAsBlocked.taskIds);
    expect(excludedSites).toEqual(recorded.excludedAsBlocked.sites);
    expect(recorded.excludedAsBlocked.taskCount).toBe(recorded.excludedAsBlocked.taskIds.length);
  });

  it("excluded exactly the sites the audit called blocked, and no others", () => {
    expect(recorded.siteAudit.blockedSites).toEqual(blocked);
    for (const t of recorded.tasks) {
      expect(blocked).not.toContain(siteKey(t.website));
    }
  });
});

describe("the committed subset is internally consistent", () => {
  it("stratifies on level and on nothing else", () => {
    expect(recorded.stratifiedOn).toBe("level");
  });

  it("holds the number of tasks it says it does, with no duplicates", () => {
    expect(recorded.tasks).toHaveLength(recorded.subsetSize);
    expect(new Set(recorded.tasks.map((t) => t.task_id)).size).toBe(recorded.subsetSize);
  });

  it("draws every task from the source file", () => {
    const byId = new Map(tasks.map((t) => [t.task_id, t]));
    for (const t of recorded.tasks) expect(byId.get(t.task_id)).toEqual(t);
  });

  it("publishes site counts that add up to the subset", () => {
    const total = Object.values(recorded.siteCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(recorded.subsetSize);
  });

  it("matches each stratum's allocation to the tasks actually drawn", () => {
    for (const s of recorded.strata) {
      expect(recorded.tasks.filter((t) => t.level === s.level)).toHaveLength(s.allocated);
    }
  });
});
