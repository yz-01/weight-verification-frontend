/**
 * 新增项目只填必要资料 (JB100, 客户 11-05 事项 3 第 2–4 点、事项 4 第 2–4 点).
 *
 * 「只需要填写项目名称、地址、GPS位置及项目负责人等必要资料」: no 项目编号 to
 * type (the system numbers it PRJ-0001 on), no status (a new project is
 * 「进行中」), 「电子围栏半径（米）」 already filled with the default, and the rest
 * under 「更多资料（可选）」, closed. Editing still shows code and status.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Project } from "@/interfaces/contractor";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/create",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/dialog-navigation", async (original) => ({
  ...(await original<typeof import("@/components/shared/dialog-navigation")>()),
  useFinishForm: () => vi.fn(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "hq" }, can: () => true }),
}));
vi.mock("@/components/site-access/geofence-map-editor", () => ({ GeofenceMapEditor: () => null }));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

import { TooltipProvider } from "@/components/ui/tooltip";

const { CreateProject, SYSTEM_DEFAULT_RADIUS_M, newProjectPayload } = await import(
  "@/components/projects/create-project"
);

const EMPTY = {
  code: "", name: "Tower", status: "ACTIVE" as const, client_name: "", main_contractor: "", consultant: "",
  description: "", address_line_1: "1 Jalan", address_line_2: "", city: "", state: "", postcode: "",
  latitude: "", longitude: "", geofence_radius_m: "150", start_date: "", end_date: "",
  site_manager: "Ali", site_phone: "", manager: "", boundary: [] as [number, number][],
};

function render(project?: Project, defaultRadius?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (defaultRadius) {
    client.setQueryData(["projects", "quota"], { limit: null, used: 0, remaining: null, default_geofence_radius_m: defaultRadius });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <CreateProject project={project} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("新增项目 (JB100)", () => {
  it("asks for the name, the person in charge, the address and the place - no code, no status", () => {
    const html = render();
    expect(html).toContain("项目名称");
    expect(html).toContain("项目负责人");
    expect(html).toContain("工地地址");
    expect(html).toContain("获取当前 GPS");
    expect(html).toContain("在下面的地图上画出工地范围");
    expect(html).not.toContain("项目编号</");
    expect(html).toContain("项目编号由系统自动生成（PRJ-0001 起）");
    expect(html).not.toContain("状态");
  });

  it("draws the site point by point instead of a radius (JB110)", () => {
    const html = render();
    expect(html).not.toContain("电子围栏半径（米）");
    expect(html).toContain("在地图上画出工地范围");
    expect(html).toContain("撤销上一个点");
    expect(html).toContain(`暂时用 ${SYSTEM_DEFAULT_RADIUS_M} 米圆形范围`);
    // The company's own default, once read, is what the hint says.
    expect(render(undefined, 220)).toContain("暂时用 220 米圆形范围");
  });

  it("sends the drawn boundary, not a radius", () => {
    const site: [number, number][] = [[3.14, 101.685], [3.14, 101.6886], [3.1405, 101.6886]];
    const sent = newProjectPayload({ ...EMPTY, latitude: "3.1", longitude: "101.7", boundary: site });
    expect(sent).toMatchObject({ boundary: site });
    expect(sent).not.toHaveProperty("geofence_radius_m");
    expect(newProjectPayload({ ...EMPTY, boundary: site.slice(0, 2) })).not.toHaveProperty("boundary");
  });

  it("keeps the rest under 「更多资料（可选）」, closed", () => {
    const html = render();
    expect(html).toContain("更多资料（可选）");
    expect(html).toContain('aria-expanded="false"');
    for (const words of ["业主", "总承包商", "顾问单位", "开工日期", "完工日期"]) expect(html).not.toContain(words);
  });

  it("sends no code and no status, and a radius only with a place", () => {
    const unplaced = newProjectPayload(EMPTY);
    expect(unplaced).not.toHaveProperty("code");
    expect(unplaced).not.toHaveProperty("status");
    expect(unplaced).not.toHaveProperty("geofence_radius_m");
    expect(unplaced).toMatchObject({ name: "Tower", site_manager: "Ali", latitude: null, start_date: null });

    const placed = newProjectPayload({ ...EMPTY, latitude: "3.1", longitude: "101.7", geofence_radius_m: "300" });
    expect(placed).toMatchObject({ latitude: "3.1", longitude: "101.7", geofence_radius_m: 300 });
    // Emptied by the reader: left out, so the company's default applies.
    expect(newProjectPayload({ ...EMPTY, latitude: "3.1", longitude: "101.7", geofence_radius_m: "" })).not.toHaveProperty("geofence_radius_m");
  });

  it("hands the project to the chosen 项目经理 (JB109)", () => {
    expect(newProjectPayload(EMPTY)).not.toHaveProperty("manager");
    expect(newProjectPayload({ ...EMPTY, manager: "u-pm" })).toMatchObject({ manager: "u-pm" });
    const html = render();
    expect(html).toContain("选择项目经理");
    expect(html).toContain("此人自动加入项目");
  });

  it("still shows code, status and every detail when editing", () => {
    const html = render({
      ...EMPTY, id: "p1", code: "PRJ-0001", latitude: null, longitude: null, geofence_radius_m: 150,
      start_date: null, end_date: null,
    } as unknown as Project);
    expect(html).toContain("项目编号");
    expect(html).toContain("PRJ-0001");
    expect(html).toContain("状态");
    expect(html).toContain("开工日期");
    expect(html).toContain('aria-expanded="true"');
  });
});
