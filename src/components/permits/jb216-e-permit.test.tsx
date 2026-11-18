/**
 * JB216 (客户 11-18 事项 1, 图 1 图 2): 「填写电子准证」 on the 施工准证 window.
 *
 * 「在左侧「准证文件」标题右边设置「填写电子准证」按钮，仅后台获授权审批人员可操作，
 * 申请人不能修改。点击后直接填写电子准证，自动带入本笔申请的资料、照片及附件，补填
 * 施工内容、地点、起止时间、安全措施及批准条件。保存后，使用右侧原有的审批意见、签名
 * 位置及「签名批准」按钮完成审批，不另建申请。」 - and 施工类别 is the company's own
 * list (分类管理 → 施工准证 · 施工类别), plus 「其他（写明）」.
 */
import { describe, expect, it, vi } from "vitest";

import type { Permit, PermitFile, PermitWorkForm, PermitWorkType } from "@/interfaces/permit";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
// The drop-down's choices drawn in place, so a static render can read them.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children: React.ReactNode; value?: string }) => (
    <div data-select data-value={value ?? ""}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div data-select-trigger>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span data-select-placeholder>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div data-select-content>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <span data-select-item={value}>{children}</span>
  ),
}));
const session = vi.hoisted(() => ({ codes: [] as string[], user: { id: "u-pm", is_field_staff: false } }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: session.user, can: (code: string) => session.codes.includes(code) }),
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
      return { incident_no: "PM-PRJ-0001-001", work_form: { permit_no: "PTW-PRJ-0001-001" } };
    }),
    get: vi.fn(),
    list: vi.fn(),
  },
  toastSuccess: vi.fn(),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PermitDetail, PermitDocuments, permitKeys } = await import("@/components/permits/permit-parts");
const { PermitWorkFormFields, PermitWorkFormView, formInput, startingDraft, typeChoice, OTHER_WORK_TYPE, MANAGE_WORK_TYPES_HREF } =
  await import("@/components/permits/permit-work-form");
const { PermitWorkTypesPanel } = await import("@/components/contractor-ops/permit-work-types");
const { saveWorkForm, PERMIT_WORK_TYPES_KEY } = await import("@/services/permit.service");
const { recordAttachmentsKey } = await import("@/components/shared/record-attachments");

const PHOTO: PermitFile = {
  id: "f-photo",
  submission: 1,
  original_name: "ptw-page-1.jpg",
  content_type: "image/jpeg",
  preview_type: "image/jpeg",
  byte_size: 2048,
  uploaded_at: "2026-11-18T01:00:00Z",
  uploaded_by_name: "阿明",
  is_current: true,
  thumbnail_url: "https://cdn.example/ptw-page-1-thumb.jpg",
  photo: {
    url: "https://cdn.example/ptw-page-1.jpg",
    thumbnail_url: "https://cdn.example/ptw-page-1-thumb.jpg",
    captured_at: "2026-11-18T01:00:00Z",
    latitude: null,
    longitude: null,
  },
};
const FORM_FILE: PermitFile = {
  ...PHOTO,
  id: "f-pdf",
  original_name: "ptw-form.pdf",
  content_type: "application/pdf",
  preview_type: "application/pdf",
  thumbnail_url: null,
  photo: null,
};

const SAVED: PermitWorkForm = {
  permit_no: "PTW-PRJ-0001-001",
  subcontractor: "ABC 脚手架",
  work_lead: "阿明",
  contact_phone: "+60129990001",
  work_type: "动火作业",
  location: "3 楼 B 区",
  work_content: "焊接钢梁",
  work_start: "2026-11-19T01:00:00Z",
  work_end: "2026-11-19T09:00:00Z",
  safety_measures: "配灭火器，专人看火",
  approval_conditions: "每天收工前检查火种",
  valid_from: "2026-11-19T01:00:00Z",
  valid_until: "2026-11-19T09:00:00Z",
  filled_by_name: "示范 项目经理",
  filled_at: "2026-11-18T02:20:00Z",
};

const permit = (over: Partial<Permit> = {}): Permit => ({
  id: "p1",
  incident_no: "PM-PRJ-0001-001",
  project: "prj-1",
  project_name: "示范商业大厦一期",
  title: "施工准证申请",
  note: "动火作业，3 楼焊接",
  status: "RECTIFICATION_SUBMITTED",
  applied_at: "2026-11-18T01:00:00Z",
  applicant: "u-worker",
  applicant_name: "阿明（现场）",
  applicant_title: "现场人员",
  approver: "u-pm",
  approver_name: "示范 项目经理",
  submitted_at: "2026-11-18T01:00:00Z",
  decided_by: null,
  decided_by_name: null,
  decided_by_title: "",
  decided_at: null,
  review_note: "",
  signature: "",
  files: [PHOTO, FORM_FILE],
  file_names: "ptw-page-1.jpg, ptw-form.pdf",
  submission: 1,
  can_decide: true,
  can_resubmit: false,
  is_closed: false,
  created_by_name: "阿明（现场）",
  created_by_phone: "+60129990001",
  created_by_avatar: null,
  work_form: null,
  can_fill_work_form: true,
  ...over,
});

const TYPES: PermitWorkType[] = [
  { id: "t1", name: "动火作业", is_preset_name: true, sort_order: 1 },
  { id: "t2", name: "高空作业", is_preset_name: true, sort_order: 2 },
  { id: "t3", name: "喷砂作业", is_preset_name: false, sort_order: 9 },
];

const seedLists = (client: import("@tanstack/react-query").QueryClient, types = TYPES) => {
  client.setQueryData(PERMIT_WORK_TYPES_KEY, types);
  client.setQueryData(recordAttachmentsKey("HAZARD", "p1"), {
    attachments: [{ id: "a1", original_name: "method-statement.docx" }],
  });
};

const panel = (row: Permit) => renderDetail(<PermitDocuments permit={row} />);
const form = (row: Permit, types = TYPES) =>
  renderDetail(<PermitWorkFormFields permit={row} onClose={() => undefined} />, (client) => seedLists(client, types));
const view = (row: Permit) =>
  renderDetail(<PermitWorkFormView permit={row} onClose={() => undefined} />, (client) => seedLists(client));
const e = zh.permits.eForm;

describe("JB216-1 the button sits right of 「准证文件」 (图 1)", () => {
  it("is in the panel's header, beside its title, for whoever may sign it", () => {
    const html = panel(permit());
    expect(html).toMatch(new RegExp(`${zh.permits.files.documents}</h3><button[^>]*>.*?${e.fill}</button>`));
  });

  it("is not there for the applicant, a reader, or once it may not be filled", () => {
    for (const row of [permit({ can_fill_work_form: false }), permit({ status: "VERIFIED", can_fill_work_form: false })]) {
      const html = panel(row);
      expect(html).toContain(zh.permits.files.documents);
      expect(html).not.toContain(e.fill);
    }
  });

  it("S1: a form sent only as photos keeps the panel, the button and says where the form is", () => {
    const html = panel(permit({ files: [PHOTO] }));
    expect(html).toContain(zh.permits.files.documents);
    expect(html).toContain(e.fill);
    expect(html).toContain(e.photosOnly);
  });

  it("once saved, the panel names it and opens it read-only", () => {
    const html = panel(permit({ work_form: SAVED }));
    expect(html).toContain("PTW-PRJ-0001-001");
    expect(html).toContain("示范 项目经理");
    expect(html).toContain(e.view);
  });
});

describe("JB216-3/4/5 the form: the application brought in, the rest to fill (图 2)", () => {
  it("shows what the application holds, and starts 联系电话 / 施工负责人 / 施工内容 from it", () => {
    const html = form(permit());
    for (const shown of [
      e.permitNo, e.autoNumber, e.applicationNo, "PM-PRJ-0001-001", e.project, "示范商业大厦一期",
      e.appliedOn, e.applicant, "阿明（现场） · 现场人员",
    ]) {
      expect(html).toContain(shown);
    }
    expect(html).toContain('value="+60129990001"');
    expect(html).toContain('value="阿明（现场）"');
    expect(html).toContain("动火作业，3 楼焊接</textarea>");
    // 现场照片及附件: the photographed page; 其他附件名称: the form file and the 附件.
    expect(html).toContain(e.photos);
    expect(html).toContain("ptw-page-1-thumb.jpg");
    expect(html).toContain("ptw-form.pdf、method-statement.docx");
  });

  it("has every row of 图 2, the approval part read from the permit, not typed", () => {
    const html = form(permit());
    for (const label of [
      e.subcontractor, e.workLead, e.contactPhone, e.workType, e.location, e.workContent, e.workStart, e.workEnd,
      e.otherFiles, e.measures, e.approvalSection, e.conditions, e.validFrom, e.validUntil, e.opinion, e.result,
      e.manager, e.decidedAt, e.signature,
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(e.opinionWhere);
    expect(html).toContain(e.afterSigning);
    expect(html).toContain(zh.permits.status.RECTIFICATION_SUBMITTED);
  });

  it("will not save without 施工位置, 施工内容 and the times, and says which", () => {
    const html = form(permit({ note: "" }));
    expect(html).toContain('data-slot="button-reason"');
    for (const label of [e.location, e.workContent, e.workStart, e.workEnd]) {
      expect(html).toMatch(new RegExp(`${label}<span[^>]*>\\s*\\*`));
    }
  });

  it("says so in words when the end is before the start, and will not save", () => {
    const html = form(permit({ work_form: { ...SAVED, work_end: "2026-11-18T23:00:00Z" } }));
    expect(html).toContain(e.endBeforeStart);
    // 【保存】 is greyed, with that sentence as its reason.
    expect(html).toMatch(new RegExp(`disabled=""[^>]*>(?:(?!</button>).)*${e.save}</button>`));
  });

  it("sends what was typed, the times as moments, to the permit's own record", async () => {
    const draft = { ...startingDraft(permit()), location: " 3 楼 ", work_start: "2026-11-19T09:00", work_end: "2026-11-19T17:00" };
    const input = formInput(draft);
    expect(input.location).toBe("3 楼");
    expect(input.work_start).toBe(new Date("2026-11-19T09:00").toISOString());
    expect(input.valid_from).toBeNull();
    await saveWorkForm("p1", input);
    expect(posted.calls.at(-1)?.[0]).toBe("/api/permits/p1/save_work_form/");
    expect(posted.calls.at(-1)?.[1]).toEqual(input);
  });

  it("says which save it opened, so somebody else's later save is told, not overwritten", () => {
    expect(formInput(startingDraft(permit()), null).seen_saved_at).toBeNull();
    const reopened = permit({ work_form: SAVED });
    expect(formInput(startingDraft(reopened), SAVED.filled_at).seen_saved_at).toBe(SAVED.filled_at);
    // The refusal is a plain sentence naming who saved, and what to do.
    expect(zh.errors.api.permit_form_changed).toContain("{name}");
    expect(zh.errors.api.permit_form_changed).toContain("重新打开");
  });
});

describe("施工类别: the company's list, plus 「其他（写明）」", () => {
  it("offers the company's types and always 「其他」", () => {
    const html = form(permit());
    for (const name of ["动火作业", "高空作业", "喷砂作业"]) {
      expect(html).toContain(`data-select-item="${name}"`);
    }
    expect(html).toContain(`data-select-item="${OTHER_WORK_TYPE}"`);
    expect(html).toContain(e.other);
  });

  it("still works through 「其他」 when the company has no types", () => {
    const html = form(permit(), []);
    expect(html).toContain(`data-select-item="${OTHER_WORK_TYPE}"`);
    expect(html).toContain(e.typesEmpty);
  });

  it("keeps saved words that are no longer on the list, under 「其他」, unchanged", () => {
    const saved = permit({ work_form: { ...SAVED, work_type: "旧的类别" } });
    expect(typeChoice(startingDraft(saved), ["动火作业"])).toBe(OTHER_WORK_TYPE);
    expect(typeChoice(startingDraft(permit({ work_form: SAVED })), ["动火作业"])).toBe("动火作业");
    const html = form(saved);
    expect(html).toContain('value="旧的类别"');
    expect(html).toContain(e.workTypeOther);
  });

  it("links 「管理施工类别」 to 分类管理 only for whoever keeps the company's list", () => {
    session.codes = [];
    expect(form(permit())).not.toContain(e.manageTypes);
    session.codes = ["category.manage", "project.view_all"];
    const html = form(permit());
    expect(html).toContain(e.manageTypes);
    expect(html).toContain(`href="${MANAGE_WORK_TYPES_HREF}"`);
    session.codes = [];
  });
});

describe("JB216-2 the applicant and readers see it, never change it", () => {
  it("reads as text, with nothing to type and no 保存", () => {
    const html = view(permit({ work_form: SAVED, can_fill_work_form: false }));
    for (const value of ["ABC 脚手架", "3 楼 B 区", "焊接钢梁", "配灭火器，专人看火", "每天收工前检查火种", "PTW-PRJ-0001-001"]) {
      expect(html).toContain(value);
    }
    expect(html).not.toMatch(/<input|<textarea/);
    expect(html).not.toContain(`>${e.save}<`);
    expect(html).toContain(e.viewIntro);
  });

  it("shows who signed and when once approved", () => {
    const html = view(
      permit({
        status: "VERIFIED",
        is_closed: true,
        can_fill_work_form: false,
        work_form: SAVED,
        decided_by_name: "示范 项目经理",
        decided_by_title: "项目经理",
        decided_at: "2026-11-18T03:00:00Z",
        review_note: "同意，按批准条件施工",
        signature: "https://cdn.example/sign.png",
      }),
    );
    expect(html).toContain("示范 项目经理 · 项目经理");
    expect(html).toContain("同意，按批准条件施工");
    expect(html).toContain(zh.permits.status.VERIFIED);
    expect(html).toContain("sign.png");
    expect(html).not.toContain(e.afterSigning);
  });
});

describe("JB216-6 and S2 in the permit window", () => {
  const detail = (row: Permit) =>
    renderDetail(<PermitDetail id="p1" presentation="dialog" onClose={() => undefined} />, (client) => {
      client.setQueryData(permitKeys("p1"), row);
      seedLists(client);
    });

  it("tells the approver to fill the e-permit first, then sign; once filled, that it is archived with the signature", () => {
    expect(detail(permit())).toContain(e.fillHint);
    const filled = detail(permit({ work_form: SAVED }));
    expect(filled).toContain(e.filledHint.replace("{no}", "PTW-PRJ-0001-001"));
    // The approval is still the right-hand one: note, signature, 签名批准.
    expect(filled).toContain(zh.permits.approve);
    expect(filled).toContain(zh.permits.field.approvalNote);
  });

  it("calls a resubmitted permit's old reason 「上次退回原因」, never 「审批意见」", () => {
    const html = detail(permit({ review_note: "第 3 节没签名", submission: 2 }));
    expect(html).toContain(zh.permits.field.lastReturnReason);
    expect(html).toContain("第 3 节没签名");
    expect(html).not.toMatch(new RegExp(`${zh.permits.field.approvalNote}</dt><dd[^>]*>第 3 节没签名`));
  });
});

describe("分类管理 → 施工准证 · 施工类别", () => {
  const list = (canManage: boolean, types = TYPES) =>
    renderDetail(<PermitWorkTypesPanel canManage={canManage} />, (client) => client.setQueryData(PERMIT_WORK_TYPES_KEY, types));

  it("lists the company's types and the fixed 「其他（写明）」; adding and renaming for who keeps the list", () => {
    const html = list(true);
    for (const name of ["动火作业", "高空作业", "喷砂作业", zh.permits.workTypes.other, zh.permits.workTypes.system]) {
      expect(html).toContain(name);
    }
    expect(html).toContain(zh.permits.workTypes.add);
    expect(html).toContain(zh.permits.workTypes.edit);
  });

  it("is read-only for anybody else, and says whom to ask", () => {
    const html = list(false);
    expect(html).toContain("动火作业");
    expect(html).not.toContain(zh.permits.workTypes.add);
    expect(html).not.toContain(`${zh.permits.workTypes.edit}</button>`);
    expect(html).toContain(zh.permits.workTypes.readOnly);
  });

  it("says plainly when the list is empty", () => {
    expect(list(true, [])).toContain(zh.permits.workTypes.empty);
  });
});

describe("four languages", () => {
  const flat = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => flat(value, `${prefix}${key}.`))
      : [prefix];

  it("every new sentence is in zh, zh-TW, en and ms, none empty", () => {
    for (const branch of ["eForm", "workTypes"] as const) {
      const keys = flat(en.permits[branch]);
      for (const catalogue of [zh, zhTW, ms]) {
        expect(flat(catalogue.permits[branch])).toEqual(keys);
      }
    }
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.permits.field.lastReturnReason).toBeTruthy();
      expect(catalogue.categoryManagement.company.module.permitWorkType).toBeTruthy();
      expect(catalogue.errors.api.permit_form_office_only).toBeTruthy();
      expect(catalogue.errors.api.permit_work_type_exists).toContain("{name}");
    }
    expect(zh.permits.eForm.fill).toBe("填写电子准证");
    expect(zh.permits.eForm.title).toBe("安全施工准证 PERMIT TO WORK");
  });
});
