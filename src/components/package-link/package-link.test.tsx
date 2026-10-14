/**
 * The package link's page (batch H, H17 八 3).
 *
 * What the owner sees in WhatsApp: the client company and project on top,
 * the package number and round, each record with 预览 · 打印 and
 * 确认 / 退回, their own conversation, 「整包签收」 - and never money, never
 * another recipient. A link that opens nothing says 「找不到」 and nothing
 * else (五 3).
 *
 * The runner has no DOM, so the page is rendered to static markup with its
 * query answered from the cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PackageLinkPage } from "@/interfaces/contractor-ops";
import zh from "@/messages/zh.json";

vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));
// The root layout's provider; nobody is signed in on a link.
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => false }),
}));

const { PackageLinkView } = await import("@/components/package-link/package-link");

const page: PackageLinkPage = {
  company_name: "Package Construction",
  company_logo: "",
  project_name: "Package Tower",
  project_code: "P-PKG",
  package_no: "PKG-P-PKG-261014-001",
  package_name: "Steel certificates",
  remarks: "For your approval.",
  round: 2,
  confirmed_at: "2026-10-14T02:00:00Z",
  recipient: {
    display_name: "Owner Rep",
    kind: "OWNER",
    organization: "Owner Sdn Bhd",
    status: "VIEWED",
    signed_name: "",
    signed_at: null,
    expires_at: "2027-01-12T02:00:00Z",
    seen_round: 2,
  },
  exported: false,
  can_decide: true,
  can_sign: true,
  items: [
    {
      id: "i1",
      record_kind: "MATERIAL_RECEIPT",
      reference: "GRN-001",
      fields: [{ key: "material_name", value: "Rebar" }],
      photo_count: 2,
      document_count: 1,
      file_count: 0,
      round_no: 2,
      review_state: "PENDING",
      returned_reason: "",
      answered_by: "",
      answered_at: null,
    },
    {
      id: "i2",
      record_kind: "MATERIAL_RECEIPT",
      reference: "GRN-002",
      fields: [],
      photo_count: 1,
      document_count: 0,
      file_count: 0,
      round_no: 1,
      review_state: "RETURNED",
      returned_reason: "Photo blurred",
      answered_by: "Olive",
      answered_at: "2026-10-14T03:00:00Z",
    },
  ],
  messages: [
    {
      id: "m1",
      recipient: "r1",
      item: null,
      side: "OFFICE",
      author_name: "pm",
      body: "Please check item 2",
      attachment_name: "",
      attachment_url: "",
      created_at: "2026-10-14T03:30:00Z",
    },
  ],
};

function render(data: PackageLinkPage | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  if (data) client.setQueryData(["package-link", "tok", "zh"], data);
  else
    client.getQueryCache().build(client, { queryKey: ["package-link", "tok", "zh"] }).setState({
      status: "error",
      error: new Error("Not found."),
      fetchStatus: "idle",
    });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <PackageLinkView token="tok" />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const words = zh.packageLink;

describe("the package link page", () => {
  it("heads with the client company and project, the number and the round", () => {
    const html = render(page);
    expect(html).toContain("Package Construction");
    expect(html).toContain("Package Tower");
    expect(html).toContain("PKG-P-PKG-261014-001");
    expect(html).toContain(words.round.replace("{n}", "2"));
  });

  it("lets each pending record be confirmed or returned and shows a return's reason", () => {
    const html = render(page);
    expect(html).toContain("GRN-001");
    expect(html).toContain(words.confirm);
    expect(html).toContain(words.return);
    expect(html).toContain(words.youReturned.replace("{reason}", "Photo blurred"));
    expect(html).toContain(words.newInRound.replace("{n}", "2"));
  });

  it("shows its own conversation and the whole-package signature", () => {
    const html = render(page);
    expect(html).toContain("Please check item 2");
    expect(html).toContain(words.sign);
    expect(html).toContain(words.signHelp);
  });

  it("after the export says so and offers no confirm or return (HD18)", () => {
    const html = render({ ...page, exported: true, can_decide: false, can_sign: false });
    expect(html).toContain(words.exported);
    expect(html).not.toContain(`>${words.confirm}<`);
    expect(html).not.toContain(words.signHelp);
  });

  it("a link that opens nothing says 「找不到」 and nothing about why (五 3)", () => {
    const html = render(null);
    expect(html).toContain(words.notFound);
    expect(html).toContain(words.notFoundHelp);
    for (const why of ["撤销", "过期", "删除"]) expect(html).not.toContain(why);
  });
});
