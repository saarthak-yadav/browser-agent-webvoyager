/**
 * feat-001 — GATE: does `glm-5v-turbo` actually accept image input on this plan?
 *
 * Sends one small, dependency-free PNG to the z.ai OpenAI-compatible endpoint and
 * checks the model reports the colour layout correctly. The image is a 2x2 grid of
 * four colours in a fixed, non-obvious order, so a model that cannot see the image
 * cannot pass by guessing (1/360 for an exact 4-of-6 ordered guess).
 *
 * Run: bun run scripts/check-vision.ts
 * Exit 0 = gate passed, exit 1 = gate failed.
 */
import { deflateSync } from "node:zlib";

const BASE_URL = process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/coding/paas/v4";
/** Defaults to the model feat-001 is specified against; override to probe alternatives. */
const MODEL = process.argv[2] ?? "glm-5v-turbo";

/** Ground truth. Guessing this exact arrangement from six colours is 1-in-360. */
const TRUTH = {
  topLeft: "green",
  topRight: "purple",
  bottomLeft: "orange",
  bottomRight: "blue",
} as const;

type Quadrant = keyof typeof TRUTH;
type Colour = (typeof TRUTH)[Quadrant];

// Keyed by the four truth colours rather than by `string`, so a colour with no
// RGB value or no synonym list is a compile error instead of an `undefined` at
// the point where the gate is being judged.
const RGB: Record<Colour, [number, number, number]> = {
  green: [0, 158, 64],
  purple: [128, 0, 160],
  orange: [255, 140, 0],
  blue: [0, 82, 204],
};

/** Words the model may reasonably use for each truth colour. */
const SYNONYMS: Record<Colour, string[]> = {
  green: ["green"],
  purple: ["purple", "violet", "magenta"],
  orange: ["orange", "amber"],
  blue: ["blue", "navy"],
};

// ---------------------------------------------------------------- PNG encoding

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  // The index is masked to 0..255 and CRC_TABLE has exactly 256 entries, so the
  // lookup cannot miss; `?? 0` would corrupt the checksum rather than surface a
  // bug, so assert the bound instead.
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);

  // length(4) + body(type+data) + crc(4)
  const out = new Uint8Array(4 + body.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(4 + body.length, crc32(body));
  return out;
}

/** Minimal 8-bit truecolour PNG encoder — no image dependencies. */
function encodePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  let i = 0;
  for (let y = 0; y < height; y++) {
    raw[i++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[i++] = r;
      raw[i++] = g;
      raw[i++] = b;
    }
  }

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 = compression, filter, interlace = 0

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

function buildTestImage(size = 240): Uint8Array {
  const half = size / 2;
  return encodePng(size, size, (x, y) => {
    const key = y < half ? (x < half ? TRUTH.topLeft : TRUTH.topRight) : x < half ? TRUTH.bottomLeft : TRUTH.bottomRight;
    return RGB[key];
  });
}

// ---------------------------------------------------------------- API call

const PROMPT = [
  "This image is a 2x2 grid of four solid colour blocks.",
  "Name the colour of each quadrant.",
  'Reply with JSON only, no prose and no code fences, in exactly this shape:',
  '{"topLeft":"<colour>","topRight":"<colour>","bottomLeft":"<colour>","bottomRight":"<colour>"}',
].join(" ");

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).match(/\{[\s\S]*\}/);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate[0]);
  } catch {
    return null;
  }
}

function matches(truth: Colour, reported: unknown): boolean {
  if (typeof reported !== "string") return false;
  const said = reported.toLowerCase();
  return SYNONYMS[truth].some((word) => said.includes(word));
}

async function main() {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.error("FAIL: ZAI_API_KEY is not set (expected in .env).");
    process.exit(1);
  }

  const png = buildTestImage();
  const base64 = Buffer.from(png).toString("base64");
  // z.ai's GLM-4V family takes a bare base64 string here; the OpenAI-style
  // `data:image/png;base64,` prefix is rejected with error 1210.
  const encoding = process.env.ZAI_IMAGE_ENCODING ?? "raw";
  const dataUri = encoding === "datauri" ? `data:image/png;base64,${base64}` : base64;
  console.log(`Test image: 240x240 PNG, ${png.length} bytes, encoding=${encoding}`);
  if (process.env.DUMP_PNG) {
    require("node:fs").writeFileSync(process.env.DUMP_PNG, png);
    console.log(`Wrote test image to ${process.env.DUMP_PNG}`);
  }
  console.log(`Ground truth: ${JSON.stringify(TRUTH)}`);
  console.log(`Model: ${MODEL} @ ${BASE_URL}\n`);

  const started = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });
  const latencyMs = Date.now() - started;

  const bodyText = await res.text();
  console.log(`HTTP ${res.status} in ${latencyMs}ms`);

  if (!res.ok) {
    console.error(`FAIL: image request rejected.\n${bodyText}`);
    process.exit(1);
  }

  const body = JSON.parse(bodyText);
  const message = body?.choices?.[0]?.message ?? {};
  const content: string = message.content ?? "";
  console.log(`Usage: ${JSON.stringify(body?.usage ?? {})}`);
  if (message.reasoning_content) console.log(`\n--- reasoning ---\n${message.reasoning_content}`);
  console.log(`\n--- response ---\n${content}\n`);

  const parsed = extractJson(content);
  if (!parsed) {
    console.error("FAIL: no JSON object found in the response.");
    process.exit(1);
  }

  let correct = 0;
  // Object.keys widens to string[]; the assertion keeps the quadrant names
  // typed so a renamed quadrant fails to compile rather than silently missing.
  for (const quadrant of Object.keys(TRUTH) as Quadrant[]) {
    const truth = TRUTH[quadrant];
    const ok = matches(truth, parsed[quadrant]);
    if (ok) correct++;
    console.log(`${ok ? "OK  " : "MISS"} ${quadrant}: expected ${truth}, got ${JSON.stringify(parsed[quadrant])}`);
  }

  console.log(`\n${correct}/4 quadrants correct`);
  if (correct === 4) {
    console.log(`PASS: ${MODEL} accepts image input and described the image correctly.`);
    process.exit(0);
  }
  console.error("FAIL: the model responded but did not describe the image correctly.");
  process.exit(1);
}

main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
