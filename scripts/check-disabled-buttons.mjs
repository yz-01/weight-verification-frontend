/**
 * Every greyed-out button must say why it is grey.
 *
 * The complaint this answers, in the customer's words: "有时候我不知道为什么
 * 这个按钮点不到，因为完全没有提示" — sometimes I cannot tell why this button
 * will not respond, because there is no hint at all. The usual cause is a
 * submit disabled by a chain of emptiness checks: correct, and silent about
 * which of eight fields is still empty.
 *
 * A button disabled only while its request is in flight is exempt. That one
 * explains itself: the press just happened and there is a spinner in it.
 *
 * The fix is either `requires` - the fields the form is waiting for, as
 * `[value, label]` pairs, which the button turns into both the disabling and
 * the sentence - or `disabledReason` for anything else that greys a button.
 *
 * `ALLOWED` is a ratchet, not a list of exceptions. It records how many
 * unexplained buttons each file still has, and the check fails when a file has
 * more than its entry — and also when it has fewer, because a number that is
 * no longer true stops being a budget and starts being a lie. Convert a file,
 * lower its number; when it reaches zero, delete the line.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");

/**
 * Is this button disabled purely by a request in flight?
 *
 * That case explains itself - the press just happened and there is a spinner
 * in the button - so it is exempt. Decided by reading the identifiers out of
 * the expression rather than matching its shape, because the same meaning is
 * written several ways here: `save.isPending`, `Boolean(busy)`,
 * `mutation.isPending || busy`.
 *
 * Only the *leaf* names carry the meaning. In `save.isPending` the value the
 * button reads is `isPending`; `save` is just where it lives, and its name is
 * whatever the mutation was called. Counting the object too - the first way
 * this was written - rejected every `<owner>.isPending` in the codebase, which
 * is nearly all of them, and inflated the backlog with buttons that already
 * explain themselves.
 */
const IN_FLIGHT = new Set([
  "ispending",
  "isloading",
  "issubmitting",
  "isfetching",
  "ismutating",
  "pending",
  "loading",
  "submitting",
  "saving",
  "busy",
  "locating",
  "starting",
  "refreshing",
  "syncing",
  "uploading",
  "downloading",
  "loadingmore",
  "isfetchingnextpage",
  "disabled",
  "boolean",
]);

/** Literals carry no state, so `busy !== null` is still only about `busy`. */
const LITERALS = new Set(["null", "undefined", "true", "false"]);

function leafIdentifiers(expression) {
  const leaves = [];
  // A word inside a string is text, not state: `tab === "live"` is about `tab`.
  const code = expression.replace(/"[^"]*"|'[^']*'/g, '""');
  const pattern = /[A-Za-z_$][\w$]*/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const after = code.slice(pattern.lastIndex);
    if (after.startsWith(".") || after.startsWith("?.")) continue;
    if (LITERALS.has(match[0])) continue;
    leaves.push(match[0]);
  }
  return leaves;
}

/**
 * A mutation renamed on destructuring keeps the same meaning:
 * `isPending: isAccepting` is still the request in flight.
 */
function inFlightName(name) {
  const lower = name.toLowerCase();
  return IN_FLIGHT.has(lower) || /^is[a-z]+ing$/.test(lower) || /pending$/.test(lower);
}

function inFlightOnly(expression) {
  const leaves = leafIdentifiers(expression);
  if (leaves.length === 0) return false;
  return leaves.every(inFlightName);
}

const BUTTON = /<(Button|SubmitButton|IconButton)\b((?:[^<>]|\{[^{}]*\})*?)(\/?)>/gs;
const DISABLED = /disabled=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/;

/**
 * Files still carrying unexplained buttons, and how many.
 * Lower these as they are converted. New entries are not allowed.
 */
const ALLOWED = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/disabled-buttons-allowed.json"), "utf8"),
)));

function unexplainedIn(file) {
  const text = readFileSync(file, "utf8");
  const found = [];
  for (const match of text.matchAll(BUTTON)) {
    const attributes = match[2];
    const disabled = DISABLED.exec(attributes);
    if (!disabled) continue;
    if (inFlightOnly(disabled[1])) continue;
    if (/(?:disabledReason|requires)=/.test(attributes)) continue;
    found.push(text.slice(0, match.index).split("\n").length);
  }
  return found;
}

// The Button component itself is where the mechanism lives, not a place
// that uses it: its own `disabled={disabled}` is the derived value.
const files = globSync("**/*.tsx", { cwd: ROOT })
  .filter((file) => file.split(path.sep).join("/") !== "components/ui/button.tsx")
  .sort();
const counts = new Map();
for (const relative of files) {
  const lines = unexplainedIn(path.join(ROOT, relative));
  if (lines.length > 0) counts.set(relative.split(path.sep).join("/"), lines);
}

const problems = [];
for (const [file, lines] of counts) {
  const budget = ALLOWED.get(file) ?? 0;
  if (lines.length > budget) {
    problems.push(
      `${file}: ${lines.length} button(s) disabled with no disabledReason, ` +
        `budget is ${budget} (lines ${lines.join(", ")})`,
    );
  }
}
for (const [file, budget] of ALLOWED) {
  const actual = counts.get(file)?.length ?? 0;
  if (actual < budget) {
    problems.push(
      `${file}: budget says ${budget} but only ${actual} remain — lower it ` +
        `to ${actual}${actual === 0 ? " (or delete the line)" : ""}.`,
    );
  }
}

// `--tighten` writes the budgets down to what is actually left. It can only
// lower them: a file that grew is still a failure, because the point of the
// ratchet is that the number never goes up.
if (process.argv.includes("--tighten")) {
  const tightened = {};
  for (const [file, budget] of ALLOWED) {
    const actual = counts.get(file)?.length ?? 0;
    const kept = Math.min(budget, actual);
    if (kept > 0) tightened[file] = kept;
  }
  const sorted = Object.fromEntries(
    Object.entries(tightened).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    path.join(process.cwd(), "scripts/disabled-buttons-allowed.json"),
    `${JSON.stringify(sorted, null, 2)}
`,
  );
  const left = Object.values(sorted).reduce((sum, n) => sum + n, 0);
  console.log(`Ratchet tightened: ${left} unexplained buttons left.`);
  process.exit(0);
}

if (problems.length > 0) {
  console.error("Buttons that go grey without saying why:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\nGive the button a disabledReason naming what is missing, or lower " +
      "its file's budget in scripts/disabled-buttons-allowed.json.",
  );
  process.exit(1);
}

const remaining = [...ALLOWED.values()].reduce((sum, n) => sum + n, 0);
console.log(
  remaining === 0
    ? "Every disabled button explains itself."
    : `Every disabled button explains itself, except ${remaining} still on the ratchet.`,
);
