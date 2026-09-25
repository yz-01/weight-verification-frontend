/**
 * A question this application asks must be asked by this application.
 *
 * `window.prompt`, `window.confirm` and `window.alert` look like a free
 * dialog. They are not, and the reasons compound:
 *
 * * **They are not translated.** The catalogues cover every other string on
 *   screen; a native prompt is whatever the caller passed plus the browser's
 *   own OK/Cancel in the browser's language. A Malay-speaking clerk was being
 *   asked, in English, for the one field the customer insisted on.
 * * **They cannot be marked required or styled.** `requires={...}` and the
 *   red asterisk are how every other compulsory field in this product says so,
 *   and `check-required-stars.mjs` enforces it. A prompt opts out silently.
 * * **They can be suppressed.** Browsers block them on a page the person has
 *   not interacted with, and some embedded webviews drop them entirely. The
 *   call then returns null and the action quietly does nothing - not an error,
 *   not a message, nothing. That is how "returning a task did not work
 *   sometimes" happens with no trace in any log.
 *
 * Found by T-297: the reason for sending a material-outgoing application back
 * was collected this way, and by D-211/D-227 that application then *ends* -
 * the sentence is the last thing the applicant is ever told about why.
 *
 * `confirm` is on the list for one more reason: this product's answer to a
 * destructive action is a switch that arms the button (C-018), decided twice
 * by the customer in unrelated places. A browser confirm is the shape they
 * rejected.
 */

import fs from "node:fs";
import path from "node:path";

const roots = ["src"];

/**
 * Matches a call, not the word. `window.` is optional because bare `confirm(`
 * resolves to the same global, and a comment *about* these functions must not
 * trip the check - so the needle requires an opening parenthesis and the line
 * must not be a comment.
 */
const NATIVE_DIALOG = /(?<![.\w])(?:window\s*\.\s*)?(prompt|confirm|alert)\s*\(/g;

/** Every `.tsx` under the given roots. */
function sources(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, found);
    else if (entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

const offences = [];

for (const root of roots) {
  for (const file of sources(root)) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Prose about these functions is fine; a call is not.
      if (
        trimmed.startsWith("*") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*")
      ) {
        return;
      }
      for (const match of line.matchAll(NATIVE_DIALOG)) {
        offences.push(
          `${file.replace(/\\/g, "/")}:${index + 1}  ${match[0]}`,
        );
      }
    });
  }
}

if (offences.length > 0) {
  console.error(
    "Native browser dialogs are not this application's dialogs.\n" +
      "They are untranslated, cannot be marked required, and are silently\n" +
      "suppressed in some browsers - in which case the action does nothing at\n" +
      "all. Use a <Dialog> with a FieldWrapper, or a switch that arms the\n" +
      "button for a destructive step (C-018).\n",
  );
  for (const offence of offences) console.error("  " + offence);
  process.exit(1);
}

console.log(
  "Native dialogs: every question is asked by the application, in the reader's language.",
);
