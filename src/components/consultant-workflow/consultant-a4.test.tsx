/**
 * 2026-10 C1 + B7: the consultant application as the customer's A4 form.
 *
 * Client's view: tick three site photos in 「待整理现场资料」 → make a
 * 材料证书提交 application → preview shows one A4 page with both logos →
 * send / print / export are the same page. The page itself is proven by the
 * backend (page count, both logos); here is what the office screens draw.
 *
 * Rendered to static markup - the runner has no DOM - so clicks are not
 * simulated: the pure helpers the clicks call are tested directly, and each
 * screen's first state is pinned. Real printing is PENDING (a browser).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { FieldTask } from "@/interfaces/contractor-ops";
import type { ConsultantApplication } from "@/interfaces/consultant-workflow";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => "/consultant-applications",
  useSearchParams: () => new URLSearchParams("stage=inbox"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", account_type: "TENANT" }, can: () => true }),
}));

const { ConsultantFieldInbox, organizeHref, toggleTicked } = await import(
  "@/components/consultant-workflow/field-inbox"
);
const { ApplicationFormCard } = await import("@/components/consultant-workflow/application-form-card");
const { EvidenceLinkCards, evidenceViewerPhotos } = await import(
  "@/components/consultant-workflow/application-draft-edit"
);
const { isMaterialType, mainGroups, moreGroups } = await import(
  "@/components/consultant-workflow/application-type-layout"
);
const { isRouteAllowed, visibleNavigation } = await import("@/lib/navigation");

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

function photo(id: string) {
  return {
    id,
    image: `/media/${id}.jpg`,
    watermarked: `/media/${id}-stamped.jpg`,
    caption: "",
    captured_at: "2026-10-07T02:00:00Z",
    uploaded_at: "2026-10-07T02:00:00Z",
    latitude: null,
    longitude: null,
    accuracy_m: null,
    device_id: "",
    client_event_id: "",
  };
}

function task(id: string, photos: string[]): FieldTask {
  return {
    id,
    task_type: "CONSULTANT",
    title: `材料证书提交 - 2026-10-07 10:0${photos.length}`,
    submission_category: "MATERIAL_CERT_SUBMISSION",
    project: "p1",
    project_name: "RFI Site",
    instructions: "Rebar certificates on site.",
    work_location: "Store yard",
    created_by_name: "ong",
    submitted_at: "2026-10-07T02:00:00Z",
    status: "SUBMITTED",
    photos: photos.map(photo),
    references: [],
  } as unknown as FieldTask;
}

describe("which fields each type shows (C1: 表单按类型只显示需要的字段)", () => {
  it("a 材料证书提交 asks only for the material; the rest is under 更多", () => {
    expect([...mainGroups("MATERIAL_CERT_SUBMISSION")]).toEqual(["component"]);
    expect(moreGroups("MATERIAL_CERT_SUBMISSION")).toEqual(
      expect.arrayContaining(["classification", "inspection", "location", "drawing"]),
    );
    expect(isMaterialType("MATERIAL_CERT_SUBMISSION")).toBe(true);
    expect(isMaterialType("MATERIAL_APPROVAL")).toBe(true);
    expect(isMaterialType("RFI")).toBe(false);
  });

  it("none of the four puts discipline, inspection type or priority in the form itself", () => {
    for (const code of ["MATERIAL_APPROVAL", "MATERIAL_CERT_SUBMISSION", "RFI", "OTHER", null]) {
      expect(mainGroups(code).has("classification"), String(code)).toBe(false);
      expect(mainGroups(code).has("inspection"), String(code)).toBe(false);
    }
    expect([...mainGroups("RFI")]).toEqual(["location", "drawing", "requiredAt"]);
  });

  it("an old application under a retired type keeps the whole form", () => {
    expect(mainGroups("WIR").size).toBe(7);
    expect(moreGroups("WIR")).toEqual([]);
  });

  it("the form no longer demands discipline, work type, priority, location or component", () => {
    const form = read("src/components/consultant-workflow/application-form.tsx");
    const requires = form.slice(form.indexOf("<Button requires={[[form.project"), form.indexOf("disabled={save.isPending} onClick={() => save.mutate()}>"));
    for (const field of ["field.discipline", "field.workType", "field.priority", "field.location", "field.component"]) {
      expect(requires, field).not.toContain(`t("${field}")`);
    }
    // A material application still names its material, and says so.
    expect(requires).toContain('[!isMaterial || form.component.trim(), t("field.material")]');
    expect(form).toContain('<FieldWrapper label={t("field.material")} required>');
    // Empty choices go as null, not "", and only the ticked photos go.
    expect(form).toContain("discipline: form.discipline || null");
    expect(form).toContain("source_photos: sourcePhotos.map((photo) => photo.id)");
  });
});

describe("待整理现场资料 (C1, Q2)", () => {
  it("ticks keep the order the photos were taken in", () => {
    const order = ["a", "b", "c", "d"];
    expect(toggleTicked([], "c", order)).toEqual(["c"]);
    expect(toggleTicked(["c"], "a", order)).toEqual(["a", "c"]);
    expect(toggleTicked(["a", "c"], "c", order)).toEqual(["a"]);
  });

  it("「整理成顾问申请」 opens the create form with the submission and only the ticked photos", () => {
    expect(organizeHref("t1", ["a", "c", "d"])).toBe(
      "/consultant-applications/create?source_field_task=t1&photos=a%2Cc%2Cd",
    );
    expect(organizeHref("t1", [])).toBe("/consultant-applications/create?source_field_task=t1");
  });

  it("the create page hands the ticked photos to the form", () => {
    const page = read("src/app/(dashboard)/consultant-applications/create/page.tsx");
    expect(page).toContain('sourcePhotoIds={(params.photos ?? "").split(",").filter(Boolean)}');
  });

  it("draws small cards with small, tickable stamped thumbnails, the linked one first", () => {
    const client = new QueryClient();
    client.setQueryData(["field-tasks", "to-organize", ""], {
      count: 2,
      next: null,
      previous: null,
      results: [task("t1", ["a", "b"]), task("t2", ["c", "d", "e"])],
    });
    const html = render(<ConsultantFieldInbox project="" focusedTaskId="t2" />, client);

    const cards = html.match(/data-testid="field-inbox-card"/g) ?? [];
    expect(cards).toHaveLength(2);
    // The submission a notification pointed at is first, and marked.
    expect(html.indexOf("/media/c-stamped.jpg")).toBeLessThan(html.indexOf("/media/a-stamped.jpg"));
    expect(html).toContain("ring-2 ring-primary");
    // Five photos, each a 64 px tick box showing the stamped copy.
    expect(html.match(/role="checkbox"/g) ?? []).toHaveLength(5);
    expect(html.match(/class="relative size-16 shrink-0"/g) ?? []).toHaveLength(5);
    expect(html).not.toContain("/media/a.jpg");
    // Nothing ticked yet: the button says what it is waiting for.
    expect(html).toContain("整理成顾问申请");
    expect(html).toContain("已勾 0 / 3 张");
    expect(html).toMatch(/data-slot="organize-application"[^>]*disabled=""/);
    expect(html).toContain("勾选要给顾问看的照片");
  });

  it("says so when there is nothing to organise", () => {
    const client = new QueryClient();
    client.setQueryData(["field-tasks", "to-organize", "p9"], { count: 0, next: null, previous: null, results: [] });
    const html = render(<ConsultantFieldInbox project="p9" />, client);
    expect(html).toContain("没有待整理的现场资料");
  });

  it("is a tab of 顾问申请, not a menu entry of its own", () => {
    const leaves = visibleNavigation("MSE_TRACE", ["consultant_applications", "field_tasks"], ["consultant.submit"])
      .flatMap((group) => group.items)
      .flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);
    expect(leaves).toContain("/consultant-applications");
    expect(leaves).not.toContain("/consultant-field-inbox");
    // An old notification's address still opens, and forwards to the tab.
    expect(
      isRouteAllowed("MSE_TRACE", ["field_tasks"], "/consultant-field-inbox", ["consultant.submit"]),
    ).toBe(true);
    const old = read("src/app/(dashboard)/consultant-field-inbox/page.tsx");
    expect(old).toContain('new URLSearchParams({ stage: "inbox" })');
    const list = read("src/components/consultant-workflow/applications-list.tsx");
    expect(list).toContain('const STAGES = ["inbox", "all", "draft", "approval", "final", "archive"] as const;');
    expect(list).toContain("<ConsultantFieldInbox project={project}");
  });
});

describe("the A4 form card on the detail (C1)", () => {
  const base = {
    consultantName: "Consultant Engineer",
    attachmentCount: 3,
    onSend: () => {},
    onPrint: async () => {},
    onShowAttachments: () => {},
    exportButtons: <span data-export-slot />,
  };

  it("a draft offers preview / export, print, the attachments and the send", () => {
    const html = render(<ApplicationFormCard {...base} canSend isSubmitting={false} />);
    expect(html).toContain("顾问申请表（A4）");
    expect(html).toContain("data-export-slot");
    expect(html).toContain('data-slot="application-form-print"');
    expect(html).toContain("看附件（3）");
    expect(html).toContain("发送给顾问 Consultant Engineer");
  });

  it("once sent there is nothing to send again", () => {
    const html = render(<ApplicationFormCard {...base} canSend={false} isSubmitting={false} />);
    expect(html).not.toContain('data-slot="application-form-send"');
    expect(html).toContain('data-slot="application-form-print"');
  });

  it("preview and export are the record export, which for an application is the A4 form", () => {
    const detail = read("src/components/consultant-workflow/application-detail.tsx");
    const card = detail.slice(detail.indexOf("<ApplicationFormCard"), detail.indexOf("<ApplicationLifecycle"));
    expect(card).toContain('<RecordExportButton\n            kind="CONSULTANT_APPLICATION"');
    expect(card).toContain('printPdf(() => recordPdfObjectUrl("CONSULTANT_APPLICATION", application.id))');
    expect(card).toContain("onSend={() => submit.mutate()}");
    expect(detail).toContain('id="application-attachments"');
  });
});

describe("photos on the detail open in the shared viewer (C1)", () => {
  const links = [
    {
      id: "l1", evidence: "e1", evidence_kind: "PHOTO", evidence_file: "/media/l1.jpg",
      evidence_watermarked_file: "/media/l1-stamped.jpg", original_filename: "l1.jpg",
      captured_at: "2026-10-07T02:00:00Z", latitude: "3.1", longitude: "101.6",
      photographer_name: "ong", sha256: "a".repeat(64), caption: "Mill cert", sort_order: 0,
    },
    {
      id: "l2", evidence: "e2", evidence_kind: "PHOTO", evidence_file: "/media/l2.jpg",
      evidence_watermarked_file: null, original_filename: "l2.jpg",
      captured_at: "2026-10-07T02:00:00Z", latitude: null, longitude: null,
      photographer_name: "ong", sha256: "b".repeat(64), caption: "", sort_order: 1,
    },
  ];

  it("pages through the stamped copies, the file where there is none", () => {
    const photos = evidenceViewerPhotos(links as never);
    expect(photos.map((row) => row.url)).toEqual(["/media/l1-stamped.jpg", "/media/l2.jpg"]);
    expect(photos[0]).toMatchObject({ label: "Mill cert", latitude: "3.1", longitude: "101.6" });
    expect(photos[1].label).toBe("l2.jpg");
  });

  it("a thumbnail is a button to the viewer, not a bare link to the file", () => {
    const application = {
      id: "app-1", application_no: "SITE-RFI-0001", is_locked: true, status: "SUBMITTED",
      attachments: [], evidence_links: links, related_record_groups: [],
    } as unknown as ConsultantApplication;
    const html = render(
      <EvidenceLinkCards application={application} editable={false} armed={false} onChanged={() => {}} />,
    );
    expect(html.match(/data-photo-open=/g) ?? []).toHaveLength(2);
    expect(html).toContain("放大查看 Mill cert");
    expect(html).not.toContain('target="_blank"');
    const source = read("src/components/consultant-workflow/application-draft-edit.tsx");
    expect(source).toContain("<PhotoViewer");
  });
});

describe("the consultant firm's logo (C1)", () => {
  it("is uploaded, or cleared, through its own action", () => {
    const service = read("src/services/consultant-workflow.service.ts");
    const fn = service.slice(service.indexOf("export const uploadConsultantOrganizationLogo"));
    expect(fn).toContain("/upload_organization_logo/");
    expect(fn).toContain('data.append("logo", file)');
    expect(fn).toContain('data.append("clear", "true")');
  });

  it("is chosen where the firm is edited, applied on save, and shown on the firm's card", () => {
    const page = read("src/components/consultant-workflow/consultant-access-management.tsx");
    expect(page).toContain('accept="image/png,image/jpeg"');
    expect(page).toContain("if (logoFile) await services.uploadLogo(firm.id, logoFile);");
    expect(page).toContain("else if (clearLogo && row?.logo) await services.uploadLogo(firm.id, null);");
    expect(page).toContain("{row.logo ? (");
  });
});
