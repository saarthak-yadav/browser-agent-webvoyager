/**
 * feat-003 helper — load one URL and dump what a human needs to judge it.
 *
 * This is an audit instrument, not agent code: it exists so the task-decay
 * check is done by looking at the live site rather than from memory. It takes
 * a URL, loads it in the same stock headed Chromium feat-002 settled on, and
 * writes the visible text and a screenshot for manual inspection.
 *
 * Run: bun run scripts/probe-page.ts <url> <label> [--wait=8000]
 *      bun run scripts/probe-page.ts <batch.json>   # [{url,label,wait?}, ...]
 * Writes: runs/feat-003/<label>.png and runs/feat-003/<label>.txt
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

interface Probe {
  url: string;
  label: string;
  wait?: number;
}

const waitArg = process.argv.find((a) => a.startsWith("--wait="));
const defaultWait = waitArg ? Number(waitArg.split("=")[1]) : 8_000;

let probes: Probe[];
const first = process.argv[2];
if (first?.endsWith(".json") && existsSync(first)) {
  probes = JSON.parse(readFileSync(first, "utf8")) as Probe[];
} else if (first && process.argv[3]) {
  probes = [{ url: first, label: process.argv[3] }];
} else {
  console.error("usage: bun run scripts/probe-page.ts <url> <label> [--wait=ms]");
  console.error("       bun run scripts/probe-page.ts <batch.json>");
  process.exit(2);
}

mkdirSync("runs/feat-003", { recursive: true });
const browser = await chromium.launch({ headless: false });

for (const p of probes) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let status: number | null = null;
  try {
    const res = await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = res?.status() ?? null;
    await page.waitForTimeout(p.wait ?? defaultWait);
  } catch (err) {
    console.error(`[${p.label}] navigation failed: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  }

  const title = await page.title().catch(() => "");
  const text = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")) as string;

  await page.screenshot({ path: `runs/feat-003/${p.label}.png` }).catch(() => {});
  writeFileSync(
    `runs/feat-003/${p.label}.txt`,
    `URL: ${p.url}\nFINAL: ${page.url()}\nHTTP: ${status}\nTITLE: ${title}\n\n${text}\n`,
  );

  console.log(`\n===== [${p.label}] HTTP ${status} — ${title}`);
  console.log(`final: ${page.url()}`);
  console.log(text.slice(0, 1800));
  await context.close();
}

await browser.close();
