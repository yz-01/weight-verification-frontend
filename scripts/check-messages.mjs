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

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "..", "src", "messages");

const SOURCE = "en";
const TARGETS = ["zh", "zh-TW", "ms"];

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

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

// Resolve literal calls through their useTranslations namespace. Catalogue
// parity alone cannot catch a key that is absent from all four files.
for (const file of sourceFiles(join(here, "..", "src"))) {
  const text = readFileSync(file, "utf8");
  const translators = [
    ...text.matchAll(
      /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:["']([^"']+)["'])?\s*\)/g,
    ),
  ];
  const byVariable = new Map();
  for (const translator of translators) {
    const entries = byVariable.get(translator[1]) ?? [];
    entries.push(translator[2] ?? "");
    byVariable.set(translator[1], entries);
  }
  for (const [variable, namespaces] of byVariable) {
    // A few large workspaces reuse `t` in several component scopes. A regex
    // cannot resolve lexical scope reliably, so leave those to browser QA.
    if (namespaces.length !== 1) continue;
    const namespace = namespaces[0];
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const calls = new RegExp(`\\b${escaped}\\(\\s*["']([\\w.-]+)["']`, "g");
    for (const match of text.matchAll(calls)) {
      const key = namespace ? `${namespace}.${match[1]}` : match[1];
      if (!source.has(key)) {
        problems.push(
          `${file.slice(join(here, "..").length + 1)}: catalogue key not found  ${key}`,
        );
      }
    }
  }
}

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
