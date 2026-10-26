/**
 * JB25 (客户 10-26 事项 1): the ordinary records before 确认归档.
 *
 * 「确认归档前，不能对外转发、导出、打印或生成分享链接」 - preview stays, the other
 * three go grey with 「确认归档后才能导出 / 打印 / 发送」. 「删除必须验证本人六位数
 * 密码」 - the trash can; never on the phone (「只针对电脑 Web 后台页面」).
 * Rendered to static markup (the runner has no DOM); the screens are read as
 * source for the rules they apply.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ fieldStaff: false }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { is_field_staff: auth.fieldStaff }, can: () => true }),
}));

const { TooltipProvider } = await import("@/components/ui/tooltip");
const { FileActionButtons } = await import("@/components/shared/file-actions");
const { DeleteRecordButton } = await import("@/components/shared/delete-record-button");

function draw(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const source = { load: async () => new File([""], "a.pdf"), title: "MR-1" };

function slot(html: string, name: string) {
  const match = html.match(new RegExp(`<button[^>]*data-slot="file-action-${name}"[^>]*>`));
  if (!match) throw new Error(`no ${name}`);
  return match[0];
}

function read(file: string) {
  return readFileSync(path.join(process.cwd(), "src", file), "utf8");
}

describe("before 确认归档 a record is previewed only", () => {
  it("leaves preview and greys print, export and send with the reason", () => {
    const html = draw(<FileActionButtons source={source} blockedReason="确认归档后才能导出 / 打印 / 发送" />);
    expect(slot(html, "preview")).not.toMatch(/ disabled=""/);
    for (const action of ["print", "save", "share"]) {
      expect(slot(html, action)).toMatch(/ disabled=""/);
    }
    expect(html).toContain("确认归档后才能导出 / 打印 / 发送");
  });

  it("offers all four once confirmed", () => {
    const html = draw(<FileActionButtons source={source} />);
    for (const action of ["preview", "print", "save", "share"]) {
      expect(slot(html, action)).not.toMatch(/ disabled=""/);
    }
  });

  it("says the reason in the client's words", () => {
    expect(messages.draftRecords.notArchived).toBe("确认归档后才能导出 / 打印 / 发送");
  });
});

describe("the trash can", () => {
  it("is drawn in the office", () => {
    auth.fieldStaff = false;
    const html = draw(<DeleteRecordButton what="MR-1" onDelete={async () => undefined} />);
    expect(html).toContain('data-slot="delete-record"');
    expect(html).toContain("删除");
  });

  it("is never drawn for a phone account", () => {
    auth.fieldStaff = true;
    const html = draw(<DeleteRecordButton what="MR-1" onDelete={async () => undefined} />);
    expect(html).toBe("");
    auth.fieldStaff = false;
  });

  it("warns that it cannot be recovered and asks for the PIN next", () => {
    expect(messages.draftRecords.confirmBody).toContain("不能恢复");
    expect(messages.draftRecords.confirmBody).toContain("六位数签核密码");
  });
});

describe("each ordinary record applies the rule", () => {
  it.each([
    ["components/progress/progress-summary.tsx", "blockedReason={shown.archived_at ? undefined : notArchived}"],
    ["components/material-requests/material-requests-office.tsx", "blockedReason={decided ? undefined : notArchived}"],
    ["components/dashboard/field-task-sheet.tsx", 'blockedReason: row.status === "OPEN" ? notArchived : undefined'],
    ["components/consultant-workflow/application-detail.tsx", "blockedReason: confirmed ? undefined : notArchived"],
    ["components/document-workflow/documents.tsx", 'blockedReason={detail.data.status === "ARCHIVED" ? undefined : notArchived}'],
    ["components/schedule-planning/schedule-planning-workspace.tsx", 'disabled={revision.status !== "CONFIRMED"}'],
  ])("%s holds out until confirmed", (file, rule) => {
    expect(read(file)).toContain(rule);
  });

  it.each([
    ["components/progress/progress-summary.tsx", "deleteProgressSummary(shown.id)"],
    ["components/material-requests/material-requests-office.tsx", "deleteMaterialRequest(row.id)"],
    ["components/contractor-ops/operations-workspaces.tsx", "deleteFieldTask(row.id)"],
    ["components/consultant-workflow/application-detail.tsx", "deleteConsultantApplication(application.id)"],
    ["components/document-workflow/documents.tsx", "deleteDocument(detail.data!.id)"],
    ["components/shared/record-attachments.tsx", "deleteRecordAttachment(kind, recordId, row)"],
  ])("%s has the trash can", (file, call) => {
    expect(read(file)).toContain("<DeleteRecordButton");
    expect(read(file)).toContain(call);
  });

  it("sends a consultant application only once confirmed", () => {
    const detail = read("components/consultant-workflow/application-detail.tsx");
    expect(detail).toContain('draftWords("sendNeedsArchive")');
    expect(detail).toContain("confirmConsultantApplication(id)");
  });
});
