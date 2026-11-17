/**
 * JB215B (walk 11-17): 「这次要顾问看什么」 on the task window.
 *
 * Contractor office, 现场任务 › a disposal run (「执行清运 …」): the field
 * showed the raw code 「SITE_DISPOSAL_EXECUTION」. `submission_category` holds
 * other things on other tasks - a disposal run's marker, a site column's code
 * on a photo filed into that column - and only a consultant submission asks
 * the consultant anything. The field shows for those alone, always in words;
 * an older or unknown value reads the way the server files a new one
 * (`consultant_submission_type`: MATERIAL → 材料申请, anything else → 其他).
 * The siblings that printed the same field: 整理成顾问申请's source box and the
 * 待整理现场资料 export.
 *
 * Rendered to static markup (the runner has no DOM), or read in the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { FieldTask } from "@/interfaces/contractor-ops";
import { consultantAskType } from "@/lib/consultant-task-title";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-tasks",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "manager" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-closure", () => ({
  useRecordArchived: () => false,
  RecordClosurePanel: () => <div data-stub="closure" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { FieldTaskSheet } = await import("@/components/dashboard/field-task-sheet");

const words = zh.fieldStaffPwa.consultantCapture;
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

function task(overrides: Partial<FieldTask>): FieldTask {
  return {
    id: "t1", origin: "SITE", project: "p1", project_name: "E2E Tower", title: "Execute site disposal DR-E2E-001",
    record_no: "FT-P-E2E-002", task_type: "WASTE", instructions: "", work_location: "", submission_category: "",
    assigned_to: "worker", assigned_to_name: "阿成", created_by: "publisher", created_by_name: "王经理",
    category: null, category_name: null, priority: "NORMAL", due_at: null, status: "OPEN", can_confirm: false,
    evidence_required: 1, started_at: null, start_latitude: null, start_longitude: null, start_accuracy_m: null,
    submitted_at: null, reviewed_at: null, review_note: "", result_note: "", client_event_id: "e1",
    linked_record_type: "", linked_record_id: null, linked_record_reference: "", linked_at: null,
    photos: [], references: [], created_at: "2026-11-17T01:00:00Z", updated_at: "2026-11-17T01:00:00Z",
    ...overrides,
  } as unknown as FieldTask;
}

const render = (row: FieldTask) =>
  renderDetail(<FieldTaskSheet id="t1" onClose={() => {}} />, (client) =>
    client.setQueryData(["field-tasks", "detail", "t1"], row),
  );

describe("JB215B 「这次要顾问看什么」 on the task window", () => {
  it("is not shown on a disposal run, and its code never is", () => {
    const html = render(task({
      task_type: "WASTE",
      submission_category: "SITE_DISPOSAL_EXECUTION",
      linked_record_type: "DISPOSAL_EXECUTION",
      linked_record_reference: "DR-E2E-001",
    }));
    expect(html).not.toContain(words.askFor);
    expect(html).not.toContain("SITE_DISPOSAL_EXECUTION");
  });

  it("is not shown on a photo filed into a site column", () => {
    const html = render(task({ task_type: "PHOTO", title: "钢筋 - 2026-11-17 09:30", submission_category: "MAT-REBAR" }));
    expect(html).not.toContain(words.askFor);
    expect(html).not.toContain("MAT-REBAR");
  });

  it("stays on a consultant submission, in words", () => {
    const html = render(task({ task_type: "CONSULTANT", title: "RFI - 2026-11-17 09:30", submission_category: "RFI" }));
    expect(html).toContain(words.askFor);
    expect(html).toContain(words.askOption.RFI);
  });

  it("reads an unknown value on a consultant submission as 其他, never the code", () => {
    const html = render(task({ task_type: "CONSULTANT", title: "Check", submission_category: "WIR" }));
    expect(html).toContain(words.askOption.OTHER);
    expect(html).not.toContain(">WIR<");
  });
});

describe("JB215B what a task asks the consultant", () => {
  it("is one of the four, the way the server files it", () => {
    expect(consultantAskType({ task_type: "CONSULTANT", submission_category: "MATERIAL_CERT_SUBMISSION" })).toBe("MATERIAL_CERT_SUBMISSION");
    expect(consultantAskType({ task_type: "CONSULTANT", submission_category: "rfi" })).toBe("RFI");
    expect(consultantAskType({ task_type: "CONSULTANT", submission_category: "MATERIAL" })).toBe("MATERIAL_APPROVAL");
    expect(consultantAskType({ task_type: "CONSULTANT", submission_category: "WIR" })).toBe("OTHER");
    expect(consultantAskType({ task_type: "CONSULTANT", submission_category: "" })).toBeNull();
  });

  it("is nothing on any other task", () => {
    expect(consultantAskType({ task_type: "WASTE", submission_category: "SITE_DISPOSAL_EXECUTION" })).toBeNull();
    expect(consultantAskType({ task_type: "PHOTO", submission_category: "MAT-REBAR" })).toBeNull();
  });

  it("is in words on 整理成顾问申请 and in the 待整理现场资料 file", () => {
    const form = read("src/components/consultant-workflow/application-form.tsx");
    expect(form).not.toContain("<p>{sourceTask.data.submission_category}</p>");
    expect(form).toContain("{sourceAsk && <p>{askOption(sourceAsk)}</p>}");
    const list = read("src/components/consultant-workflow/applications-list.tsx");
    expect(list).toMatch(/key: "submission_category",\n\s+label: t\("field.applicationType"\),\n\s+values: \{/);
  });
});
