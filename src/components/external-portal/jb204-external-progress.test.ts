/**
 * JB204-3 (Lucas 11-16 audit): 「工程进度」 on the external access link now
 * lists the site's confirmed progress records (the server's side is pinned in
 * `external_portal.tests.test_jb204_external_progress`). A record may arrive
 * with no percentage (H5/H11), sent as "" - the page shows 「—」 for it, not a
 * lone 「%」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(path.join(process.cwd(), "src/components/external-portal/external-portal.tsx"), "utf8");

describe("a progress row on the external link", () => {
  it("shows the percentage only when there is one", () => {
    expect(page).toContain(
      '{item.percent_complete ? `${item.percent_complete}%` : t("common.emptyValue")}',
    );
    expect(page).not.toContain(">{item.percent_complete}%<");
  });
});
