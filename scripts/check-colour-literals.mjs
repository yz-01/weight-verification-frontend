/**
 * Colours come from the theme, not from the component (UI phase, Lucas
 * 2026-10-08: 「确保整个 UI 主题有覆盖到整个系统」, light and dark both).
 *
 * The design tokens in `src/app/globals.css` decide what every role looks
 * like in each mode: `bg-card`, `text-muted-foreground`, `bg-tone-amber/12`.
 * A component that names a colour itself - `#087f8c`, `rgba(0,0,0,.4)`,
 * `bg-amber-50`, `text-white` - looks right in the mode it was written in
 * and wrong in the other, and it is the spot a theme change silently misses.
 *
 * This fails on any such literal in `src/` outside the allow-list below.
 * Each allowed file carries the exact number of literals it may hold and why
 * they are intentional (a QR code is black on white in every mode; a camera
 * viewfinder is black; a print page is black text on white paper). The count
 * is exact, so a new literal in an allowed file fails too, and an entry whose
 * literals are gone must come off the list.
 *
 * Tests are not scanned: they assert on colours rather than paint them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { walkFiles } from "./lib/walk.mjs";

const ROOT = path.join(process.cwd(), "src");

const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNCTION = /(?<![a-zA-Z-])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
const PALETTE_CLASS =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?(?![\w-])/g;

/**
 * Files that may name colours, how many, and why. Keep each reason specific:
 * it is what the next person reads before adding a line here.
 */
const ALLOWED = new Map([
  ["app/layout.tsx", [2, "The browser's theme-color meta: the page background in light and in dark, read by the phone's status bar before any CSS loads."]],
  ["app/manifest.webmanifest/route.ts", [2, "PWA manifest: install splash background and theme colour, read by the OS outside the page, so they cannot be CSS variables."]],
  ["app/driver-manifest.webmanifest/route.ts", [2, "PWA manifest (driver app): as above."]],
  ["app/field-manifest.webmanifest/route.ts", [2, "PWA manifest (field app): as above."]],
  ["lib/map-palette.ts", [8, "Leaflet writes path colours into SVG attributes, which cannot read CSS variables: the design's data colours as literals, in one place."]],
  ["lib/photo-compression.ts", [2, "A canvas fill behind a photo being re-encoded to JPEG (no transparency): pixels, not page colour."]],
  ["components/field-staff/field-signature-pad.tsx", [1, "The signature ink drawn on the canvas: dark ink on the white paper, saved into the signature image."]],
  ["components/projects/project-qr-panel.tsx", [2, "QR code colours: black on white in every mode, or a scanner cannot read it."]],
  ["components/suppliers/supplier-qr-panel.tsx", [3, "QR code colours (black on white) and the print page's own HTML, which prints outside the app's CSS."]],
  ["components/suppliers/supplier-site-codes.tsx", [2, "QR code colours: black on white in every mode."]],
  ["components/qrcodes/admin-qr-workspace.tsx", [2, "QR code colours: black on white in every mode."]],
  ["components/site-access/emergency-list-workspace.tsx", [4, "The 紧急在场名单 print page: an HTML string printed outside the app's CSS, black on white."]],
  ["components/shared/field-camera.tsx", [1, "The camera viewfinder is black behind the live picture in every mode."]],
  ["components/shared/file-preview.tsx", [2, "Video frames are black and PDF frames white, as the media itself is, in every mode."]],
  ["components/field-staff/supplier-qr-scanner.tsx", [3, "Camera viewfinder: black frame, the white scan window and the dimmed surround over the live picture."]],
  ["components/site-access/gate-qr-scanner.tsx", [3, "Camera viewfinder: black frame, the white scan window and the dimmed surround over the live picture."]],
  ["components/field-staff/field-staff-workspace.tsx", [1, "The phone header's soft drop shadow (p41): a shadow, the same in both modes."]],
  ["components/consultant-workflow/application-detail.tsx", [5, "Owned by the record-detail package (p45), not converted here: white digits on the step circles. A ceiling, not an exact count, so that package converting them does not trip this check.", "ceiling"]],
]);

const problems = [];
let scanned = 0;
const seen = new Map();

for (const relative of walkFiles(ROOT, /\.(ts|tsx)$/)) {
  if (/\.test\.(ts|tsx)$/.test(relative)) continue;
  scanned += 1;
  const source = readFileSync(path.join(ROOT, relative), "utf8");
  const found = [];
  for (const pattern of [HEX, FUNCTION, PALETTE_CLASS]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      found.push(`${relative}:${line}: ${match[0]}`);
    }
  }
  if (!found.length) continue;
  seen.set(relative, found.length);
  const allowed = ALLOWED.get(relative);
  if (!allowed) {
    for (const line of found) {
      problems.push(
        `${line} names a colour. Use a theme role (bg-card, text-muted-foreground, ` +
          `bg-tone-amber/12, bg-paper, bg-overlay…) so it follows light and dark.`,
      );
    }
  } else if (allowed[2] === "ceiling" ? found.length > allowed[0] : allowed[0] !== found.length) {
    problems.push(
      `${relative}: ${found.length} colour literal(s), the allow-list says ${allowed[0]} ` +
        `(${allowed[1]}). Use a theme role for the new one, or update the count ` +
        `if the change is intentional:\n      ${found.join("\n      ")}`,
    );
  }
}

for (const [relative, [count, , kind]] of ALLOWED) {
  if (!seen.has(relative) && kind !== "ceiling") {
    problems.push(
      `${relative}: on the colour allow-list (${count}) but has no colour literal ` +
        `left. Delete its entry.`,
    );
  }
}

if (problems.length) {
  console.error("Colour literals:\n");
  for (const line of problems) console.error(`  ${line}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `Colour literals: ${scanned} files scanned, colours only from the theme ` +
    `outside ${ALLOWED.size} allow-listed file(s).`,
);
