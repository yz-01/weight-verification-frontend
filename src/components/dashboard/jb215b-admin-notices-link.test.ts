/**
 * JB215B-8 (Lucas 11-17; jb208 / jb209 notes): the MSE Admin dashboard's
 * 「系统通知」 card listed the reader's own notices (`platform_ops/dashboard.py`
 * recent_notifications) but its 查看全部 - and any row with no link of its
 * own - went to `/notifications/search`, which is 通知管理: everybody's
 * notices. Both now open the reader's own list, where the bell's 查看全部
 * goes since JB205-8.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/dashboard/admin-dashboard.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("JB215B-8 the admin dashboard's notices", () => {
  it("never leads to everybody's notices", () => {
    expect(SOURCE).not.toContain('"/notifications/search"');
  });

  it("opens the reader's own list from 查看全部 and from a row with no link", () => {
    expect(SOURCE).toContain('export const ADMIN_OWN_NOTICES_HREF = "/notifications?mine=1";');
    expect(SOURCE).toContain("<Link href={ADMIN_OWN_NOTICES_HREF}");
    expect(SOURCE).toMatch(/\? rawHref\n\s+: ADMIN_OWN_NOTICES_HREF;/);
  });
});
