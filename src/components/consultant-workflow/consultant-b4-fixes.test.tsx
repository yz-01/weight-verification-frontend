/**
 * Batch-4 audit fixes on 顾问申请 (C1 / B7), 2026-10-08.
 *
 * - #12 + Q29.4: the 「待整理现场资料」 notice opens the inbox tab on the
 *   submission's own project (`?stage=inbox&task=…&project=…`).
 * - #21: a submission a notice points at is fetched by itself when it is not
 *   in the inbox's first page, so the link never lands on nothing.
 * - #18: a firm whose logo is refused is saved once; the next 保存 retries
 *   the logo only.
 * - #19 + Q29.5: an old draft under a retired type keeps it, shown as
 *   「(已停用)」 and not choosable again.
 *
 * Rendered to static markup (the runner has no DOM): clicks are not
 * simulated, so the helpers the clicks call are tested directly.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/interfaces/api";
import type { FieldTask } from "@/interfaces/contractor-ops";
import type { ProjectApplicationOption } from "@/interfaces/consultant-workflow";
import messages from "@/messages/zh.json";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => "/consultant-applications",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", account_type: "TENANT" }, can: () => true }),
}));

const { ConsultantApplicationsList } = await import(
  "@/components/consultant-workflow/applications-list"
);
const { ConsultantFieldInbox } = await import("@/components/consultant-workflow/field-inbox");
const { saveConsultantFirm } = await import(
  "@/components/consultant-workflow/consultant-access-management"
);
const { retiredChoice } = await import("@/components/consultant-workflow/application-form");

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function task(id: string, project = "p1"): FieldTask {
  return {
    id,
    task_type: "CONSULTANT",
    title: `RFI - ${id}`,
    submission_category: "RFI",
    project,
    project_name: project === "p1" ? "Site One" : "Site Two",
    instructions: "",
    work_location: "",
    created_by_name: "ong",
    submitted_at: "2026-10-07T02:00:00Z",
    status: "SUBMITTED",
    photos: [
      {
        id: `${id}-photo`,
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
      },
    ],
    references: [],
  } as unknown as FieldTask;
}

const page = (results: FieldTask[]) => ({ count: results.length, next: null, previous: null, results });

describe("the 待整理现场资料 notice's link (#12, #21)", () => {
  it("opens the inbox tab on the project the notice names", () => {
    search.value = "stage=inbox&task=t1&project=p2";
    const client = new QueryClient();
    client.setQueryData(["field-tasks", "to-organize", "p2"], page([task("t1", "p2")]));

    const html = render(<ConsultantApplicationsList />, client);

    expect(html).toContain("/media/t1-stamped.jpg");
    expect(html).toContain("ring-2 ring-primary");
  });

  it("fetches the submission by itself when it is not in the first page", () => {
    const client = new QueryClient();
    client.setQueryData(["field-tasks", "to-organize", "p1"], page([task("t1"), task("t2")]));
    client.setQueryData(["field-tasks", "focused", "t9"], task("t9", "p2"));

    const html = render(<ConsultantFieldInbox project="p1" focusedTaskId="t9" />, client);

    expect(html.match(/data-testid="field-inbox-card"/g) ?? []).toHaveLength(3);
    // The one the notice points at is first and marked.
    expect(html.indexOf("/media/t9-stamped.jpg")).toBeGreaterThan(-1);
    expect(html.indexOf("/media/t9-stamped.jpg")).toBeLessThan(html.indexOf("/media/t1-stamped.jpg"));
    expect(html).toContain("ring-2 ring-primary");
  });

  it("says so when the submission was already made into an application", () => {
    const client = new QueryClient();
    client.setQueryData(["field-tasks", "to-organize", "p1"], page([task("t1")]));
    client.setQueryData(["field-tasks", "focused", "t9"], {
      ...task("t9"),
      consultant_application: { id: "a1", application_no: "RFI-0001", status: "DRAFT", forwarded_at: null },
    });

    const html = render(<ConsultantFieldInbox project="p1" focusedTaskId="t9" />, client);

    expect(html).toContain(messages.consultantWorkflow.inbox.alreadyOrganized.split("{")[0]);
    expect(html).not.toContain("/media/t9-stamped.jpg");
  });
});

describe("a consultant firm whose logo is refused (#18)", () => {
  const form = {
    name: "Arup",
    registration_no: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    is_active: true,
  };
  const logo = new File(["x"], "huge.png", { type: "image/png" });

  function services() {
    return {
      create: vi.fn(async () => ({ id: "org-1" })),
      update: vi.fn(async (id: string) => ({ id })),
      uploadLogo: vi.fn<(id: string, file: File | null) => Promise<unknown>>(async () => {
        throw new ApiError("The logo must be 2 MB or smaller.", 400);
      }),
    };
  }

  it("is saved once, and says the logo was not", async () => {
    const api = services();

    const first = await saveConsultantFirm({ row: null, saved: null, form, logoFile: logo, clearLogo: false }, api);

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(first.firm.id).toBe("org-1");
    expect(first.logoError).toBeInstanceOf(ApiError);
  });

  it("on the next 保存 retries the logo only, never a second firm", async () => {
    const api = services();
    const first = await saveConsultantFirm({ row: null, saved: null, form, logoFile: logo, clearLogo: false }, api);
    api.uploadLogo.mockImplementationOnce(async () => ({ id: "org-1" }));

    const second = await saveConsultantFirm(
      { row: null, saved: { id: first.firm.id, form: first.formKey }, form, logoFile: logo, clearLogo: false },
      api,
    );

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.uploadLogo).toHaveBeenLastCalledWith("org-1", logo);
    expect(second.logoError).toBeNull();
  });

  it("saves a changed field on the retry against the firm already made", async () => {
    const api = services();
    const first = await saveConsultantFirm({ row: null, saved: null, form, logoFile: logo, clearLogo: false }, api);

    await saveConsultantFirm(
      {
        row: null,
        saved: { id: first.firm.id, form: first.formKey },
        form: { ...form, address: "KL" },
        logoFile: null,
        clearLogo: false,
      },
      api,
    );

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith("org-1", { ...form, address: "KL" });
  });

  it("has words for 「firm saved, logo not saved」 in all four languages", async () => {
    for (const language of ["zh", "zh-TW", "en", "ms"]) {
      const tree = (await import(`@/messages/${language}.json`)).default;
      expect(tree.consultantAccess.organization.logoNotSaved).toContain("{reason}");
    }
  });
});

describe("an old draft under a retired type (#19)", () => {
  const options = [
    { id: "rfi", category: "APPLICATION_TYPE", code: "RFI", label: "RFI", is_active: true },
    { id: "other", category: "APPLICATION_TYPE", code: "OTHER", label: "Other", is_active: true },
  ] as ProjectApplicationOption[];

  it("keeps its type as a choice that cannot be picked again", () => {
    expect(retiredChoice(options, "wir", "WIR")).toEqual({ id: "wir", label: "WIR" });
  });

  it("adds nothing when the value is one of the active types, or empty", () => {
    expect(retiredChoice(options, "rfi", "RFI")).toBeNull();
    expect(retiredChoice(options, "", "")).toBeNull();
    expect(retiredChoice(options, null, null)).toBeNull();
  });

  it("is named 已停用 in all four languages", async () => {
    for (const language of ["zh", "zh-TW", "en", "ms"]) {
      const tree = (await import(`@/messages/${language}.json`)).default;
      expect(tree.consultantWorkflow.form.retiredOption).toContain("{label}");
    }
  });
});
