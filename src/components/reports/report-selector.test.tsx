/**
 * D6 / B9: every level of 【选择报表】 is clickable, opens the report at
 * exactly that level, and closes the whole (controlled) menu.
 *
 * The runner has no DOM, so the menu is rendered to static markup with the
 * dropdown primitives replaced by plain elements that render every level at
 * once and record each row's handlers; the test then "clicks" a row by calling
 * them. What the real Radix menu adds - opening a level on hover, and mounting
 * (so fetching) a level only while it is open - is checked in a browser.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

type Handlers = {
  kind: "trigger" | "item";
  onClick?: (event: { preventDefault: () => void }) => void;
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  onPointerDown?: (event: { pointerType: string }) => void;
  onSelect?: (event: Event) => void;
};

const rows: Array<{ text: string } & Handlers> = [];
const menu: { open?: boolean; onOpenChange?: (open: boolean) => void } = {};

function textOf(node: ReactNode): string {
  return renderToStaticMarkup(<>{node}</>).replace(/<[^>]+>/g, "").trim();
}

vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    DropdownMenu: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => {
      menu.open = open;
      menu.onOpenChange = onOpenChange;
      return <div data-menu>{children}</div>;
    },
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuPortal: Pass,
    DropdownMenuSub: Pass,
    DropdownMenuSubContent: Pass,
    DropdownMenuLabel: ({ children }: { children: ReactNode }) => <h6>{children}</h6>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSubTrigger: (props: Handlers & { children: ReactNode }) => {
      rows.push({ ...props, kind: "trigger", text: textOf(props.children) });
      return <span data-trigger>{props.children}</span>;
    },
    DropdownMenuItem: (props: Handlers & { children: ReactNode }) => {
      rows.push({ ...props, kind: "item", text: textOf(props.children) });
      return <span data-item>{props.children}</span>;
    },
  };
});

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

const { ReportMenu } = await import("@/components/reports/report-selector");
const { navLeaves, visibleNavigation } = await import("@/lib/navigation");

const reports = navLeaves(
  visibleNavigation(
    "MSE_TRACE",
    ["report_center", "material_quantity_report", "material_cost_report"],
    ["report.view", "document.view"],
  )
    .flatMap((group) => group.items)
    .find((item) => item.feature === "report_center")?.children,
);

function level(value: string, label: string, has_children = false) {
  return { value, label, project_code: "", has_children };
}

function client() {
  const queries = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const set = (key: unknown[], data: unknown) => queries.setQueryData(key, data);
  set(["project-categories", "material-report", ""], {
    count: 1,
    next: null,
    previous: null,
    results: [{ id: "rebar", name: "钢筋", project: "p1" }],
  });
  set(["projects", "report-selector"], { count: 1, results: [{ id: "p1", code: "P1" }] });
  for (const category of ["", "rebar"]) {
    set(["receipts", "summary", "report-selector", "", category], {
      by_supplier: [{ supplier: "steel-co", supplier_name: "钢材行" }],
    });
  }
  const levels = (type: string, data: unknown, parent = "") =>
    set(["contractor-reports", "levels", type, "", parent], data);
  levels("photos", [
    level("contractor_ops.siteprogressphoto", "Progress"),
    level("site_operations.progressupdate", "Progress"),
  ]);
  levels("progress", [level("piling", "打桩")]);
  levels("safety", [level("scaffold", "棚架")]);
  levels("consultant", [
    level("MATERIAL_APPROVAL", "Material application"),
    level("MATERIAL_CERT_SUBMISSION", "Material certificate submission"),
    level("RFI", "RFI"),
    level("OTHER", "Other"),
  ]);
  levels("equipment", [level("vehicles", "车类", true), level("crane", "吊车")]);
  levels("equipment", [level("lorry", "罗里")], "vehicles");
  levels("recycling", [level("iron", "废铁")]);
  levels("documents", [level("drawings", "图纸", true), level("contracts", "合同")]);
  levels("documents", [level("structural", "结构图")], "drawings");
  return queries;
}

function render(search = "date_from=2026-10-01&date_to=2026-10-07") {
  rows.length = 0;
  const navigate = vi.fn();
  const onOpenChange = vi.fn();
  renderToStaticMarkup(
    <QueryClientProvider client={client()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <ReportMenu
          reports={reports}
          open
          onOpenChange={onOpenChange}
          pathname="/reports/contractor/progress"
          searchParams={new URLSearchParams(search)}
          navigate={navigate}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { navigate, onOpenChange };
}

function find(text: string, nth = 0) {
  const matches = rows.filter((row) => row.text === text);
  if (!matches[nth]) {
    throw new Error(`no row "${text}" #${nth}; rows: ${rows.map((row) => row.text).join(" | ")}`);
  }
  return matches[nth];
}

/** A click as the mouse makes it, on either kind of row. */
function click(text: string, nth = 0) {
  const row = find(text, nth);
  const preventDefault = vi.fn();
  if (row.kind === "trigger") {
    row.onPointerDown?.({ pointerType: "mouse" });
    row.onClick?.({ preventDefault });
  } else {
    row.onSelect?.(new Event("select"));
  }
  return { row, preventDefault };
}

const DATES = "date_from=2026-10-01&date_to=2026-10-07";

describe("【选择报表】 (D6, B9)", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it("is a controlled menu", () => {
    const { onOpenChange } = render();
    expect(menu.open).toBe(true);
    expect(menu.onOpenChange).toBe(onOpenChange);
  });

  it.each([
    // [row, which occurrence, where it leads]
    ["材料数量报表", 0, `/reports/material-quantity?${DATES}`],
    ["照片报表", 0, `/reports/contractor/photos?${DATES}`],
    // The first 工程进度 is the photo report's source of that name.
    ["工程进度", 1, `/reports/contractor/progress?${DATES}`],
    ["设备进退场", 0, `/reports/contractor/equipment?${DATES}`],
    ["项目资料", 0, `/reports/contractor/documents?${DATES}`],
    ["人员进场记录", 0, `/reports/contractor/attendance?${DATES}`],
    ["报表历史记录", 0, `/reports/contractor/history?${DATES}`],
  ])("opens %s itself when the report's own row is clicked", (text, nth, href) => {
    const { navigate, onOpenChange } = render();
    const { preventDefault, row } = click(text, nth);
    expect(navigate).toHaveBeenCalledWith(href);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    if (row.kind === "trigger") expect(preventDefault).toHaveBeenCalled();
  });

  it("opens a material by its name, and 全部材料 too (B9)", () => {
    const material = render();
    click("钢筋");
    expect(material.navigate).toHaveBeenCalledWith(
      `/reports/material-quantity?${DATES}&category=rebar`,
    );
    expect(material.onOpenChange).toHaveBeenCalledWith(false);

    const all = render();
    click("全部材料");
    expect(all.navigate).toHaveBeenCalledWith(`/reports/material-quantity?${DATES}`);

    const supplier = render();
    // Under 钢筋 in 材料数量报表: 全部材料's suppliers come first, then 钢筋's.
    click("钢材行", 1);
    expect(supplier.navigate).toHaveBeenCalledWith(
      `/reports/material-quantity?${DATES}&category=rebar&supplier=steel-co`,
    );
  });

  it("opens every category level at exactly that level", () => {
    const cases: Array<[string, number, string]> = [
      ["打桩", 0, `/reports/contractor/progress?${DATES}&category=piling`],
      ["棚架", 0, `/reports/contractor/safety?${DATES}&category=scaffold`],
      ["RFI", 0, `/reports/contractor/consultant?${DATES}&category=RFI`],
      ["其他", 0, `/reports/contractor/consultant?${DATES}&category=OTHER`],
      ["车类", 0, `/reports/contractor/equipment?${DATES}&category=vehicles`],
      [
        "罗里",
        0,
        `/reports/contractor/equipment?${DATES}&category=vehicles&subcategory=lorry`,
      ],
      ["吊车", 0, `/reports/contractor/equipment?${DATES}&category=crane`],
      ["废铁", 0, `/reports/contractor/recycling?${DATES}&category=iron`],
      ["图纸", 0, `/reports/contractor/documents?${DATES}&category=drawings`],
      [
        "结构图",
        0,
        `/reports/contractor/documents?${DATES}&category=drawings&subcategory=structural`,
      ],
      ["合同", 0, `/reports/contractor/documents?${DATES}&category=contracts`],
    ];
    for (const [text, nth, href] of cases) {
      const { navigate, onOpenChange } = render();
      click(text, nth);
      expect(navigate, text).toHaveBeenCalledWith(href);
      expect(onOpenChange, text).toHaveBeenCalledWith(false);
    }
  });

  it("names the application types and photo sources in the reader's words", () => {
    render();
    expect(find("材料申请").kind).toBe("item");
    expect(find("材料证书提交").kind).toBe("item");
    // Two progress photo tables, one row - and a click asks for both.
    const progressPhotos = rows.filter(
      (row) => row.text === "工程进度" && row.kind === "item",
    );
    expect(progressPhotos).toHaveLength(1);
    const { navigate } = render();
    rows
      .filter((row) => row.text === "工程进度" && row.kind === "item")[0]
      .onSelect?.(new Event("select"));
    expect(navigate).toHaveBeenCalledWith(
      `/reports/contractor/photos?${DATES}&category=${encodeURIComponent(
        "contractor_ops.siteprogressphoto,site_operations.progressupdate",
      )}`,
    );
  });

  it("chooses with Enter, and leaves a finger's first tap to open the level", () => {
    const keyboard = render();
    const enter = vi.fn();
    find("车类").onKeyDown?.({ key: "Enter", preventDefault: enter });
    expect(enter).toHaveBeenCalled();
    expect(keyboard.navigate).toHaveBeenCalledWith(
      `/reports/contractor/equipment?${DATES}&category=vehicles`,
    );

    const arrow = render();
    find("车类").onKeyDown?.({ key: "ArrowRight", preventDefault: vi.fn() });
    expect(arrow.navigate).not.toHaveBeenCalled();

    const finger = render();
    const row = find("车类");
    row.onPointerDown?.({ pointerType: "touch" });
    const preventDefault = vi.fn();
    row.onClick?.({ preventDefault });
    expect(finger.navigate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
