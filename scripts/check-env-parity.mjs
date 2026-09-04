/**
 * Verify `.env.example` documents every `NEXT_PUBLIC_*` variable the code reads.
 *
 * The backend learned this the hard way: sixteen variables its settings read
 * were never added to the deployment pipeline, and nobody noticed for months
 * because nothing fails loudly — the code just takes its fallback. Push
 * notifications were dead in production the whole time, and OCR silently asked
 * every operator to type the delivery note in by hand.
 *
 * The frontend had no such check at all. Before this file, `.env.example` held
 * exactly one line while the code read two variables, and the map work added
 * three more. `.env.example` is what a new environment is configured from, so a
 * variable missing here is a variable that will be missing in Vercel.
 *
 * This checks documentation, not values: a variable listed with an empty value
 * counts as documented, because some are meant to be blank until someone buys
 * the account behind them.
 *
 * Run with `npm run check:env`. Also runs in CI.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const envExample = join(root, ".env.example");

/** Where application code lives. Config files are read separately below. */
const SCANNED_DIRS = ["src"];
const SCANNED_ROOT_FILES = ["next.config.ts", "next.config.mjs", "next.config.js"];
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/**
 * Next.js only substitutes `process.env.NEXT_PUBLIC_X` written out in full, so
 * matching that exact shape finds every variable that actually reaches the
 * browser — and deliberately ignores a dynamic `process.env[name]`, which would
 * read undefined at runtime anyway.
 */
const USAGE = /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (CODE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const used = new Map();
const targets = [...SCANNED_DIRS.flatMap((dir) => walk(join(root, dir)))];
for (const name of SCANNED_ROOT_FILES) {
  try {
    statSync(join(root, name));
    targets.push(join(root, name));
  } catch {
    // Not every project has every config file. Absence is not a failure.
  }
}

for (const file of targets) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(USAGE)) {
    const variable = match[1];
    if (!used.has(variable)) used.set(variable, new Set());
    used.get(variable).add(relative(root, file).replace(/\\/g, "/"));
  }
}

const documented = new Set();
for (const line of readFileSync(envExample, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const [name] = trimmed.split("=");
  if (name) documented.add(name.trim());
}

const undocumented = [...used.keys()].filter((name) => !documented.has(name)).sort();
// The reverse direction is a warning, not an error: a documented variable with
// no reader is usually one that was just removed from the code, and failing the
// build for that would punish the cleanup rather than the mistake.
const unused = [...documented]
  .filter((name) => name.startsWith("NEXT_PUBLIC_") && !used.has(name))
  .sort();

console.log(
  `${used.size} NEXT_PUBLIC_* variable(s) read by the code; ` +
    `${documented.size} documented in .env.example.`,
);

for (const name of unused) {
  console.warn(`  warning: ${name} is documented but nothing reads it.`);
}

if (undocumented.length > 0) {
  console.error("");
  console.error(
    "These variables are read by the code but absent from .env.example, so a " +
      "new environment would be configured without them:",
  );
  for (const name of undocumented) {
    console.error(`  ${name}`);
    for (const file of [...used.get(name)].sort()) {
      console.error(`      read at ${file}`);
    }
  }
  console.error("");
  console.error("Add each one to .env.example, with a comment saying what it does.");
  process.exit(1);
}

console.log("Environment variables are in sync.");
