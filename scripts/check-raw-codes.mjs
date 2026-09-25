/**
 * A database code must not reach the reader.
 *
 * The customer photographed three of them: `PENDING_APPROVAL` in a status
 * badge, and `receiving.receiptphoto` - a Django `app_label.model` string -
 * where the name of a photograph belonged. Neither is a crash and neither is
 * caught by a type-checker: `row.status` is a `string`, and a badge will
 * render whatever string it is handed.
 *
 * So the shape to find is a field whose values are codes, rendered without
 * passing through `t(...)`. The fields whose values are codes are the enum-ish
 * ones, and they are listed below rather than guessed at.
 *
 * Not flagged, because these are not text the reader reads:
 *
 *   - `key={...}`, and any template literal, which is a key in all but name;
 *   - `value={...}` on a form control, where the raw code is the correct
 *     thing to submit;
 *   - a line that already mentions `t(`, where the code is an argument to a
 *     lookup rather than the output.
 *
 * `.code` is deliberately not in the list. A supplier code, a scale code and
 * a WBS code are identifiers the site office reads out loud, and hiding them
 * behind a translation would be the opposite of the point.
 */

import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");

const CODE_FIELD =
  "(?:status|state|kind|type|event|severity|result|mode|channel|action" +
  "|resource_type|content_type|app_label)";

const DIRECT = new RegExp("\\{\\s*(\\w+\\??\\.(?:\\w+\\.)*" + CODE_FIELD + ")\\s*\\}", "g");
const AS_PROP = new RegExp(
  "\\b(?:label|title|text|children)=\\{\\s*(\\w+\\??\\.(?:\\w+\\.)*" +
    CODE_FIELD +
    ")\\s*\\}",
  "g",
);

/**
 * Allowlist: `file:line` and why that one is allowed to be raw.
 *
 * Two kinds of entry. The first is a field whose name looks like an enum and
 * is not - `Project.state` is a `CharField` with no choices, holding
 * "Selangor", and putting that through a catalogue would be the bug rather
 * than the fix. The second is a screen not yet swept, carried here with its
 * task so the number can only go down.
 */
const ALLOWED = new Map([
  [
    "src/components/projects/projects.tsx:154",
    "Project.state is free text - the Malaysian state in the address.",
  ],
  [
    "src/components/sites/sites.tsx:109",
    "Site.state is free text - the Malaysian state in the address.",
  ],
  // T-176 closed: the kind is named by the backend catalogue (D-261) and
  // shown as `kind_label`, so the two notification lines are off this list.
]);

function offencesIn(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) return [];
  if (/\bt\(|\bt\.has\(|useTranslations/.test(line)) return [];
  if (/\bkey=/.test(line) || line.includes("`${")) return [];
  const found = [];
  for (const pattern of [DIRECT, AS_PROP]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      // `DIRECT` matches a braced expression wherever it sits, including
      // inside a prop that is not text the reader reads. The sample check
      // caught this: `<option value={form.kind}>` was being flagged, and the
      // raw code is exactly what an option has to submit.
      const before = line.slice(0, match.index);
      if (/\b(?:value|defaultValue|name|id|htmlFor|aria-\w+|data-\w+)=$/.test(before))
        continue;
      // `error={errors.resource_type}` is the server's sentence about that
      // field, not a code. The field happens to be named after a code field,
      // which is why this needs saying rather than inferring.
      if (/\berror=$/.test(before) || /^errors?\./.test(match[1])) continue;
      // A braced expression that follows `=` is a prop, and a prop is only
      // text when it is one of the four named in AS_PROP. `kind={asset.kind}`
      // picks an icon and `action={acting.action}` picks a dialog; neither is
      // read by anybody. Flagging them called three sites defects.
      if (pattern === DIRECT && /=$/.test(before)) continue;
      // Inside a template literal the code is a key being built, not text
      // being shown - and the call around it need not be named `t`. This file
      // was flagging `system(\`mode.${delivery.mode}\`)`, which is a lookup
      // through a second translator. An odd number of backticks before the
      // match means we are still inside one.
      if ((before.match(/`/g) ?? []).length % 2 === 1) continue;
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }
  return found;
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test."))
      files.push(full);
  }
  return files;
}

// The guard on the guard: known samples before real code. A reader that
// matches nothing passes this whole file silently, which is the same failure
// it exists to catch.
const SAMPLES = [
  ['<StatusBadge label={row.status} />', true],
  ['{delivery.mode}', true],
  ['<p>{row.resource_type}</p>', true],
  ['<FieldWrapper error={errors.resource_type}>', false],
  ['<StatusBadge label={t(`status.${row.status}`)} />', false],
  ['key={`${row.kind}-${row.id}`}', false],
  ['<option value={form.kind}>', false],
  ['<p>{row.supplier_name}</p>', false],
];
for (const [sample, shouldFlag] of SAMPLES) {
  if (offencesIn(sample).length > 0 !== shouldFlag) {
    console.error(
      "check-raw-codes: the reader no longer understands its own sample:\n  " +
        sample,
    );
    process.exit(1);
  }
}

const offences = [];
for (const file of walk(root)) {
  const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const expression of offencesIn(line)) {
      const where = `${relative}:${index + 1}`;
      if (ALLOWED.has(where)) continue;
      offences.push(`${where}  ${expression}`);
    }
  });
}

if (offences.length > 0) {
  console.error(
    "\nThese render a database code where the reader expects words:\n\n" +
      "  Wrap it in a lookup and add the entry to all four catalogues:\n" +
      "    <StatusBadge label={t(`section.status.${row.status}`)} />\n\n" +
      "  When a code can arrive that no catalogue covers, fall back to the\n" +
      "  code rather than printing the key path:\n" +
      "    t.has(key) ? t(key) : row.status\n\n" +
      "  An identifier the site office reads out loud - a supplier code, a\n" +
      "  WBS code - is not a code in this sense and is not flagged.\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

console.log("Raw codes: no database code is rendered as text.");
