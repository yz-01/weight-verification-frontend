/**
 * A camera slot holding one photograph has to show it.
 *
 * `FieldCamera` used to render the count of what it held - "1 photo(s) ready"
 * - and nothing else. The user reported it from the field app: 这个位置我们拍
 * 照了过后为什么没有照片只是看到他写而有一张照片，如果拍得不好就不能重拍了
 * (2026-09-05). Two complaints in one sentence, and the second follows from
 * the first: you cannot judge a photograph you cannot see, so you cannot know
 * to retake it.
 *
 * The component takes an optional `file` and draws a preview from it. Optional
 * is right - several call sites pass a count taken from a server list of
 * photographs that have already been uploaded and are shown in a gallery
 * elsewhere, and they hold no File to preview. But optional also means a new
 * call site can quietly go back to being a line of text, which is what three
 * of them were still doing after the reported one was fixed.
 *
 * So the rule is derived from the call itself rather than a list: a slot whose
 * `fileCount` is `x ? 1 : 0` is holding exactly one File in component state,
 * and that File is available to preview. A slot counting a server list is not,
 * and is not asked to.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/components";
const TAG = "<FieldCamera";

/** A `fileCount` derived from one File held in state. */
const SINGLE_FILE = /fileCount=\{\s*\w+\s*\?\s*1\s*:\s*0\s*\}/;
/**
 * Either source of a thumbnail counts.
 *
 * `previewUrl` was added for slots whose photograph is uploaded the instant it
 * is taken, so the caller holds no `File` but the server does hold a URL
 * (F-289). Without it in this pattern the guard could not see that the two
 * disposal screens had been fixed, and would have let a later edit quietly
 * take the preview away again.
 */
const HAS_PREVIEW = /(?:\bfile=\{|\bpreviewUrl=\{)/;

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.tsx$/.test(entry)) found.push(path);
  }
  return found;
}

/**
 * The attributes of one `<FieldCamera ... >` tag.
 *
 * Counted by brackets from the tag rather than matched by a regular
 * expression: these calls are written both on one line and across twelve, and
 * a line-based match would read the next component's attributes as this one's.
 */
function tagAttributes(body, start) {
  let depth = 0;
  for (let index = start; index < body.length; index += 1) {
    const character = body[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0 && character === ">") return body.slice(start, index + 1);
  }
  return body.slice(start);
}

const offences = [];
const countOnly = [];
let previewing = 0;

for (const file of walk(ROOT)) {
  const relative = file.split("\\").join("/");
  if (relative.endsWith("field-camera.tsx")) continue;
  const body = readFileSync(file, "utf8");
  let cursor = body.indexOf(TAG);
  while (cursor !== -1) {
    const line = body.slice(0, cursor).split("\n").length;
    const attributes = tagAttributes(body, cursor);
    if (HAS_PREVIEW.test(attributes)) previewing += 1;
    else if (SINGLE_FILE.test(attributes)) offences.push(`${relative}:${line}`);
    else countOnly.push(`${relative}:${line}`);
    cursor = body.indexOf(TAG, cursor + TAG.length);
  }
}

// A guard on the guard. The failure that matters is this script passing while
// reading nothing, so both answers are checked against a known sample - and
// the multi-line shape is checked too, since that is the one a line-based
// reader would get wrong.
const SAMPLES = [
  ['<FieldCamera label={x} fileCount={photo ? 1 : 0} onCapture={setPhoto} />', false],
  ['<FieldCamera label={x} file={photo} fileCount={photo ? 1 : 0} />', true],
  ['<FieldCamera\n  label={x}\n  file={photo}\n  fileCount={photo ? 1 : 0}\n/>', true],
  // A server-held photograph previews through `previewUrl`, and a slot
  // counting an uploaded list is still exempt from holding a File.
  ['<FieldCamera label={x} previewUrl={shot} fileCount={photo ? 1 : 0} />', true],
  ['<FieldCamera label={x} fileCount={rows.length} />', true],
];
for (const [sample, shouldPass] of SAMPLES) {
  const attributes = tagAttributes(sample, 0);
  const passes = HAS_PREVIEW.test(attributes) || !SINGLE_FILE.test(attributes);
  if (passes !== shouldPass) {
    console.error(
      "check-camera-previews: the reader no longer understands its own sample:\n" +
        sample,
    );
    process.exit(1);
  }
}

if (offences.length > 0) {
  console.error(
    "\nThese camera slots hold a photograph and show only a count:\n\n" +
      "  `fileCount={x ? 1 : 0}` means one File is in state, so there is a\n" +
      "  photograph to draw. Pass it as `file={x}` and the slot shows the\n" +
      "  picture and a retake button instead of the words \"1 photo ready\".\n\n" +
      "  A slot whose count comes from an already-uploaded server list holds\n" +
      "  no File and is not asked for one.\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

console.log(
  `Camera previews: ${previewing} slot(s) show the photograph they hold, ` +
    `${countOnly.length} count an uploaded list.`,
);
// Named, not just counted. Each of these either has a gallery showing the
// photograph elsewhere, or is the same defect as F-289 on another screen -
// and nobody can tell which from a number, which is exactly how the two
// disposal screens sat broken behind this line for as long as they did.
if (countOnly.length > 0) {
  console.log("  counting only (each needs a gallery elsewhere, or it is F-289 again):");
  for (const slot of countOnly) console.log(`    ${slot}`);
}
