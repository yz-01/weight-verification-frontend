/**
 * Six back offices, one design.
 *
 * The complaint this answers, in the customer's words: "不要这边一个 design，
 * 另外一边就另一个 design" - do not have one design here and a different one
 * over there. Left to eyeballing, that check is unfalsifiable: two tables look
 * about the same until the day someone puts them on one screen. So it is
 * measured instead, on the three things that actually diverged.
 *
 * 1. RAW TABLES. A screen built out of <table>/<th>/<td> carries its own
 *    header shade, padding, hover rule and row divider, and none of them match
 *    the shared table. Only the two entries in RAW_TABLE_ALLOWED may do this,
 *    and each says why.
 *
 * 2. CROOKED COLUMNS. A heading that sits left over values pushed right is the
 *    misalignment a reader sees first. Every header cell is paired with the
 *    body cell beneath it and the two must agree - counting both `text-right`
 *    on the cell and a `justify-end` flex row inside it, because both are what
 *    the reader gets.
 *
 * 3. ROW ACTIONS. The last column of nearly every list. When one screen spaces
 *    its buttons at gap-1 and its neighbour at gap-0.5 the two tables fail to
 *    line up even though nothing about them differs. One class run, everywhere.
 *
 * 4. WIDTHS WIDER THAN A PHONE. Anything with a fixed minimum wider than a
 *    handset pushes the whole page sideways unless it sits in its own scroll
 *    region. The shared table brings one with it; everything else has to say
 *    so. This is the "no sideways scrolling at phone width" half of the
 *    acceptance, expressed as something a machine can read.
 *
 * This is a wall, not a ratchet: all three counts are at zero, so anything new
 * is a regression and there is no budget to spend.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { walkFiles } from "./lib/walk.mjs";

const ROOT = path.join(process.cwd(), "src");

/**
 * The two raw tables that are allowed to stay raw, and the reason for each.
 *
 * Neither is a list of records with a column contract, which is what the
 * shared table exists to render. Putting them in it would make them worse.
 */
const RAW_TABLE_ALLOWED = new Map([
  [
    "components/scales/gateway-panel.tsx",
    "The DTU wiring crib: a dense headerless code/value/meaning card an " +
      "engineer reads while holding a screwdriver, not a record list.",
  ],
  [
    "components/schedule-planning/schedule-planning-workspace.tsx",
    "The Excel import preview: its columns are whatever sheet the user " +
      "picked, so there is no column contract to align.",
  ],
]);

/**
 * The one shape a row-actions cluster is written in.
 *
 * Matched with the opening `<div` attached, because the same class run on a
 * `<p>` means something else entirely - a line of text pushed to the right
 * margin - and has no business being spaced like a button group.
 */
const ACTIONS_CLUSTER = '<div className="flex items-center justify-end gap-0.5"';

/** Clusters that mean the same thing but are written another way. */
const ACTIONS_STRAYS = [
  '<div className="flex justify-end gap-1"',
  '<div className="flex items-center justify-end gap-1"',
  '<div className="flex justify-end gap-0.5"',
  '<div className="flex items-center justify-end">',
];

/**
 * A fixed minimum width at or above this pushes a phone page sideways.
 *
 * 400px rather than a real handset width (360px): below that, the numbers in
 * this codebase are sidebar and column widths that collapse at a breakpoint,
 * and flagging those would be noise.
 */
const PHONE_WIDTH = 400;

/** How far back to look for the scroll region that should contain it. */
const SCROLL_WINDOW = 400;

const WIDE = /min-w-\[(\d+)px\]/g;

const TAG = /<(\/?)(Table|TableHeader|TableBody|TableRow|TableHead|TableCell)\b/g;

/** The attribute text of the tag opening at `start`, brace- and quote-aware. */
function attrsOf(source, start) {
  let depth = 0;
  let quote = "";
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    } else if (ch === ">" && depth === 0) {
      return source.slice(start, i);
    }
  }
  return "";
}

/** Index just before the matching close tag, counting nested opens. */
function closeOf(source, start, name) {
  const pattern = new RegExp(`<(/?)${name}\\b`, "g");
  pattern.lastIndex = start;
  let depth = 1;
  let match = pattern.exec(source);
  while (match) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index;
    match = pattern.exec(source);
  }
  return source.length;
}

/** The 1-based line `index` falls on. */
function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

/** Where a heading sits. */
function alignHead(attrs) {
  if (attrs.includes("text-right")) return "right";
  if (attrs.includes("text-center")) return "center";
  return "left";
}

/** Where the value under it actually lands. */
function alignCell(attrs, body) {
  if (attrs.includes("text-right") || body.includes("justify-end")) return "right";
  if (attrs.includes("text-center") || body.includes("justify-center")) {
    return "center";
  }
  return "left";
}

/**
 * Walk one file's tables and return every column whose heading and value
 * disagree, as `{ line, index, head, cell }`.
 */
function crookedColumns(source) {
  const out = [];
  let heads = null;
  let bodies = null;
  let inHeader = 0;
  let inBody = 0;
  let open = false;

  TAG.lastIndex = 0;
  let match = TAG.exec(source);
  while (match) {
    const [, closing, name] = match;
    const pos = match.index + match[0].length;

    if (closing) {
      if (name === "TableHeader") inHeader -= 1;
      if (name === "TableBody") inBody -= 1;
      if (name === "Table" && open) {
        for (const row of bodies) {
          row.forEach((cell, index) => {
            if (index < heads.length && heads[index] !== cell) {
              out.push({
                line: source.slice(0, match.index).split("\n").length,
                index,
                head: heads[index],
                cell,
              });
            }
          });
        }
        heads = null;
        bodies = null;
        open = false;
      }
      match = TAG.exec(source);
      continue;
    }

    const attrs = attrsOf(source, pos);
    if (name === "Table" && !open) {
      open = true;
      heads = [];
      bodies = [];
    } else if (name === "TableHeader") {
      inHeader += 1;
    } else if (name === "TableBody") {
      inBody += 1;
    } else if (name === "TableRow" && inBody > 0 && bodies) {
      bodies.push([]);
    } else if (name === "TableHead" && inHeader > 0 && heads) {
      heads.push(alignHead(attrs));
    } else if (name === "TableCell" && inBody > 0 && bodies?.length) {
      // A cell that spans the table is a message row, not a column.
      if (!attrs.includes("colSpan")) {
        const selfClosing = attrs.trimEnd().endsWith("/");
        const end = selfClosing
          ? pos
          : closeOf(source, pos + attrs.length + 1, "TableCell");
        bodies[bodies.length - 1].push(alignCell(attrs, source.slice(pos, end)));
      }
    }
    match = TAG.exec(source);
  }
  return out;
}

const problems = [];
let tablesSeen = 0;
let columnsCompared = 0;
let wideChecked = 0;

const files = walkFiles(ROOT, /\.tsx$/);

for (const relative of files) {
  if (relative === "components/ui/table.tsx") continue;
  const source = readFileSync(path.join(ROOT, relative), "utf8");

  // 1. raw tables
  if (/<table[\s>]/.test(source) && !RAW_TABLE_ALLOWED.has(relative)) {
    problems.push(
      `${relative}: built out of a raw <table>. Use the shared table from ` +
        `@/components/ui/table so the padding, header and hover match every ` +
        `other screen.`,
    );
  }

  // 3. row actions. Checked on every file, not only the ones containing a
  // literal <Table>: the twenty DataTable-driven lists express their columns
  // as objects, so their action cluster never sits next to a <Table> tag.
  for (const stray of ACTIONS_STRAYS) {
    const count = (source.split(stray).length - 1);
    if (count) {
      problems.push(
        `${relative}: ${count} row-action cluster(s) written as ${stray}. ` +
          `The house spacing is ${ACTIONS_CLUSTER}.`,
      );
    }
  }

  // 4. anything wider than a phone needs its own scroll region
  WIDE.lastIndex = 0;
  let wide = WIDE.exec(source);
  while (wide) {
    if (Number(wide[1]) >= PHONE_WIDTH) {
      wideChecked += 1;
      const before = source.slice(
        Math.max(0, wide.index - SCROLL_WINDOW),
        wide.index,
      );
      const scrolls =
        before.includes("overflow-x-auto") ||
        before.includes("overflow-auto") ||
        // The shared table wraps itself in a scroll region.
        /<Table\s[^>]*$/.test(before) ||
        before.trimEnd().endsWith("<Table className=\"");
      if (!scrolls) {
        problems.push(
          `${relative}:${lineAt(source, wide.index)}: ` +
            `min-w-[${wide[1]}px] is wider than a phone and has no scroll ` +
            `region around it, so it drags the whole page sideways. Put it ` +
            `in an overflow-x-auto parent, or on the shared table.`,
        );
      }
    }
    wide = WIDE.exec(source);
  }

  if (!source.includes("<Table")) continue;
  tablesSeen += (source.match(/<Table[\s>]/g) ?? []).length;
  columnsCompared += 1;

  // 2. crooked columns
  for (const bad of crookedColumns(source)) {
    problems.push(
      `${relative}:${bad.line}: column ${bad.index} has its heading ` +
        `${bad.head} and its value ${bad.cell}. Move one to match the other.`,
    );
  }
}

// Anything on the allow-list that no longer has a raw table should come off it,
// or the list quietly becomes a place bad tables can hide.
for (const [relative, reason] of RAW_TABLE_ALLOWED) {
  const full = path.join(ROOT, relative);
  let source = "";
  try {
    source = readFileSync(full, "utf8");
  } catch {
    problems.push(`${relative}: on the raw-table allow-list but is gone.`);
    continue;
  }
  if (!/<table[\s>]/.test(source)) {
    problems.push(
      `${relative}: on the raw-table allow-list but has no raw table left. ` +
        `Delete its entry — the reason recorded there ('${reason}') no ` +
        `longer applies.`,
    );
  }
}

if (problems.length) {
  console.error("UI consistency:\n");
  for (const line of problems) console.error(`  ${line}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `UI consistency: ${tablesSeen} tables across ${columnsCompared} files, ` +
    `every column square, every row-action cluster on the house spacing, ` +
    `${wideChecked} element(s) wider than a phone all inside a scroll region.`,
);
