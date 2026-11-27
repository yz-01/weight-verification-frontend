/**
 * QA2 (JB269 walk, 客户 11-26 事项 10: 「目前每条记录只显示一长串文字、事项编号及文件
 * 名称」): the picker was fixed, but once linked the application's 「关联现场证据」
 * cards still read 「progress_SCMaIXk.png」 and a 64-character fingerprint.
 * Each card now reads its record - number · module · name - like the picker;
 * a caption the office wrote comes first.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ApplicationEvidenceLink, ConsultantApplication } from "@/interfaces/consultant-workflow";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, isLoading: false, can: () => true }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/consultant-applications",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { EvidenceLinkCards } = await import("@/components/consultant-workflow/application-draft-edit");

const HASH = "56d6edf14d89405d2ba5f758b3707e31972ac55a8646c139caa1da7aa2d6f1d0";

function link(over: Partial<ApplicationEvidenceLink> = {}): ApplicationEvidenceLink {
  return {
    id: "l-1",
    evidence: "e-1",
    evidence_kind: "PHOTO",
    evidence_file: "https://files.test/progress_SCMaIXk.png",
    evidence_watermarked_file: null,
    original_filename: "progress_SCMaIXk.png",
    captured_at: "2026-09-12T05:43:29Z",
    latitude: null,
    longitude: null,
    photographer_name: "E2E Contractor Admin",
    sha256: HASH,
    caption: "",
    sort_order: 0,
    source_model: "contractor_ops.siteprogressphoto",
    record_type: "SITE_PROGRESS",
    record_reference: "PG-P-E2E-126",
    record_title: "Substructure 009419",
    ...over,
  };
}

function render(links: ApplicationEvidenceLink[]) {
  const application = { id: "a-1", evidence_links: links } as unknown as ConsultantApplication;
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        <EvidenceLinkCards application={application} editable={false} armed={false} onChanged={() => undefined} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("QA2 JB269: a linked photo on the application is named by its record", () => {
  it("number · module · name; no file name, no fingerprint", () => {
    const html = render([link()]);
    expect(html).toContain("PG-P-E2E-126 · ");
    expect(html).toContain("Substructure 009419");
    expect(html).not.toContain("progress_SCMaIXk.png</p>");
    expect(html).not.toContain(HASH);
  });

  it("a caption the office wrote comes first", () => {
    const html = render([link({ caption: "东边柱子" })]);
    expect(html).toMatch(/data-slot="evidence-link-name"[^>]*>东边柱子</);
  });
});
