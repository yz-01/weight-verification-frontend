/**
 * 外部设备接入 / Device Integration (JB69, client 10-29: 「把它写进菜单里」).
 *
 * In the 系统 section of the menu for whoever sees 系统集成; one card per
 * device kind - 已接入 with its devices, 可以接入, 等启用 for the drone - and a
 * link to the existing 系统集成 settings rather than a second copy.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DeviceOverviewKind } from "@/interfaces/integration";
import { visibleNavigation } from "@/lib/navigation";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/device-integration",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const get = vi.hoisted(() => vi.fn());
vi.mock("@/services/api-client", () => ({
  api: { get, post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { DeviceIntegration, kindNoteKey } = await import(
  "@/components/integrations/device-integration"
);
const { getDeviceOverview } = await import("@/services/integration.service");

const ROWS: DeviceOverviewKind[] = [
  {
    kind: "WEIGHBRIDGE",
    state: "CONNECTED",
    devices: [
      { id: "g1", device_id: "GW-1", last_seen_at: "2026-10-29T01:00:00Z", is_active: true, where: "Bridge 1" },
    ],
  },
  { kind: "CCTV", state: "AVAILABLE", devices: [] },
  { kind: "DRONE", state: "WAITING", devices: [] },
];

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["device-overview"], ROWS);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <DeviceIntegration />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the page", () => {
  it("says each kind's state plainly, the drone waiting", () => {
    const html = render();
    expect(html).toContain("外部设备接入");
    expect(html).toContain("地磅");
    expect(html).toContain("已接入");
    expect(html).toContain("GW-1");
    expect(html).toContain("Bridge 1");
    expect(html).toContain("最后上线");
    expect(html).toContain("可以接入");
    expect(html).toContain("等启用");
    expect(html).toContain("等贵司启用时，告诉我们无人机品牌和管理平台，我们再接入");
  });

  it("links to the existing 系统集成 settings", () => {
    expect(render()).toMatch(/href="\/integrations"[^>]*>.*打开系统集成设定/);
  });

  it("notes only a kind without devices", () => {
    expect(kindNoteKey(ROWS[0])).toBeNull();
    expect(kindNoteKey(ROWS[1])).toBe("available");
    expect(kindNoteKey(ROWS[2])).toBe("droneWaiting");
  });
});

describe("the request", () => {
  it("reads the overview endpoint", async () => {
    get.mockResolvedValueOnce({ kinds: ROWS });
    await expect(getDeviceOverview()).resolves.toEqual(ROWS);
    expect(get).toHaveBeenCalledWith("/api/integrations/get_device_overview/", undefined);
  });
});

describe("the menu", () => {
  it("is in 系统 for whoever has 系统集成, in both company portals", () => {
    for (const portal of ["MSE_TRACE", "MSE_SCRAP"] as const) {
      const system = visibleNavigation(portal, ["integrations"]).find((group) => group.key === "system");
      expect(system?.items.some((item) => item.href === "/device-integration")).toBe(true);
      const without = visibleNavigation(portal, ["company_settings"]).flatMap((group) => group.items);
      expect(without.some((item) => item.href === "/device-integration")).toBe(false);
    }
  });

  it("is named the same in all four languages as the page title", () => {
    const names = { zh: "外部设备接入", "zh-TW": "外部設備接入", en: "Device Integration", ms: "Integrasi Peranti" };
    for (const [messages, lang] of [[zh, "zh"], [zhTW, "zh-TW"], [en, "en"], [ms, "ms"]] as const) {
      expect(messages.nav.submodule.deviceIntegration).toBe(names[lang]);
      expect(messages.integrations.deviceOverview.title).toBe(names[lang]);
      expect(messages.integrations.deviceOverview.state.WAITING).toBeTruthy();
    }
  });
});
