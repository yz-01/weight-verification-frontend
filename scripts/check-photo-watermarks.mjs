/**
 * Which screens show a photograph with its provenance burned in, and which
 * deliberately do not.
 *
 * Evidence photographs exist in two forms. `image` is the file as it was
 * uploaded; `watermarked` is a derivative with the project, the time and the
 * GPS fix rendered into the pixels, so that the photograph still carries its
 * own provenance after somebody copies it out of the system. Almost every
 * screen wants the stamped one - a photograph of a delivery is worth nothing
 * as evidence once it is one JPEG among many in a folder.
 *
 * The material-receipt screen is the exception, and it is an exception the
 * user asked for by name (2026-09-05): "照片的GPS位置和时间不需要放水印，
 * 只是这里的不用水印而已，因为这个照片可以随时让项目经理复制到别的地方".
 * The project manager copies those photographs into their own paperwork, and
 * a stamp across the corner of the goods is in the way there.
 *
 * So the receipt screen is not merely permitted to be unstamped, it is
 * *required* to be: a well-meaning developer tidying up an inconsistency
 * would silently undo a thing the customer asked for, and nobody would notice
 * until the photographs came back stamped. This script fails in both
 * directions for that reason.
 *
 * The other unstamped call sites are a different matter and are recorded here
 * as such: their serializers send no `watermarked` field at all, so the screen
 * has nothing to choose (F-217). That is a backend gap, not a screen bug, and
 * writing down which of the two reasons applies is the whole point of keeping
 * this list by hand.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/components";

/** Screens that must show the untouched original, and why. */
const MUST_NOT_STAMP = new Map([
  [
    "src/components/receipts/view-receipt.tsx",
    "the user asked for these to be copyable into other paperwork unstamped",
  ],
]);

/**
 * Screens whose photo type carries no stamped variant to choose.
 *
 * Down to one, and that one is not a gap. The contractor dashboard's photo
 * feed reads `EvidenceAsset` through `watermarked_url_for_asset`, so the
 * `image` it receives is already the stamped copy - there is no second field
 * because the first one is the derivative. Listing it here rather than
 * deleting the list keeps that fact written down; the next reader would
 * otherwise see a bare `.image` and either "fix" it or record it as a bug
 * for a second time.
 *
 * The two waste-task screens were the real F-217, and they are gone from
 * this list: the payload in `contractor_ops/waste_outgoing.py` was built by
 * hand and omitted the stamped URL that its own model's serializer had
 * always exposed.
 */
const NO_VARIANT_AVAILABLE = new Map([
  [
    "src/components/dashboard/contractor-dashboard.tsx",
    "PhotoRow.image is already the watermarked derivative, not the original",
  ],
]);

/** An image source that reads a record's photo field. */
const SOURCE = /(?:src|href)=\{([^}]*\.image\b[^}]*)\}/g;

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.tsx$/.test(entry)) found.push(path);
  }
  return found;
}

const unstamped = [];
const stamped = [];
const stampedButShouldNotBe = [];

for (const file of walk(ROOT)) {
  const relative = file.split("\\").join("/");
  const body = readFileSync(file, "utf8");
  for (const match of body.matchAll(SOURCE)) {
    const line = body.slice(0, match.index).split("\n").length;
    const where = `${relative}:${line}`;
    const carriesStamp = /watermarked/.test(match[1]);
    if (carriesStamp && MUST_NOT_STAMP.has(relative)) {
      stampedButShouldNotBe.push(where);
    } else if (carriesStamp) {
      stamped.push(where);
    } else if (
      !MUST_NOT_STAMP.has(relative) &&
      !NO_VARIANT_AVAILABLE.has(relative)
    ) {
      unstamped.push(where);
    }
  }
}

// A guard on the guard: the reader has to see both shapes for the two lists
// above to mean anything. Were the pattern to stop matching, every screen
// would look compliant and this script would pass for ever while checking
// nothing - the quietest way for a check to die.
const STAMPED_SAMPLE = 'src={photo.watermarked || photo.image}';
const PLAIN_SAMPLE = 'src={photo.image}';
for (const [sample, shouldCarry] of [
  [STAMPED_SAMPLE, true],
  [PLAIN_SAMPLE, false],
]) {
  const found = [...sample.matchAll(SOURCE)];
  if (found.length !== 1 || /watermarked/.test(found[0][1]) !== shouldCarry) {
    console.error(
      `check-photo-watermarks: the reader no longer understands \`${sample}\`.`,
    );
    process.exit(1);
  }
}

if (stampedButShouldNotBe.length > 0) {
  console.error(
    "\nThese photographs are stamped and were asked to be left alone:\n\n" +
      "  The project manager copies material-receipt photographs into their\n" +
      "  own paperwork, and the user asked for no GPS or time stamp on that\n" +
      "  screen specifically (2026-09-05). Use the plain `.image`.\n",
  );
  for (const offence of stampedButShouldNotBe) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

if (unstamped.length > 0) {
  console.error(
    "\nThese screens show an evidence photograph with no provenance:\n\n" +
      "  Use `photo.watermarked || photo.image` so the photograph still\n" +
      "  carries its project, time and GPS fix once it leaves the system.\n\n" +
      "  If the screen genuinely wants the untouched original, add it to\n" +
      "  MUST_NOT_STAMP in this script with the reason. If its serializer\n" +
      "  sends no stamped variant, add it to NO_VARIANT_AVAILABLE - and note\n" +
      "  that the fix for those belongs in the serializer, not here.\n",
  );
  for (const offence of unstamped) console.error(`  ${offence}`);
  console.error("");
  process.exit(1);
}

console.log(
  `Photo watermarks: ${stamped.length} source(s) stamped, ` +
    `${MUST_NOT_STAMP.size} screen(s) unstamped by request, ` +
    `${NO_VARIANT_AVAILABLE.size} already stamped by the serializer.`,
);
