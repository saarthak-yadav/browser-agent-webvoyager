/**
 * feat-004 — draw the ~100-task scored subset from Online-Mind2Web.
 *
 * Deterministic and reproducible: a fixed-seed PRNG, no Math.random, so anyone
 * re-running this gets byte-identical output and can check the subset was not
 * drawn to flatter the result. The rule and the PRNG live in `lib/subset.ts` so
 * they can be tested without touching the filesystem; this file is the I/O
 * shell. See `tests/subset.test.ts`.
 *
 * The written rule is `docs/SUBSET-RULE.md`. Read that, not this file, for why
 * the stratification axis is `level` and what that choice gives up.
 *
 * Inputs:
 *   tasks/Online_Mind2Web.json — the canonical 300-task set. Its sha256 is
 *     recorded in the output, because a subset is only reproducible against the
 *     exact revision it was drawn from and this set is actively maintained.
 *   tasks/site-audit.json — the feat-004 first-action audit. Sites it recorded
 *     as `blocked` are excluded, and the excluded ids and sites are published in
 *     the output rather than silently dropped.
 *
 * Run: bun run scripts/select-subset.ts
 * Writes: tasks/subset.json
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  SUBSET_SEED,
  SUBSET_TARGET_SIZE,
  drawSubset,
  parseOm2wJson,
  siteKey,
} from "./lib/subset.ts";
import { blockedSiteKeys, type SiteVerdict } from "./lib/first-action.ts";

const SOURCE = "tasks/Online_Mind2Web.json";
const AUDIT = "tasks/site-audit.json";
const OUT = "tasks/subset.json";

const raw = readFileSync(SOURCE);
const sourceSha256 = createHash("sha256").update(raw).digest("hex");
const tasks = parseOm2wJson(raw.toString("utf8"));

interface AuditFile {
  date: string;
  sites: { site: string; verdict: string; passedAt: string | null; detail: string }[];
}

let blocked: string[] = [];
let auditDate = "not-run";
if (existsSync(AUDIT)) {
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as AuditFile;
  auditDate = audit.date;
  const verdicts: Record<string, SiteVerdict> = {};
  for (const s of audit.sites) {
    verdicts[s.site] = {
      verdict: s.verdict as SiteVerdict["verdict"],
      passedAt: s.passedAt as SiteVerdict["passedAt"],
      neededEscalation: false,
      detail: s.detail,
    };
  }
  blocked = blockedSiteKeys(verdicts);
} else {
  // Refuse rather than quietly drawing an unaudited subset: the exclusion step
  // is what separates the two published denominators, and skipping it would
  // produce a subset whose reachable-and-valid count is unknowable.
  console.error(
    `${AUDIT} not found. Run \`bun run scripts/check-first-action.ts\` first — the subset` +
      ` cannot be drawn without per-site verdicts, because blocked tasks must be excluded` +
      ` before the draw, not after seeing results.`,
  );
  process.exit(2);
}

const result = drawSubset(tasks, {
  seed: SUBSET_SEED,
  targetSize: SUBSET_TARGET_SIZE,
  blockedSites: blocked,
});

const rule =
  `Stratified on the benchmark's own \`level\` field, the single axis. ` +
  `Tasks on sites the feat-004 first-action audit recorded as blocked are excluded first ` +
  `(${result.excluded.length} tasks across ${result.excludedSites.length} sites, all listed below). ` +
  `The remaining pool is split by level, ${SUBSET_TARGET_SIZE} slots are allocated across the levels ` +
  `in proportion to their eligible counts by the largest-remainder method, and within each level the ` +
  `tasks are sorted by task_id and drawn without replacement with mulberry32 seeded ${SUBSET_SEED}, ` +
  `consuming the stream in the order easy, medium, hard. No per-site cap and no second axis. ` +
  `See docs/SUBSET-RULE.md for why this axis and what it gives up.`;

writeFileSync(
  OUT,
  JSON.stringify(
    {
      feature: "feat-004",
      seed: SUBSET_SEED,
      source: SOURCE,
      sourceSha256,
      totalTasks: tasks.length,
      totalSites: new Set(tasks.map((t) => siteKey(t.website))).size,
      siteAudit: { file: AUDIT, date: auditDate, blockedSites: blocked },
      stratifiedOn: "level",
      rule,
      strata: result.strata,
      subsetSize: result.picked.length,
      subsetSiteCount: result.subsetSites.length,
      siteCounts: result.siteCounts,
      excludedAsBlocked: {
        taskCount: result.excluded.length,
        sites: result.excludedSites,
        taskIds: result.excluded.map((t) => t.task_id),
      },
      tasks: result.picked,
    },
    null,
    2,
  ) + "\n",
);

console.log(`${tasks.length} tasks, ${new Set(tasks.map((t) => siteKey(t.website))).size} sites`);
console.log(`source sha256: ${sourceSha256}`);
console.log(`excluded as blocked: ${result.excluded.length} tasks across ${result.excludedSites.length} sites`);
if (result.excludedSites.length) console.log(`  ${result.excludedSites.join(", ")}`);
console.log("\nstratum      in-full-set  eligible  allocated");
for (const s of result.strata) {
  console.log(
    `${s.level.padEnd(12)} ${String(s.inFullSet).padStart(11)} ${String(s.eligible).padStart(9)} ${String(s.allocated).padStart(10)}`,
  );
}
const top = Object.entries(result.siteCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(`\nsubset: ${result.picked.length} tasks across ${result.subsetSites.length} sites`);
console.log(`most-represented sites: ${top.slice(0, 5).map(([s, n]) => `${s}=${n}`).join(", ")}`);
console.log(`\nWrote ${OUT}`);
