/**
 * Every t("...") in the app must name a message that exists, and hand it what
 * it asks for.
 *
 * next-intl does not fail when a key is missing - it renders the key path
 * itself. So a typo, or a key copied from a namespace that does not have it,
 * reaches the screen as `qrCodes.required.supplier` where a sentence belongs,
 * and nothing in the build, the types or the test suite says a word. That is
 * how a form ended up telling people `qrCodes.required.vehicle` instead of
 * asking them for the lorry plate.
 *
 * The same silent failure happens a second way. `{project}` inside a message
 * is an ICU argument, not a pair of braces to print: formatting throws when
 * the caller passes nothing, and next-intl again prints the key path. A hint
 * meant to show people the words `{project}` and `{sequence}` they can type
 * into a numbering rule has to escape them as `'{project}'`. So a call that
 * passes no values must name a message that expects none.
 *
 * English is the source of truth here, as it is for check-messages.mjs, which
 * separately guarantees the other three catalogues carry the same keys.
 *
 * Shapes checked:
 *   t("a.b")            - the message must exist and be a string;
 *   t("a.b")            - and, with no values passed, must take no arguments;
 *   t(`a.b.${value}`)   - `a.b` must exist and be an object, because the value
 *                         chooses between its entries at runtime.
 * A key reached through `t.has(...)` is left alone: asking whether a message
 * exists is how a caller says it has its own fallback.
 *
 * Run with `npm run check:messages`. Also runs as part of `npm run lint`.
 */

import { readFileSync } from "node:fs";

import { walkFiles } from "./lib/walk.mjs";

const messages = JSON.parse(readFileSync("src/messages/en.json", "utf8"));

function resolve(dotted) {
  let node = messages;
  for (const part of dotted.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

/** The ICU arguments a message expects. An escaped '{name}' is not one. */
function argumentsOf(message) {
  return [...message.matchAll(/(?<!')\{\s*(\w+)\s*(?:,|\})/g)].map((m) => m[1]);
}

/**
 * Source with its comments taken out.
 *
 * A doc comment that shows how to call `t("field.name")` is documentation, not
 * a lookup: scanning it reports a key nobody asks the catalogue for. Only
 * whole-line comments and block comments are removed, so a `//` inside a URL
 * in real code is left alone.
 */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? "" : line))
    .join("\n");
}

const problems = [];

for (const name of walkFiles("src", /\.tsx?$/)) {
  const file = `src/${name}`;
  const text = withoutComments(readFileSync(file, "utf8"));
  // Keys the file asks about before using: those carry their own fallback.
  const guarded = new Set(
    [...text.matchAll(/\w+\.has\(\s*[`"]([\w.]+)/g)].map((m) => m[1]),
  );
  const isGuarded = (key) =>
    [...guarded].some((g) => g === key || g.startsWith(`${key}.`));

  const translators = new Map();
  text.split("\n").forEach((line, index) => {
    for (const m of line.matchAll(
      /const (\w+) = useTranslations\((?:"([^"]*)")?\)/g,
    )) {
      translators.set(m[1], m[2] ?? "");
    }

    const check = (name, key, kind, valuesPassed) => {
      if (isGuarded(key)) return;
      const namespace = translators.get(name);
      const full = namespace ? `${namespace}.${key}` : key;
      const found = resolve(full);
      const ok =
        kind === "leaf"
          ? typeof found === "string"
          : found !== null && typeof found === "object";
      if (!ok) {
        const shown = kind === "leaf" ? `"${key}"` : "`" + key + ".${…}`";
        problems.push(
          `${file}:${index + 1}  ${name}(${shown}) needs ${full}, which no message defines`,
        );
        return;
      }
      if (kind !== "leaf" || valuesPassed) return;
      const args = argumentsOf(found);
      if (args.length > 0) {
        problems.push(
          `${file}:${index + 1}  ${name}("${key}") passes no values, but ${full} ` +
            `expects ${args.join(", ")} - pass them, or escape the braces as '{${args[0]}}'`,
        );
      }
    };

    for (const m of line.matchAll(/\b(\w+)\("([^"${}]+)"\s*([,)])/g)) {
      if (translators.has(m[1])) check(m[1], m[2], "leaf", m[3] === ",");
    }
    for (const m of line.matchAll(/\b(\w+)\(\s*[`"]([\w.]+)\.(?:\$\{|"\s*\+)/g)) {
      if (translators.has(m[1])) check(m[1], m[2], "prefix", true);
    }
  });
}

if (problems.length > 0) {
  console.error("Text that would render as a key path instead of a sentence:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\nAdd the message to src/messages/en.json (and the other three " +
      "catalogues), or point the call at the key that already exists.",
  );
  process.exit(1);
}

console.log("Every message key resolves.");
