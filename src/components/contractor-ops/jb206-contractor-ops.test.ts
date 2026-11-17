/**
 * JB206 (Lucas 11-16 audit) in 环保材料 and Progress Claim:
 *
 * - JB206-4: 转交 lists only the people who can open the application's
 *   project - the list is asked for this record;
 * - JB206-8: 「此项目尚未绑定回收商」 tells a project user to ask head office;
 * - JB206-8: 【丢弃这期 Claim】 asks before it deletes the draft.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("转交 offers only who can open the project (JB206-4)", () => {
  it("asks for this application's list", () => {
    const page = source("src/components/contractor-ops/waste-outgoing-workspace.tsx");
    expect(page).toContain('queryKey: ["waste-outgoing", "delegate-options", record.id]');
    expect(page).toContain("queryFn: () => getWasteOutgoingDelegateOptions(record.id)");
    expect(source("src/services/waste-outgoing.service.ts")).toContain(
      'api.get("/api/waste-outgoing/get_delegate_options/", record ? { record } : {})',
    );
  });

  it("words the server's refusal", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect((messages.errors.api as Record<string, string>).waste_outgoing_delegate_not_on_project).toBeTruthy();
    }
  });
});

describe("no recycler bound: whom to ask (JB206-8)", () => {
  it("tells a project user to ask head office", () => {
    const page = source("src/components/contractor-ops/waste-outgoing-workspace.tsx");
    expect(page).toContain('const mayBind = useAuth().can("partnership.manage");');
    expect(page).toContain('t(mayBind ? "assign.noPartners" : "assign.noPartnersAskHeadOffice")');
    expect(zh.wasteOutgoing.assign.noPartnersAskHeadOffice).toContain("请联系总部");
    for (const messages of [zhTW, en, ms]) expect(messages.wasteOutgoing.assign.noPartnersAskHeadOffice).toBeTruthy();
  });
});

describe("丢弃这期 Claim asks first (JB206-8)", () => {
  it("only the confirm deletes", () => {
    const page = source("src/components/contractor-ops/claim-engine.tsx");
    expect(page).toContain("onClick={() => setDiscarding(true)}");
    expect(page.match(/discard\.mutate\(\)/g)).toHaveLength(1);
    expect(page).toMatch(/<ConfirmDialog\s+open=\{discarding\}[\s\S]*?onConfirm=\{\(\) => discard\.mutate\(\)\}/);
    for (const messages of [zh, zhTW, en, ms]) expect(messages.claims.discardConfirm.description).toBeTruthy();
  });
});
