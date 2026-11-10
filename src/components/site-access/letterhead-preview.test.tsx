/**
 * 「正式文件样板预览」 (JB162, 客户 11-10 第十一批 第 4、6 点): 公司设置 shows the
 * official details in the client's own words and the A4 sample of the header
 * the server draws with the same code as every export; a save of the logo or
 * the details gives a new sample; a failed load says so with 重试.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ContractorCompanyProfile } from "@/interfaces/site-access";
import zh from "@/messages/zh.json";

const fetchObjectUrl = vi.fn(async () => "blob:fetched");
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
  fetchObjectUrl,
}));

const { LetterheadPreviewSection, emailBreaks, letterheadAddress } = await import("@/components/site-access/letterhead-preview");
const { letterheadPreviewObjectUrl } = await import("@/services/site-access.service");

const PROFILE = {
  id: "c1", code: "CT-1", name: "测试建筑商 1 Sdn Bhd", description: "", registration_no: "202601000001 (1234567-X)",
  tax_id: "", sst_no: "", logo: "https://media.test/company/logo/a.png", background_image: null, contact_person: "",
  contact_designation: "", address_line_1: "No. 1, Jalan Satu", address_line_2: "", city: "Puchong", state: "Selangor",
  postcode: "47100", country: "MY", latitude: null, longitude: null, contact_phone: "+603-8061 2345",
  contact_email: "", billing_email: "", website: "", default_language: "zh", timezone: "Asia/Kuala_Lumpur",
  updated_at: "2026-11-10T10:00:00Z",
} as ContractorCompanyProfile;

const versionOf = (profile: ContractorCompanyProfile) => profile.updated_at;

function render({
  profile = PROFILE,
  picture,
  pdf,
  failed = false,
}: { profile?: ContractorCompanyProfile; picture?: [ContractorCompanyProfile, string]; pdf?: string; failed?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  client.setQueryData(["contractor-company-profile"], profile);
  if (picture) client.setQueryData(["letterhead-preview", "png", "zh", versionOf(picture[0])], picture[1]);
  if (pdf) client.setQueryData(["letterhead-preview", "pdf", "zh", versionOf(profile)], pdf);
  if (failed) {
    const query = client.getQueryCache().build(client, { queryKey: ["letterhead-preview", "png", "zh", versionOf(profile)] });
    query.setState({ status: "error", error: new Error("boom"), fetchStatus: "idle" });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <LetterheadPreviewSection />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("正式文件样板预览 (JB162)", () => {
  it("shows the official details as one block, in the client's words", () => {
    const html = render();
    expect(html).toContain("正式文件样板预览");
    const block = html.slice(html.indexOf('data-testid="letterhead-details"'));
    const order = ["公司正式名称", "测试建筑商 1 Sdn Bhd", "SSM 注册号码", "202601000001 (1234567-X)", "公司地址", "No. 1, Jalan Satu, 47100 Puchong, Selangor", "联系电话", "+603-8061 2345", "Email"];
    let at = 0;
    for (const words of order) {
      const next = block.indexOf(words, at);
      expect(next, words).toBeGreaterThanOrEqual(at);
      at = next;
    }
    // The empty Email says so, and is then not printed.
    expect(block).toContain("未填写");
    expect(block).toContain("未填写的不会印出");
  });

  it("shows page 1 of the sample once it is loaded, with 打开 PDF", () => {
    const html = render({ picture: [PROFILE, "blob:png-1"], pdf: "blob:pdf-1" });
    expect(html).toContain('src="blob:png-1"');
    expect(html).toContain('alt="正式文件样板（A4）第 1 页"');
    expect(html).toContain("打开 PDF");
    expect(html).toContain("抬头和实际导出的 PDF 完全一样");
  });

  it("asks for a new sample after a save: a saved profile is a new picture, never the old one", () => {
    const saved = { ...PROFILE, updated_at: "2026-11-10T11:30:00Z", contact_email: "office@test.my" };
    const html = render({ profile: saved, picture: [PROFILE, "blob:png-before-save"] });
    expect(html).not.toContain("blob:png-before-save");
    expect(html).toContain("正在生成样板");
    // A new logo is saved the same way: a new save, a new picture.
    const relogo = { ...PROFILE, logo: "https://media.test/company/logo/b.png", updated_at: "2026-11-10T12:00:00Z" };
    expect(render({ profile: relogo, picture: [PROFILE, "blob:png-old-logo"] })).not.toContain("blob:png-old-logo");
    // Read again unchanged (a signed logo link may differ): the same picture, not a new one.
    const reread = { ...PROFILE, logo: "https://media.test/company/logo/a.png?signature=2" };
    expect(render({ profile: reread, picture: [PROFILE, "blob:png-same"] })).toContain("blob:png-same");
  });

  it("says when the sample could not be loaded, with 重试", () => {
    const html = render({ failed: true });
    expect(html).toContain("无法载入正式文件样板预览");
    expect(html).toContain("重试");
    expect(html).not.toContain("<img");
    // No file to open: no 打开 PDF that could only wait.
    expect(html).not.toContain("打开 PDF");
  });

  it("fetches the caller's own sample, as a picture or as the PDF, in the page's language", async () => {
    await letterheadPreviewObjectUrl("png", "zh");
    expect(fetchObjectUrl).toHaveBeenCalledWith("/api/contractor-site-settings/get_letterhead_preview/", {
      query: { output: "png", language: "zh" },
      silent: true,
    });
    await letterheadPreviewObjectUrl("pdf", "en");
    expect(fetchObjectUrl).toHaveBeenLastCalledWith("/api/contractor-site-settings/get_letterhead_preview/", {
      query: { output: "pdf", language: "en" },
      silent: true,
    });
  });

  it("prints the address the way the letterhead does", () => {
    expect(letterheadAddress(PROFILE)).toBe("No. 1, Jalan Satu, 47100 Puchong, Selangor");
    expect(letterheadAddress({ address_line_1: "", address_line_2: "Lot 2", postcode: "", city: "Ipoh", state: "" })).toBe("Lot 2, Ipoh");
  });

  it("lets an email wrap after the @ and before a dot, not inside a word (JB164, shot r11-l04)", () => {
    const html = render({ profile: { ...PROFILE, contact_email: "office@shifan.mse.invalid" } });
    const email = html.slice(html.lastIndexOf("<dd", html.indexOf("invalid")), html.indexOf("</dd>", html.indexOf("invalid")));
    expect(email).toContain("office@<wbr/>shifan<wbr/>.mse<wbr/>.invalid");
    // Read as one address: the text itself is unchanged.
    expect(email.replace(/<[^>]+>/g, "")).toBe("office@shifan.mse.invalid");
    expect(emailBreaks("no-at-sign")).toBe("no-at-sign");
    // Other details keep their own spaces as the places to wrap.
    expect(html).toContain("No. 1, Jalan Satu, 47100 Puchong, Selangor</dd>");
  });
});
