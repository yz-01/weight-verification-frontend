/**
 * JB210 walk 11-17 (findings-1117-A) on screen:
 *
 * - F-A4: 【导出】 / 【发送】 offered to a consultant without 「导出」 - gone; his
 *   own 顾问申请 / 资料包 work keeps them; preview and print stay.
 * - F-A5: a consultant 验收 / 退回 a 提交顾问审批 task in plain words, with no
 *   「需要继续整改」 hint; the contractor's window as before.
 * - F-A3: a typed report address of a module not ticked is refused, with
 *   「总部没有为您在这个项目开通这个模块」.
 * - N-A3: 材料目标's empty line says nothing about 新增 to him.
 */
import { describe, expect, it, vi } from "vitest";

import type { FieldTask } from "@/interfaces/contractor-ops";
import { fileActionsFor } from "@/components/shared/file-actions";
import { isRouteAllowed } from "@/lib/navigation";
import { refusedPageNotice } from "@/lib/refused-page";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({
  user: { id: "c1", account_type: "CONSULTANT" as string },
  codes: new Set<string>(),
}));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-tasks",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: (code: string) => auth.codes.has(code) }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-closure", () => ({
  useRecordArchived: () => false,
  RecordClosurePanel: () => <div data-stub="closure" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ExportButton } = await import("@/components/shared/export-button");
const { FileActionButtons } = await import("@/components/shared/file-actions");
const { FieldTaskSheet } = await import("@/components/dashboard/field-task-sheet");

function as(accountType: string, codes: string[] = []) {
  auth.user = { id: "c1", account_type: accountType };
  auth.codes = new Set(codes);
}

const exportButton = (props: { ownWork?: boolean } = {}) =>
  renderDetail(<ExportButton title="清单" onExport={async () => undefined} {...props} />);

const fileButtons = (props: { ownWork?: boolean } = {}) =>
  renderDetail(
    <FileActionButtons
      source={{ load: async () => new File([], "x.pdf"), title: "MI-001", recordKind: "MATERIAL_RECEIPT", recordId: "r1" }}
      {...props}
    />,
  );

describe("F-A4: 导出 / 发送 need 「导出」 for a consultant", () => {
  it("shows no list 导出 to a consultant without it", () => {
    as("CONSULTANT");
    expect(exportButton()).not.toContain('data-slot="export-menu"');
  });

  it("keeps it with 「导出」 ticked, on his own 顾问申请 / 资料包 work, and for the contractor", () => {
    as("CONSULTANT", ["report.export"]);
    expect(exportButton()).toContain('data-slot="export-menu"');
    as("CONSULTANT");
    expect(exportButton({ ownWork: true })).toContain('data-slot="export-menu"');
    as("TENANT");
    expect(exportButton()).toContain('data-slot="export-menu"');
  });

  it("leaves a record's PDF to preview and print without it", () => {
    as("CONSULTANT");
    const html = fileButtons();
    expect(html).toContain('data-slot="file-action-preview"');
    expect(html).toContain('data-slot="file-action-print"');
    expect(html).not.toContain('data-slot="file-action-save"');
    expect(html).not.toContain('data-slot="file-action-share"');
    as("CONSULTANT");
    expect(fileButtons({ ownWork: true })).toContain('data-slot="file-action-share"');
    as("TENANT");
    expect(fileButtons()).toContain('data-slot="file-action-save"');
  });

  it("drops 发送 from the four when asked", () => {
    expect(fileActionsFor("pdf", false, false)).toEqual(["preview", "print"]);
    expect(fileActionsFor("pdf")).toEqual(["preview", "print", "save", "share"]);
  });
});

const task = {
  id: "t1",
  origin: "SITE",
  project: "p1",
  project_name: "Tower A",
  title: "三楼 C3–C8 柱钢筋隐蔽验收",
  task_type: "INSPECTION",
  instructions: "",
  work_location: "",
  assigned_to: "worker",
  assigned_to_name: "阿明",
  created_by: "publisher",
  category: "col",
  category_name: "隐蔽工程验收",
  priority: "NORMAL",
  due_at: null,
  status: "SUBMITTED",
  can_confirm: true,
  can_close: false,
  evidence_required: 0,
  submitted_at: "2026-11-17T03:00:00Z",
  reviewed_at: null,
  review_note: "",
  result_note: "",
  photos: [],
  references: [],
  photo_count: 0,
  consultant_application: null,
  is_overdue: false,
  created_at: "2026-11-17T01:00:00Z",
  updated_at: "2026-11-17T03:00:00Z",
} as unknown as FieldTask;

const sheet = () =>
  renderDetail(<FieldTaskSheet id="t1" onClose={() => {}} />, (client) =>
    client.setQueryData(["field-tasks", "detail", "t1"], task),
  );

describe("F-A5: a consultant 验收 / 退回 a task sent to him", () => {
  it("offers 验收通过 and 退回, without the contractor's switch hint", () => {
    as("CONSULTANT", ["approval.view", "approval.review", "field_task.view"]);
    const html = sheet();
    expect(html).toContain("data-task-consultant-decide");
    expect(html).toContain(zh.taskFlow.consultantReview.accept);
    expect(html).toContain(zh.taskFlow.consultantReview.return);
    expect(html).not.toContain(zh.taskFlow.moreWork.hint);
    expect(html).not.toContain("data-task-decide");
  });

  it("leaves the contractor's window as it was", () => {
    as("TENANT", ["field_task.manage"]);
    const html = sheet();
    expect(html).toContain("data-task-decide");
    expect(html).toContain(zh.taskFlow.moreWork.hint);
    expect(html).not.toContain("data-task-consultant-decide");
  });
});

describe("F-A3: a report address of a module not ticked", () => {
  // 报表中心 + 整改／EHS ticked: what `consultant_features` sends.
  const consultant = ["dashboard", "safety", "hazard_rectification", "report_center", "report_safety", "consultant_menu"];

  it("is refused to the consultant, and says why", () => {
    expect(isRouteAllowed("MSE_TRACE", consultant, "/reports/contractor/progress")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", consultant, "/reports/contractor/attendance")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", consultant, "/reports/contractor/safety")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", consultant, "/reports/contractor/history")).toBe(true);
    expect(refusedPageNotice("/reports/contractor/progress", consultant)).toBe(
      "errors.api.consultant_module_not_granted",
    );
    expect(zh.errors.api.consultant_module_not_granted).toContain("总部没有为您在这个项目开通这个模块");
  });

  it("closes 现场记录中心 without its tick, even beside 材料管理", () => {
    const materials = ["material_receipts", "material_outgoing", "consultant_menu"];
    expect(isRouteAllowed("MSE_TRACE", materials, "/archive-queue")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", [...materials, "record_centre"], "/archive-queue")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", materials, "/receipts")).toBe(true);
  });

  it("changes nothing for the contractor", () => {
    expect(isRouteAllowed("MSE_TRACE", ["report_center"], "/reports/contractor/progress")).toBe(true);
    expect(refusedPageNotice("/deductions", ["report_center"])).toBe("common.pageNotOpen");
  });
});
