/**
 * B. 顾问自有表格 - the consultant's own form (client, 2026-10-10).
 *
 * Client's view: in 「RFI 表格模板」 the office picks 「B · 顾问自有表格」 and
 * uploads the consultant's blank form; the applicant chooses it, downloads
 * it, fills it in and uploads it - the send button says so until then; the
 * consultant previews it and approves with the e-signature and PIN or by
 * uploading the form signed and stamped. The server side (binding,
 * isolation, archive, the untouched pages in the complete evidence) is
 * proven by `consultant_workflow/test_consultant_own_forms.py`; here is what
 * the screens draw.
 *
 * Rendered to static markup - the runner has no DOM - so the pure helpers the
 * clicks call are tested directly and each screen's first state is pinned.
 * Uploading and previewing in a real browser is PENDING.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ConsultantApplication } from "@/interfaces/consultant-workflow";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => "/consultant-templates",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", account_type: "TENANT" }, can: () => true }),
}));

const {
  ApplicationConsultantFormPanel,
  ConsultantFormSourceField,
  TemplateSourceOptions,
  isFormFile,
  signingChoices,
  signingNeeds,
} = await import("@/components/consultant-workflow/consultant-own-form");
const { ApplicationFormCard } = await import("@/components/consultant-workflow/application-form-card");

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const own = messages.consultantWorkflow.ownForm;

function application(overrides: Partial<ConsultantApplication> = {}): ConsultantApplication {
  return {
    id: "a1",
    status: "DRAFT",
    is_locked: false,
    consultant_form_version: "v1",
    consultant_form: {
      id: "f1",
      name: "JKR RFI Form",
      version_id: "v1",
      version: 1,
      original_name: "jkr-rfi-blank.pdf",
      content_type: "application/pdf",
      byte_size: 1200,
      sha256: "a".repeat(64),
      preview_type: "application/pdf",
      newer_version: null,
    },
    form_files: [],
    ...overrides,
  } as ConsultantApplication;
}

describe("how a decision on the consultant's own form is signed", () => {
  it("offers only the e-signature on the standard form, as before", () => {
    expect(signingChoices(false, true)).toEqual(["ESIGNATURE"]);
    expect(signingChoices(false, false)).toEqual(["ESIGNATURE"]);
  });

  it("offers the signed form too, and only it to a consultant with no e-signature", () => {
    expect(signingChoices(true, true)).toEqual(["ESIGNATURE", "SIGNED_FORM"]);
    expect(signingChoices(true, false)).toEqual(["SIGNED_FORM"]);
  });

  it("asks for the PIN and the file exactly as the server does", () => {
    expect(signingNeeds("ESIGNATURE", true)).toEqual({ pin: true, file: false });
    expect(signingNeeds("SIGNED_FORM", true)).toEqual({ pin: true, file: true });
    expect(signingNeeds("SIGNED_FORM", false)).toEqual({ pin: false, file: true });
  });

  it("takes PDF, Word, Excel and photos as a form, nothing else", () => {
    for (const name of ["a.pdf", "B.DOCX", "c.doc", "d.xlsx", "e.xls", "f.jpg", "g.jpeg", "h.png"]) {
      expect(isFormFile(name)).toBe(true);
    }
    for (const name of ["tool.exe", "notes.txt", "pdf", "form.pdf.zip"]) {
      expect(isFormFile(name)).toBe(false);
    }
  });
});

describe("「RFI 表格模板」: the two form sources", () => {
  it("asks for the source first: A, the standard form, or B, the consultant's own", () => {
    const html = render(<TemplateSourceOptions onChoose={() => {}} />);
    expect(html).toContain(own.sourceStandard);
    expect(html).toContain(own.sourceConsultant);
    expect(html).toContain('data-template-source="STANDARD"');
    expect(html).toContain('data-template-source="CONSULTANT"');
  });
});

describe("applying: 表格来源", () => {
  const field = (client: QueryClient) =>
    render(
      <ConsultantFormSourceField
        project="p1"
        consultantOrganization="o1"
        applicationType="t1"
        value={null}
        onChange={() => {}}
      />,
      client,
    );

  it("is offered when the consultant has a form for this project and type", () => {
    const client = new QueryClient();
    client.setQueryData(["consultant-form-choices", "p1", "o1", "t1"], [
      {
        version_id: "v1",
        form_id: "f1",
        name: "JKR RFI Form",
        version: 1,
        original_name: "jkr-rfi-blank.pdf",
        preview_type: "application/pdf",
        for_project: false,
        application_type_code: "RFI",
      },
    ]);
    const html = field(client);
    expect(html).toContain(own.formSource);
    expect(html).toContain('data-testid="consultant-form-source"');
  });

  it("is not drawn at all when there is none - the standard form, as before", () => {
    const client = new QueryClient();
    client.setQueryData(["consultant-form-choices", "p1", "o1", "t1"], []);
    expect(field(client)).toBe("");
  });
});

describe("the application: blank, filled and signed form", () => {
  it("tells the applicant to upload the filled form, and holds the send until then", () => {
    const html = render(
      <ApplicationConsultantFormPanel application={application()} editable reviewer={false} onChanged={() => {}} />,
    );
    expect(html).toContain("jkr-rfi-blank.pdf");
    expect(html).toContain(own.filledMissing);
    expect(html).toContain(own.uploadFilled);
    expect(html).toContain(own.panelHelpApplicant);

    const card = render(
      <ApplicationFormCard
        consultantName="Ir. Tan"
        attachmentCount={0}
        canSend
        isSubmitting={false}
        onSend={() => {}}
        onPrint={async () => {}}
        onShowAttachments={() => {}}
        exportButtons={null}
        sendBlockedReason={own.filledMissing}
      />,
    );
    const send = card.slice(card.indexOf('data-slot="application-form-send"') - 400);
    expect(send).toMatch(/disabled=""/);
  });

  it("shows the consultant the filled form and the signed final version, read only", () => {
    const html = render(
      <ApplicationConsultantFormPanel
        application={application({
          status: "APPROVED",
          is_locked: true,
          form_files: [
            {
              id: "ff1", kind: "FILLED", original_name: "filled.pdf", content_type: "application/pdf",
              byte_size: 10, sha256: "b".repeat(64), preview_type: "application/pdf",
              approval_action: null, uploaded_by_name: "Office", created_at: "2026-10-10T02:00:00Z",
            },
            {
              id: "ff2", kind: "SIGNED", original_name: "signed.pdf", content_type: "application/pdf",
              byte_size: 10, sha256: "c".repeat(64), preview_type: "application/pdf",
              approval_action: "act1", uploaded_by_name: "Ir. Tan", created_at: "2026-10-10T05:00:00Z",
            },
          ],
        })}
        editable={false}
        reviewer
        onChanged={() => {}}
      />,
    );
    expect(html).toContain("filled.pdf");
    expect(html).toContain("signed.pdf");
    expect(html).toContain(own.signedForms);
    expect(html).toContain(own.panelHelpReviewer);
    expect(html).not.toContain(own.uploadFilled);
    expect(html).not.toContain(own.replaceFilled);
  });

  it("draws nothing for an application on the standard form", () => {
    const html = render(
      <ApplicationConsultantFormPanel
        application={application({ consultant_form: null, consultant_form_version: null })}
        editable
        reviewer={false}
        onChanged={() => {}}
      />,
    );
    expect(html).toBe("");
  });
});
