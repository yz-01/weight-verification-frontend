/**
 * Every screen that lists project categories has to say which kind it wants.
 *
 * `ProjectCategory` used to be one tree serving two unrelated filing schemes:
 * the site-record columns, where field staff file photographs of what they
 * did, and the material columns, where deliveries and their money file. The
 * user reported them as different things kept apart, with different
 * photographs (2026-09-05, F-200).
 *
 * The bug was not a wrong filter. It was *no* filter: the old material columns
 * screen (retired by D-263; its lists now live on Category Management) asked for the categories of a project and listed whatever came back, so the
 * material screen showed the site-record columns as though a delivery could be
 * filed in them. Nothing errored and nothing looked wrong - the screen just
 * quietly answered a different question than its title.
 *
 * That shape does not come back on its own, and a passing render test would
 * not catch the next screen somebody adds. So each call site declares itself:
 * either it passes `kind`, or its file is listed below with the reason it
 * legitimately wants both schemes at once. A new caller that does neither
 * fails this check, which is the moment to decide - not months later when
 * somebody notices a column on the wrong screen.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const CALL = "getProjectCategories(";

/**
 * Files that read the whole tree on purpose, and why.
 *
 * Kept as an explicit list rather than a pattern so that adding one is a
 * decision somebody writes down. The service module is here because it is
 * where the function is defined, not a screen that calls it.
 */
const DELIBERATELY_UNFILTERED = new Map([
  [
    "src/services/contractor-ops.service.ts",
    "declares the function; the callers choose the kind",
  ],
  [
    "src/components/evidence/evidence-archive.tsx",
    "the archive holds both kinds of evidence, so its column filter offers both"
      + " - confirmed by the screen's purpose: it is the one place a person"
      + " goes to find any evidence at all, and narrowing it would hide half",
  ],
  // `safety.tsx` used to be here, with the reason "a safety incident may be
  // filed against either scheme's column". The customer says that is wrong -
  // 隐患整改跟材料没有关系的 - and their screenshot of a hazard picker listing
  // 钢筋 and 混凝土 is what that exemption looked like in production (F-236).
  //
  // The lesson is about this list, not about that screen: an entry here is a
  // business claim, and an unverified one makes the probe agree with the bug
  // it exists to find. Every entry below now says who confirmed it.
  [
    "src/components/contractor-ops/business-target-management.tsx",
    "a target may be set against either scheme's column - the customer asks"
      + " for delivered quantities to be compared against BQ targets, which"
      + " are material columns, and for progress targets, which are not."
      + " UNCONFIRMED with the customer directly; if a target turns out to be"
      + " material-only this entry is the next one to delete",
  ],
]);

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * The argument object of one `getProjectCategories(...)` call.
 *
 * Read by counting brackets from the opening parenthesis rather than with a
 * regular expression, because these calls span lines and carry nested objects
 * and spreads - a line-based match would miss a `kind` two lines down and
 * report a screen that is in fact correct.
 */
function callArguments(body, callIndex) {
  let depth = 0;
  for (let index = callIndex + CALL.length - 1; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(" || character === "{" || character === "[") depth += 1;
    if (character === ")" || character === "}" || character === "]") {
      depth -= 1;
      if (depth === 0) return body.slice(callIndex, index + 1);
    }
  }
  return body.slice(callIndex);
}

/**
 * Kinds whose categories are retired (D-285, D-286; 2026-10 B1, X5): 分类管理
 * 只留四组 - 材料、设备、隐患整改、环保材料出场. Old rows of these kinds stay
 * in the database, but no screen lists them, picks one, filters by one or
 * files into one again. A screen that did would offer columns nobody can see
 * on Category Management - 「为什么会有整改 VO？」 all over again.
 */
const RETIRED_KINDS = [
  "FIELD",
  "BOTH",
  "CLAIM",
  "PROGRESS",
  "CONSTRUCTION_WASTE",
  "CONSULTANT",
  "SUNDRY",
];
const RETIRED_CALL = new RegExp(`\\bkind:\\s*"(${RETIRED_KINDS.join("|")})"`);
/**
 * Screens that read one retired kind on purpose, so old records stay findable
 * (X5: 旧记录仍能在原业务页找到). An entry is a business claim, like the list
 * above: say why.
 */
const LEGACY_READS = new Map([
  // Hazards filed before migration 0040 sit in 现场资料 (FIELD) columns; the
  // hazard list's column filter reads them beside the EHS ones so those
  // hazards can still be filtered by the column they are in.
  ["src/components/site-operations/safety.tsx", "FIELD"],
]);

/** A column picker, filter or filing dialog pinned to a retired kind. */
const columnComponents = (body) => [
  ...body.matchAll(
    new RegExp(
      `<(ProjectColumnPicker|ColumnFilter|FileIntoColumnDialog)\\b[^>]*?\\bkind="(${RETIRED_KINDS.join("|")})"`,
      "g",
    ),
  ),
];

const offences = [];
const retired = [];
const declared = [];
for (const file of walk(ROOT)) {
  const relative = file.split("\\").join("/");
  // Tests quote the old shapes on purpose, to say they are gone.
  if (/\.test\.tsx?$/.test(relative)) continue;
  const body = readFileSync(file, "utf8");
  let cursor = body.indexOf(CALL);
  while (cursor !== -1) {
    const line = body.slice(0, cursor).split("\n").length;
    const argument = callArguments(body, cursor);
    if (/\bkind:/.test(argument)) {
      declared.push(`${relative}:${line}`);
      const match = argument.match(RETIRED_CALL);
      if (match && LEGACY_READS.get(relative) !== match[1]) {
        retired.push(`${relative}:${line} (kind ${match[1]})`);
      }
    } else if (!DELIBERATELY_UNFILTERED.has(relative)) {
      offences.push(`${relative}:${line}`);
    }
    cursor = body.indexOf(CALL, cursor + CALL.length);
  }
  for (const match of columnComponents(body)) {
    const line = body.slice(0, match.index).split("\n").length;
    retired.push(`${relative}:${line} (<${match[1]} kind="${match[2]}">)`);
  }
}

// The same guard on the guard for the retired-kind reader: it must see a
// picker written across lines, and must not flag a live kind.
if (
  columnComponents('<ProjectColumnPicker project={p}\n  kind="PROGRESS" />').length !== 1 ||
  columnComponents('<ColumnFilter list={list} kind="MATERIAL" />').length !== 0 ||
  !RETIRED_CALL.test('getProjectCategories({ kind: "SUNDRY" })')
) {
  console.error(
    "check-category-kinds: the retired-kind reader no longer reads a column component.",
  );
  process.exit(1);
}

if (retired.length > 0) {
  console.error(
    "\nThese screens still offer categories of a retired kind:\n\n" +
      "  分类管理只留四组 (2026-10 B1): material, equipment, hazard and\n" +
      "  recyclable waste. Progress, clearance, consultant and sundry records\n" +
      "  file under no category, and the site-record and claim ones are gone.\n",
  );
  for (const offence of retired) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

// A guard on the guard. If `callArguments` ever stopped finding the `kind` in a
// call written across several lines, every screen would look undeclared and
// this script would fail loudly - but the opposite mistake, silently treating
// an unfiltered call as declared, would pass for ever. So both directions are
// checked against a known sample.
const MULTILINE_SAMPLE = `getProjectCategories({
  project,
  kind: "FIELD",
  page_size: 200,
})`;
const UNFILTERED_SAMPLE = `getProjectCategories({ page_size: 200 })`;
if (!/\bkind:/.test(callArguments(MULTILINE_SAMPLE, 0))) {
  console.error(
    "check-category-kinds: the reader no longer finds `kind` in a multi-line call.",
  );
  process.exit(1);
}
if (/\bkind:/.test(callArguments(UNFILTERED_SAMPLE, 0))) {
  console.error(
    "check-category-kinds: the reader claims an unfiltered call declares a kind.",
  );
  process.exit(1);
}

if (offences.length > 0) {
  console.error(
    "\nThese screens list project categories without saying which kind:\n\n" +
      "  The site-record columns and the material columns are two different\n" +
      "  filing schemes on one tree. A list with no `kind` returns both, which\n" +
      "  is how the material screen came to show site-record columns (F-200).\n\n" +
      '  Pass kind: "MATERIAL" or kind: "FIELD" - or, if the screen genuinely\n' +
      "  wants both, add it to DELIBERATELY_UNFILTERED in this script with the\n" +
      "  reason.\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

console.log(
  `Category kinds: ${declared.length} category list(s) declare which filing ` +
    `scheme they show, ${DELIBERATELY_UNFILTERED.size} file(s) read both on purpose.`,
);
