/**
 * List source files without `fs.globSync`.
 *
 * `globSync` arrived in Node 22. CI runs Node 20, and Next 16 supports 20.9
 * upward, so a check that needs 22 is a check that cannot run for anyone on
 * the project's own floor — and it fails there in the least useful way, with
 * `does not provide an export named 'globSync'` from inside an import, before
 * a single line of the check has executed.
 *
 * Four scripts hit this at once on their first CI run. The repository already
 * had the portable shape in `check-list-params.mjs` and `check-env-parity.mjs`
 * — plain `readdirSync` recursion — so this is that, in one place, rather than
 * a fourth copy.
 *
 * Paths come back with forward slashes on every platform, because they are
 * printed in problem messages that people paste into a search box.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Every file under `root` whose name matches `pattern`, relative to `root`.
 *
 * Directory entries are read with `withFileTypes` so no extra `statSync` call
 * is needed per entry, and a symlinked directory is walked as a file rather
 * than followed — a loop through a link would hang the check rather than fail
 * it, which is the worse failure.
 */
export function walkFiles(root, pattern = /\.tsx?$/) {
  const found = [];

  const visit = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(full, relative);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        found.push(relative);
      }
    }
  };

  visit(root, "");
  return found.sort();
}
