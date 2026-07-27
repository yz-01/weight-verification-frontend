/**
 * Verify every translation catalogue carries every key English defines.
 *
 * English is the source of truth. Chinese and Malay are allowed to hold an
 * untranslated English string while a translator catches up, but a *missing*
 * key is a different problem: it means whoever added the feature only touched
 * one catalogue, and nobody finds out until a Malay-speaking site crew sees
 * English text on a screen the platform promised them in their own language.
 *
 * Run with `npm run check:messages`. Also runs as part of `npm run lint`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "..", "src", "messages");

const SOURCE = "en";
const TARGETS = ["zh", "ms"];

function load(locale) {
  return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"));
}

/** Flatten a nested catalogue into dotted paths. */
function flatten(node, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedPath, nestedValue] of flatten(value, path)) {
        out.set(nestedPath, nestedValue);
      }
    } else {
      out.set(path, value);
    }
  }
  return out;
}

/**
 * Extract the argument names an ICU message expects.
 *
 * An argument is `{name}` or `{name, plural, ...}`, so the name must be
 * followed by a comma or a closing brace. Requiring that is what keeps the
 * literal text inside a plural branch, as in `=0 {No companies}`, from being
 * mistaken for an argument called `No`.
 */
function placeholders(message) {
  if (typeof message !== "string") return new Set();
  return new Set(
    [...message.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)].map((match) => match[1]),
  );
}

const source = flatten(load(SOURCE));
const problems = [];

for (const locale of TARGETS) {
  const target = flatten(load(locale));

  for (const [key, sourceValue] of source) {
    if (!target.has(key)) {
      problems.push(`${locale}: missing key  ${key}`);
      continue;
    }
    // A translation that drops or renames a placeholder throws at render time
    // rather than degrading, so it is worth catching here.
    const expected = placeholders(sourceValue);
    const actual = placeholders(target.get(key));
    for (const name of expected) {
      if (!actual.has(name)) {
        problems.push(`${locale}: ${key} is missing the {${name}} placeholder`);
      }
    }
  }

  for (const key of target.keys()) {
    if (!source.has(key)) {
      problems.push(`${locale}: key not in ${SOURCE}  ${key}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Message catalogues are out of sync (${problems.length} problems):\n`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  console.error(
    `\nEvery key must exist in ${SOURCE}, ${TARGETS.join(" and ")} before it is used.`,
  );
  process.exit(1);
}

console.log(
  `Message catalogues are in sync: ${source.size} keys across ${[SOURCE, ...TARGETS].join(", ")}.`,
);
