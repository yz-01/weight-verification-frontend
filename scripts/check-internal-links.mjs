/**
 * An address inside this application must be reached with `next/link`.
 *
 * A plain `<a href="/somewhere">` throws the whole running application away
 * and loads it again: the auth context, every cached query, the list filters
 * the person had just set. It looks identical to a real link until you watch
 * the tab spinner.
 *
 * There was exactly one of them, on the Record-a-deduction button, and it went
 * unnoticed for months because the destination did open (F-357). What finally
 * exposed it was T-216: the create and edit forms are now intercepted routes,
 * and a hard navigation is never intercepted, so that one button was the one
 * that could not open its form as a dialog. A silent performance bug had
 * become a silent behaviour bug, and nothing in the type system or the linter
 * had an opinion about either.
 *
 * Only `/`-rooted hrefs are flagged. `http(s)://`, `mailto:`, `tel:` and `#`
 * anchors are all correctly plain anchors - they are not this application.
 */

import fs from "node:fs";
import path from "node:path";

const roots = ["src"];
const INTERNAL_ANCHOR = /<a\s[^>]*href=(?:"(\/[^"]*)"|\{`(\/[^`]*)`\})/g;

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
    for (const match of text.matchAll(INTERNAL_ANCHOR)) {
      const line = text.slice(0, match.index).split("\n").length;
      const href = match[1] ?? match[2];
      offences.push(
        `${file.replace(/\\/g, "/")}:${line}  <a href="${href}">`,
      );
    }
  }
}

if (offences.length > 0) {
  console.error(
    "Internal links must use `next/link`, not a plain anchor.\n" +
      "A plain anchor reloads the whole application, and an intercepted route\n" +
      "(the create and edit dialogs) never opens from one.\n",
  );
  for (const offence of offences) console.error("  " + offence);
  process.exit(1);
}

console.log("Internal links: every in-app address goes through next/link.");
