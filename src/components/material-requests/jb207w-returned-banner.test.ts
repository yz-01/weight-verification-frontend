import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207W round 2 (walk 11-17, JB206 13): a returned MR said 「此申请已退回并
 * 结束，不能修改或重新提交。」 while head office still had 【修改】. The server
 * does allow changing a decided request - approved or returned - for its
 * applicant or an approver, with the PIN and a 修改记录 (`update_request`,
 * Lucas 10-30 evening 「全部事项归档后都可以修改」); what a return ends is
 * sending it again. So 修改 stays and the banner no longer says 不能修改.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("a returned MR", () => {
  it("still offers 修改 where the server allows it (decided, applicant or approver)", () => {
    const office = read("src/components/material-requests/material-requests-office.tsx");
    // JB214-3d: the archive rule is the request's project's (`archiveLocks`).
    expect(office).toContain(
      "changeable || (mayChange && decided && !archiveLocks && !user?.is_field_staff)",
    );
    // 删除 stays pending-only, as the server's delete refuses a decided one.
    expect(office).toContain("{changeable && <DeleteRecordButton");
  });

  it("no longer says it cannot be changed - only that it cannot be sent again", () => {
    const words = {
      zh: ["修改", "重新提交"],
      "zh-TW": ["修改", "重新提交"],
      en: ["edited", "sent again"],
      ms: ["disunting", "dihantar semula"],
    } as const;
    for (const [locale, [changed, again]] of Object.entries(words)) {
      const notice = JSON.parse(read(`src/messages/${locale}.json`)).materialRequest.returnedNotice;
      expect(notice, locale).not.toContain(changed);
      expect(notice, locale).toContain(again);
    }
  });
});
