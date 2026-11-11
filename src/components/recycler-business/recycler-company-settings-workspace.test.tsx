/**
 * MSE Scrap's 公司设置 · 公司资料 background (JB164): named and sized like the
 * builder's 公司资料 (JB161, 客户 11-10 第十一批 「仪表盘背景图 … 建议上传尺寸
 * 1920 × 400px」), and a saved one can be taken away, sent empty with
 * 【保存公司资料】. Rendered to static markup: the runner has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { RecyclerSettings } from "@/interfaces/recycler";
import type { ContractorCompanyProfile } from "@/interfaces/site-access";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true, refresh: vi.fn() }),
}));
vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
}));

const { RecyclerCompanySettingsWorkspace } = await import(
  "@/components/recycler-business/recycler-company-settings-workspace"
);

const SETTINGS = {
  id: "r1",
  company: "c1",
  system_notifications: true,
  email_notifications: true,
  push_notifications: true,
  deduction_confirmation_kg: "50",
  ai_cctv_enabled: false,
  anpr_enabled: false,
  driver_link_close_rule: "ON_COMPLETE",
  driver_link_idle_days: 7,
  commission: null,
  ai_cctv_device_count: 0,
  anpr_device_count: 0,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
} as unknown as RecyclerSettings;

const PROFILE = {
  id: "c1", code: "RC-1", name: "示范回收有限公司", description: "", registration_no: "", tax_id: "", sst_no: "",
  logo: null, background_image: null, contact_person: "", contact_designation: "", address_line_1: "", address_line_2: "",
  city: "", state: "", postcode: "", country: "MY", latitude: null, longitude: null, contact_phone: "", contact_email: "",
  billing_email: "", website: "", default_language: "zh", timezone: "Asia/Kuala_Lumpur", updated_at: "2026-11-01T00:00:00Z",
} as unknown as ContractorCompanyProfile;

function render(profile: Partial<ContractorCompanyProfile> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["recycler-settings"], SETTINGS);
  client.setQueryData(["recycler-company-profile"], { ...PROFILE, ...profile });
  client.setQueryData(["recycler-company-bank-accounts"], { count: 0, results: [] });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <RecyclerCompanySettingsWorkspace />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return html.match(/<div class="space-y-3" data-company-background="true">[\s\S]*?建议尺寸[^<]*<\/p><\/div>/)?.[0] ?? "";
}

describe("MSE Scrap 公司资料 · 仪表盘背景图 (JB164)", () => {
  it("is called 仪表盘背景图 with the builder's size hint and the banner's shape", () => {
    const block = render();
    expect(block).toContain("仪表盘背景图");
    expect(block).toContain("建议尺寸 1920 × 400 px（横向照片）");
    expect(block).toContain("aspect-[24/5]");
    expect(block).toContain("选择背景图");
    // Nothing to take away yet.
    expect(block).not.toContain("移除背景图");
  });

  it("offers 移除背景图 once a background is saved", () => {
    const picture = "https://cdn.example/company/background/yard.jpg";
    const block = render({ background_image: picture });
    expect(block).toContain(`src="${picture}"`);
    expect(block).toContain('aria-label="移除背景图"');
  });
});
