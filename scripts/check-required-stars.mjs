/**
 * A field the button will not submit without has to say so before they try.
 *
 * The complaint this answers is the same one the `requires` declaration
 * answers, one step earlier: "有时候我不知道为什么这个按钮点不到" - sometimes I
 * cannot tell why this button will not respond. `requires` fixed the moment
 * after the press, by naming the missing field. This fixes the moment before
 * it, by putting the red asterisk on that field in the first place. A person
 * should not have to press a button to discover what it wants.
 *
 * The pairing is: whatever a button lists in `requires`, the `FieldWrapper`
 * carrying that same label in the same form must be marked `required`.
 *
 * SCOPE IS THE FORM, NOT THE FILE. The first version of this compared by file
 * and produced confident nonsense: `safety.tsx` holds a report form whose
 * photo is compulsory and a review dialog whose photo is not, and both name
 * the field with the same message key. Reporting the review dialog's honest
 * `optional` as a defect is how a check earns its way onto the ignore list.
 * So the comparison happens inside one component function at a time.
 *
 * A conditional requirement takes a conditional star - `required={!noExpiry}`
 * next to `[noExpiry || validUntil, ...]` - because an asterisk that is not
 * always true is its own small lie.
 *
 * What this CANNOT check: whether the label on a pair names the field the
 * value actually watches. Three buttons were found saying "still needs:
 * caption" while waiting on a photo selection, and no static rule sees that -
 * both halves are valid, they simply disagree about meaning. Those were found
 * by reading, and finding the next one will need reading too.
 */

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "components");

/** A component boundary: the top-level function declarations in a file. */
const COMPONENT = /^(?:export\s+)?(?:default\s+)?function\s+(\w+)/gm;

/** The message key inside a `t("...")`-shaped call. */
const KEY = /\w*\(\s*["']([\w.$-]+)["']/g;

/** Text between balanced brackets starting at `start`. */
function balanced(source, start, opener = "[", closer = "]") {
  let depth = 0;
  let quote = "";
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/** The `[value, label]` pairs inside one requires list. */
function splitPairs(text) {
  const out = [];
  const body = text.slice(1, -1);
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "[") {
      i += 1;
      continue;
    }
    const pair = balanced(body, i);
    if (!pair) break;
    out.push(pair);
    i += pair.length;
  }
  return out;
}

/** The attributes of a JSX tag opening at `start`, brace- and quote-aware. */
function attrsOf(source, start) {
  let depth = 0;
  let quote = "";
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return source.slice(start, i);
  }
  return "";
}

/** The last message key mentioned in a fragment, or null. */
function lastKey(fragment) {
  KEY.lastIndex = 0;
  let found = null;
  let match = KEY.exec(fragment);
  while (match) {
    found = match[1];
    match = KEY.exec(fragment);
  }
  return found;
}

/** (name, start, end) per top-level component. */
function components(source) {
  COMPONENT.lastIndex = 0;
  const bounds = [];
  let match = COMPONENT.exec(source);
  while (match) {
    bounds.push([match[1], match.index]);
    match = COMPONENT.exec(source);
  }
  if (bounds.length === 0) return [["<file>", 0, source.length]];
  return bounds.map(([name, start], index) => [
    name,
    start,
    index + 1 < bounds.length ? bounds[index + 1][1] : source.length,
  ]);
}

const problems = [];
let matched = 0;

const files = globSync("**/*.tsx", { cwd: ROOT })
  .map((name) => name.split(path.sep).join("/"))
  .sort();

for (const relative of files) {
  const source = readFileSync(path.join(ROOT, relative), "utf8");
  if (!source.includes("requires=")) continue;

  for (const [component, start, end] of components(source)) {
    const body = source.slice(start, end);

    // What the buttons in this form refuse to submit without.
    const demanded = new Map();
    const requires = /requires=\{/g;
    let hit = requires.exec(body);
    while (hit) {
      const bracket = body.indexOf("[", hit.index + hit[0].length - 1);
      const brace = body.indexOf("}", hit.index + hit[0].length - 1);
      if (bracket !== -1 && !(brace !== -1 && brace < bracket)) {
        for (const pair of splitPairs(balanced(body, bracket))) {
          const key = lastKey(pair);
          if (key) demanded.set(key, pair.replace(/\s+/g, " "));
        }
      }
      hit = requires.exec(body);
    }
    if (demanded.size === 0) continue;

    // The fields in this same form, and whether they wear a star.
    const wrappers = /<FieldWrapper\b/g;
    let wrapper = wrappers.exec(body);
    while (wrapper) {
      const attrs = attrsOf(body, wrapper.index + wrapper[0].length);
      const label = /label=\{([^}]*)\}/.exec(attrs);
      const key = label ? lastKey(label[1]) : null;
      if (key && demanded.has(key)) {
        matched += 1;
        if (!/\brequired\b(?!\w)/.test(attrs)) {
          const line =
            source.slice(0, start + wrapper.index).split("\n").length;
          problems.push(
            `${relative}:${line}: in ${component}, the button will not ` +
              `submit without ${key} — ${demanded.get(key)} — but the field ` +
              `carries no required marker, so nobody learns that until they ` +
              `press it.`,
          );
        }
      }
      wrapper = wrappers.exec(body);
    }
  }
}

if (problems.length) {
  console.error("Required-field markers:\n");
  for (const line of problems) console.error(`  ${line}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `Required-field markers: ${matched} field(s) that a button demands, ` +
    `every one of them marked on the field as well.`,
);
