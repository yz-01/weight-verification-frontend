/**
 * JB221 (客户 11-19 事项 1, 图 1 图 2): 施工准证's 「施工事项名称」, the formal
 * permit before 签名批准, and the list.
 *
 * 「设置「施工事项名称」必填栏，由安全经理填写。安全经理使用公司原有的施工准证表格，在
 * 电脑上填写完成后，通过现有的上传附件按钮上传至系统，再签名批准。未上传正式施工准证，
 * 不允许签名批准。」 and on the list: 「在「项目」与「准证文件」之间显示「施工事项名称」。
 * 缩小准证文件栏，只显示一张缩略图及附件数量，腾出空间显示施工事项名称。名称过长时自动
 * 换行，最多显示两行，鼠标移上去可查看完整名称。搜索栏必须支持施工事项名称及关键词搜索。」
 * JB216's 「填写电子准证」 stays the other way to the formal permit (Lucas 「按1做」).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Permit, PermitFile, PermitWorkForm } from "@/interfaces/permit";
import { FIT_TABLE_PX, fitWidth } from "@/lib/table-fit";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
const session = vi.hoisted(() => ({ user: { id: "u-pm", is_field_staff: false } }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: session.user, can: () => false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/permits",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/site-operations/hazard-conversation", () => ({
  HazardConversationPanel: () => <div data-stub="room" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));
const posted = vi.hoisted(() => ({ calls: [] as [string, unknown][] }));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api: {
    post: vi.fn(async (url: string, body: unknown) => {
      posted.calls.push([url, body]);
      return { incident_no: "PM-PRJ-0001-001" };
    }),
    get: vi.fn(),
    list: vi.fn(),
  },
  toastSuccess: vi.fn(),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PermitDetail, permitKeys, hasFormalPermit } = await import("@/components/permits/permit-parts");
const { PermitWorkFormView } = await import("@/components/permits/permit-work-form");
const { PermitFilesCell } = await import("@/components/permits/permits-office");
const { approvePermit, returnPermit } = await import("@/services/permit.service");
const { recordAttachmentsKey } = await import("@/components/shared/record-attachments");
const { LIST_FITS } = await import("@/lib/list-fits");
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const OFFICE_SOURCE = read("src/components/permits/permits-office.tsx");
const PARTS_SOURCE = read("src/components/permits/permit-parts.tsx");
const PHONE_SOURCE = read("src/components/permits/field-permits.tsx");
const TABLE_SOURCE = read("src/components/shared/data-table.tsx");

const FILE: PermitFile = {
  id: "f-pdf",
  submission: 1,
  original_name: "ptw-form.pdf",
  content_type: "application/pdf",
  preview_type: "application/pdf",
  byte_size: 2048,
  uploaded_at: "2026-11-19T01:00:00Z",
  uploaded_by_name: "阿明",
  is_current: true,
  thumbnail_url: "https://cdn.example/ptw-form-thumb.png",
  photo: null,
};

const SAVED: PermitWorkForm = {
  permit_no: "PTW-PRJ-0001-001",
  subcontractor: "",
  work_lead: "",
  contact_phone: "",
  work_type: "动火作业",
  location: "3 楼 B 区",
  work_content: "焊接钢梁",
  work_start: "2026-11-19T01:00:00Z",
  work_end: "2026-11-19T09:00:00Z",
  safety_measures: "",
  approval_conditions: "",
  valid_from: "2026-11-19T01:00:00Z",
  valid_until: "2026-11-19T09:00:00Z",
  filled_by_name: "示范 项目经理",
  filled_at: "2026-11-19T02:20:00Z",
};

const UPLOADED = {
  id: "a-formal",
  original_name: "准证-3楼焊接.docx",
  uploaded_by_name: "示范 项目经理",
  uploaded_at: "2026-11-19T04:30:00Z",
};

const permit = (over: Partial<Permit> = {}): Permit => ({
  id: "p1",
  incident_no: "PM-PRJ-0001-001",
  project: "prj-1",
  project_name: "示范商业大厦一期",
  title: "施工准证申请",
  note: "动火作业",
  status: "RECTIFICATION_SUBMITTED",
  applied_at: "2026-11-19T01:00:00Z",
  applicant: "u-worker",
  applicant_name: "阿明（现场）",
  applicant_title: "现场人员",
  approver: "u-pm",
  approver_name: "示范 项目经理",
  submitted_at: "2026-11-19T01:00:00Z",
  decided_by: null,
  decided_by_name: null,
  decided_by_title: "",
  decided_at: null,
  review_note: "",
  signature: "",
  files: [FILE],
  file_names: "ptw-form.pdf",
  submission: 1,
  can_decide: true,
  can_resubmit: false,
  is_closed: false,
  created_by_name: "阿明（现场）",
  created_by_phone: "+60129990001",
  created_by_avatar: null,
  work_form: null,
  can_fill_work_form: true,
  work_name: "",
  formal_permit_files: [],
  ...over,
});

const detail = (row: Permit, presentation: "dialog" | "inline" = "dialog") =>
  renderDetail(<PermitDetail id="p1" presentation={presentation} onClose={() => undefined} />, (client) => {
    client.setQueryData(permitKeys("p1"), row);
    client.setQueryData(recordAttachmentsKey("HAZARD", "p1"), { attachments: [], closed: "", can_add: true });
  });
const p = zh.permits;
const missing = (...fields: string[]) => zh.common.missingFields.replace("{fields}", fields.join(zh.common.listSeparator));

describe("JB221-1 「施工事项名称」必填，由安全经理填写", () => {
  it("is the first field of the decision, marked required, with what to write", () => {
    const html = detail(permit());
    const panel = html.slice(html.indexOf('data-slot="permit-decision"'));
    expect(panel).toContain(p.field.workName);
    expect(panel).toContain(p.workNameHint);
    expect(panel).toMatch(/<input(?=[^>]*data-permit-work-name)[^>]*maxLength="200"/i);
    expect(panel.indexOf(p.field.workName)).toBeLessThan(panel.indexOf(p.field.approvalNote));
    expect(panel.indexOf(p.field.workName)).toBeLessThan(panel.indexOf(p.field.signature));
  });

  it("starts from the name typed at a return, and is sent with 签名批准 and 退回", async () => {
    expect(detail(permit({ work_name: "塔吊拆除" }))).toMatch(/value="塔吊拆除"/);
    const signature = new File(["x"], "sign.png", { type: "image/png" });
    await approvePermit("p1", signature, "同意", null, "3楼 B区钢梁焊接");
    const sent = posted.calls.at(-1)?.[1] as FormData;
    expect(posted.calls.at(-1)?.[0]).toBe("/api/permits/p1/approve_permit/");
    expect(sent.get("work_name")).toBe("3楼 B区钢梁焊接");
    await returnPermit("p1", "第 3 节没签名", "3楼 B区钢梁焊接");
    expect(posted.calls.at(-1)).toEqual([
      "/api/permits/p1/return_permit/",
      { reason: "第 3 节没签名", work_name: "3楼 B区钢梁焊接" },
    ]);
    expect(PARTS_SOURCE).toMatch(/returnPermit\(permit\.id, reason\.trim\(\), workName\.trim\(\)\)/);
  });

  it("shows on the window after 项目; while waiting says who writes it; an old approved permit shows no empty row", () => {
    const named = detail(permit({ work_name: "3楼 B区钢梁焊接" }));
    expect(named.indexOf(p.field.project)).toBeLessThan(named.indexOf("3楼 B区钢梁焊接"));
    // The applicant (no decision panel) reads who writes it.
    expect(detail(permit({ can_decide: false }))).toContain(p.workNamePending);
    const old = detail(permit({ status: "VERIFIED", is_closed: true, can_decide: false, decided_by_name: "示范 项目经理" }));
    expect(old).not.toContain(p.field.workName);
    expect(old).not.toContain(p.workNamePending);
  });

  it("is on the e-permit: the name, or where it is written", () => {
    const view = (row: Permit) => renderDetail(<PermitWorkFormView permit={row} onClose={() => undefined} />);
    const waiting = view(permit({ work_form: SAVED }));
    expect(waiting).toContain(p.eForm.workName);
    expect(waiting).toContain(p.eForm.workNameWhere);
    const signed = view(permit({ work_form: SAVED, status: "VERIFIED", work_name: "3楼 B区钢梁焊接" }));
    expect(signed).toContain("3楼 B区钢梁焊接");
    expect(signed).not.toContain(p.eForm.workNameWhere);
  });
});

describe("JB221-2/3 no 正式施工准证, no 签名批准", () => {
  it("says what to do when there is none, and 签名批准 names everything missing", () => {
    const html = detail(permit());
    expect(html).toContain(p.formal.label);
    expect(html).toContain(p.formal.missing);
    expect(html).toContain(missing(p.field.workName, p.formal.label, p.field.signature));
    expect(hasFormalPermit(permit())).toBe(false);
  });

  it("tells a phone approver it is done on the computer", () => {
    session.user = { id: "u-pm", is_field_staff: true };
    try {
      const html = detail(permit(), "inline");
      expect(html).toContain(p.formal.missingPhone);
      expect(html).not.toContain(p.formal.attachHint);
    } finally {
      session.user = { id: "u-pm", is_field_staff: false };
    }
  });

  it("names the uploaded file - who, when - and then only the signature is missing", () => {
    const html = detail(permit({ work_name: "3楼 B区钢梁焊接", formal_permit_files: [UPLOADED] }));
    expect(html).toContain("准证-3楼焊接.docx");
    expect(html).toContain(p.formal.uploaded.split("{file}")[0]);
    expect(html).toContain("示范 项目经理");
    expect(html).toContain(p.formal.archivedWith);
    expect(html).not.toContain(p.formal.missing);
    expect(html).toContain(missing(p.field.signature));
    expect(hasFormalPermit(permit({ formal_permit_files: [UPLOADED] }))).toBe(true);
  });

  it("takes a saved e-permit as the formal permit too (JB216 stays one way)", () => {
    const html = detail(permit({ work_form: SAVED }));
    expect(html).toContain(p.formal.ePermit.replace("{no}", "PTW-PRJ-0001-001").replace("{name}", "示范 项目经理"));
    expect(html).toContain(missing(p.field.workName, p.field.signature));
    expect(hasFormalPermit(permit({ work_form: SAVED }))).toBe(true);
  });

  it("puts the upload hint on 「附件」 for the deciding office reader only, and re-reads the permit after a file", () => {
    expect(detail(permit())).toContain(p.formal.attachHint);
    expect(detail(permit({ can_decide: false }))).not.toContain(p.formal.attachHint);
    expect(detail(permit({ status: "VERIFIED", is_closed: true, can_decide: false }))).not.toContain(p.formal.attachHint);
    expect(PARTS_SOURCE).toMatch(/onChanged=\{\(\) => void queryClient\.invalidateQueries\(\{ queryKey: permitKeys\(\) \}\)\}/);
    // A refusal for a missing formal permit reads the permit again too.
    expect(PARTS_SOURCE).toMatch(/reasonError\.code === "permit_formal_permit_required"/);
  });

  it("says the server's refusals plainly, in four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.errors.api.permit_work_name_required).toBeTruthy();
      expect(messages.errors.api.permit_formal_permit_required).toBeTruthy();
    }
    expect(zh.errors.api.permit_formal_permit_required).toContain("上传附件");
  });
});

describe("JB221-4…7 the list", () => {
  it("puts 施工事项名称 between 项目 and 准证文件, two lines at most", () => {
    const at = (needle: string) => OFFICE_SOURCE.indexOf(needle);
    expect(at('accessorKey: "project_name"')).toBeLessThan(at('accessorKey: "work_name"'));
    expect(at('accessorKey: "work_name"')).toBeLessThan(at('id: "files"'));
    expect(OFFICE_SOURCE).toMatch(/line-clamp-2[^"]*" data-slot="permit-work-name"/);
    expect(PHONE_SOURCE).toMatch(/line-clamp-2[^"]*" data-slot="permit-work-name"/);
  });

  it("shows one picture of the 准证文件 and how many there are", () => {
    const three = [FILE, { ...FILE, id: "f2" }, { ...FILE, id: "f3" }];
    const html = renderDetail(<PermitFilesCell files={three} />);
    expect(html.match(/data-file-thumb=/g)?.length).toBe(1);
    expect(html).toContain("共 3 个");
    expect(html).toContain("[&amp;_[data-file-thumb]]:size-12");
    expect(renderDetail(<PermitFilesCell files={[]} />)).toContain("—");
  });

  it("fits 1366 px with 已打包 under 「字段」, under a new column key", () => {
    const fit = LIST_FITS.permits;
    expect(fit.columns.work_name).toBe("name");
    expect(Object.keys(fit.columns).indexOf("work_name")).toBe(Object.keys(fit.columns).indexOf("project_name") + 1);
    expect(fit.hidden).toEqual(["pack"]);
    expect(fit.storageKey).toBe("permits.v2");
    expect(fitWidth(fit.columns, fit.hidden)).toBeLessThanOrEqual(FIT_TABLE_PX);
  });

  it("says in the search box what it finds, and exports the name after 项目", () => {
    expect(OFFICE_SOURCE).toContain('searchPlaceholder={t("searchPlaceholder")}');
    expect(TABLE_SOURCE).toContain('placeholder={searchPlaceholder || t("common.searchPlaceholder")}');
    expect(p.searchPlaceholder).toContain("施工事项名称");
    expect(OFFICE_SOURCE).toMatch(
      /\{ key: "project_name", label: t\("field\.project"\) \},\n\s*\{ key: "work_name", label: t\("field\.workName"\) \},/,
    );
  });

  it("has every new word in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const m = messages.permits;
      for (const value of [
        m.field.workName, m.workNameHint, m.workNamePending, m.searchPlaceholder, m.fileCount,
        m.formal.label, m.formal.missing, m.formal.missingPhone, m.formal.uploaded, m.formal.ePermit,
        m.formal.archivedWith, m.formal.attachHint, m.eForm.workName, m.eForm.workNameWhere,
        messages.mySubmissions.field.permit_work_name,
      ]) {
        expect(value).toBeTruthy();
      }
      expect("fillHint" in m.eForm).toBe(false);
    }
    expect(zhTW.permits.field.workName).toBe("施工事項名稱");
  });
});
