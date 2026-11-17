/**
 * MSE Scrap 公司设置 · AI CCTV / 车牌识别 ANPR (JB214-5, Lucas 11-16 「把它们真的
 * 做出来」): the switches now decide what the yard does, so the words say what
 * on and off do - and, with no device bound, that switching on changes
 * nothing yet. Rendered to static markup: the runner has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { RecyclerSettings } from "@/interfaces/recycler";
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

function render(counts: { cctv: number; anpr: number }) {
  const settings = {
    id: "r1", company: "c1", system_notifications: true, email_notifications: true, push_notifications: true,
    deduction_confirmation_kg: "50", ai_cctv_enabled: counts.cctv > 0, anpr_enabled: counts.anpr > 0,
    driver_link_close_rule: "ON_COMPLETE", driver_link_idle_days: 7, commission: null,
    ai_cctv_device_count: counts.cctv, anpr_device_count: counts.anpr,
    created_at: "2026-11-16T00:00:00Z", updated_at: "2026-11-16T00:00:00Z",
  } as unknown as RecyclerSettings;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["recycler-settings"], settings);
  client.setQueryData(["recycler-company-profile"], { id: "c1", code: "RC-1", name: "示范回收", updated_at: "" });
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
  return html.match(/id="recycler-business"[\s\S]*?id="recycler-driver-link"/)?.[0] ?? "";
}

describe("AI CCTV / ANPR switches (JB214-5)", () => {
  it("say what on and off do, not 「平台完成硬件连接后」", () => {
    const block = render({ cctv: 1, anpr: 2 });
    expect(block).toContain(zh.recyclerCompanySettings.business.cctvHelp);
    expect(block).toContain(zh.recyclerCompanySettings.business.anprHelp);
    expect(block).toContain("已绑定 1 台");
    expect(block).toContain("已绑定 2 台");
    expect(block).not.toContain("平台完成硬件连接后");
    expect(block).not.toContain(zh.recyclerCompanySettings.business.noDevice);
  });

  it("say that a switch with no device bound does nothing yet", () => {
    const block = render({ cctv: 0, anpr: 1 });
    expect(block.match(/data-testid="hardware-none-bound"/g)?.length).toBe(1);
    expect(block).toContain(zh.recyclerCompanySettings.business.noDevice);
  });
});
