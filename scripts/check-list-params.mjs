/**
 * Catch list parameters the API silently ignores.
 *
 * `apply_sort` on the backend reads two parameters — `sort_by` naming a field
 * and `sort_order` being "asc" or "desc" — and checks the name against an
 * allow-list. A Django-style `sort_by: "-created_at"` is not on that list, so
 * it does not error: the request falls back to the endpoint's default order.
 *
 * That is the worst shape a bug can have. Five call sites were written this
 * way and every one of them happened to want the same order the default
 * already gave, so all five looked correct while none of them did anything.
 * The day somebody changes a `default_sort`, five screens quietly reorder and
 * nothing points at the cause.
 *
 * So it is checked rather than remembered.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const OFFENDER = /sort_by:\s*["'`]-/g;

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

const offences = [];
for (const file of walk(ROOT)) {
  const body = readFileSync(file, "utf8");
  const lines = body.split("\n");
  lines.forEach((line, index) => {
    OFFENDER.lastIndex = 0;
    if (OFFENDER.test(line)) {
      offences.push(`${file}:${index + 1}  ${line.trim()}`);
    }
  });
}

// A guard on the guard: if the pattern ever stops matching the thing it is
// meant to catch, this script would pass silently for ever.
if (!OFFENDER.test('sort_by: "-created_at"')) {
  console.error("check-list-params: the pattern no longer matches a known bad value.");
  process.exit(1);
}

if (offences.length > 0) {
  console.error(
    `\nA descending sort must be sent as two parameters, not a "-" prefix:\n` +
      `  sort_by: "created_at", sort_order: "desc"\n\n` +
      `The backend ignores an unrecognised sort_by and falls back to the\n` +
      `endpoint's default order, so these do nothing and look like they work:\n`,
  );
  for (const offence of offences) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

console.log("List parameters are in the shape the API reads.");
