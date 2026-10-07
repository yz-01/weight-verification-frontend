/**
 * 工程进度 is one page with five tabs (2026-10 B17):
 * 施工分类 | 现场照片 | 日报告 | 施工计划 | 项目进度摘要.
 *
 * Rendered to static markup (the runner has no DOM). Dragging a block is a
 * browser gesture and is checked by eye (PENDING in the report); what is
 * pinned here is what each state draws - the tabs and their order, who sees
 * 施工计划, and a summary's blocks in the order they were arranged, with
 * 上移 / 下移 where a block can move.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProgressSummary } from "@/interfaces/progress-reports";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({
  features: ["progress", "schedule"] as string[],
  permissions: ["progress.view", "progress.manage", "progress.confirm"] as string[],
}));
const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", features: auth.features, portal: "MSE_TRACE" },
    can: (code: string) => auth.permissions.includes(code),
  }),
}));

const page = await import("@/components/progress/progress-page");
const { SummaryBlocksView, SummaryEditor } = await import("@/components/progress/progress-summary");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The visible text of every tab, in the order drawn. */
function tabLabels(html: string): string[] {
  return [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((match) => match[1]);
}

const summary: ProgressSummary = {
  id: "s1",
  project: "p1",
  project_name: "Site A",
  title: "十月进度摘要",
  author: "u1",
  author_name: "PM",
  updated_by_name: "PM",
  created_at: "2026-10-07T01:00:00Z",
  updated_at: "2026-10-07T01:00:00Z",
  blocks: [
    { id: "t", type: "text", text: "第三层楼板已浇筑完成。" },
    { id: "c", type: "chart", chart: "bar", title: "每月完成", series: "%", points: [{ label: "7月", value: 20 }] },
    { id: "n", type: "number", label: "整体进度", value: "62", unit: "%", note: "" },
  ],
};

describe("the progress page's tabs", () => {
  it("are the five the client asked for, in his order", () => {
    auth.features = ["progress", "schedule"];
    search.value = "";
    expect(tabLabels(render(<page.ProgressTabStrip />))).toEqual([
      "施工分类",
      "现场照片",
      "日报告",
      "施工计划",
      "项目进度摘要",
    ]);
  });

  it("open on 现场照片, where /progress always opened", () => {
    search.value = "";
    const html = render(<page.ProgressTabStrip />);
    expect(html).toMatch(/aria-selected="true"[^>]*>现场照片</);
    search.value = "tab=summary";
    expect(render(<page.ProgressTabStrip />)).toMatch(/aria-selected="true"[^>]*>项目进度摘要</);
    // An address naming no tab this reader has falls back, not blank.
    search.value = "tab=nonsense";
    expect(render(<page.ProgressTabStrip />)).toMatch(/aria-selected="true"[^>]*>现场照片</);
  });

  it("show 施工计划 only to somebody with the schedule", () => {
    auth.features = ["progress"];
    search.value = "";
    expect(tabLabels(render(<page.ProgressTabStrip />))).not.toContain("施工计划");
    expect(page.progressTabsFor(["progress"])).toEqual(["phases", "photos", "reports", "summary"]);
    auth.features = ["progress", "schedule"];
  });

  it("carry the project from one tab to the next, and nothing else", () => {
    expect(
      page.progressTabHref("reports", new URLSearchParams("tab=photos&project=p1&phase=x&page=3")),
    ).toBe("/progress?tab=reports&project=p1");
  });

  it("embed the schedule workspace itself, not a copy", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/progress/progress-page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/active === "schedule" && <SchedulePlanningWorkspace \/>/);
    expect(source).toMatch(/active === "phases" && <PhaseTab \/>/);
  });

  it("are named in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const tab of page.PROGRESS_TABS) {
        expect(messages.progressPage.tabs[tab].trim()).not.toBe("");
        expect(messages.progressPage.subtitle[tab].trim()).not.toBe("");
      }
    }
  });
});

describe("a progress summary", () => {
  it("is shown in the order its blocks were arranged", () => {
    const html = render(<SummaryBlocksView summary={summary} />);
    expect([...html.matchAll(/data-block="(\w+)"/g)].map((match) => match[1])).toEqual([
      "text",
      "chart",
      "number",
    ]);
    expect(html).toContain("第三层楼板已浇筑完成。");
    expect(html).toContain("62");
  });

  it("is edited block by block, each movable up or down where it can go", () => {
    const html = render(
      <SummaryEditor project="p1" summary={summary} onCancel={() => {}} onSaved={() => {}} />,
    );
    expect([...html.matchAll(/data-block-editor="(\w+)"/g)].map((match) => match[1])).toEqual([
      "text",
      "chart",
      "number",
    ]);
    // Three blocks: two can go up (not the first), two can go down (not the last).
    expect(html.match(new RegExp(`aria-label="${zh.progressPage.summary.moveUp}"`, "g"))).toHaveLength(2);
    expect(html.match(new RegExp(`aria-label="${zh.progressPage.summary.moveDown}"`, "g"))).toHaveLength(2);
    expect(html.match(/draggable="true"/g)).toHaveLength(3);
    // Any of the four kinds can be added.
    for (const type of ["text", "photos", "number", "chart"] as const) {
      expect(html).toContain(zh.progressPage.summary.type[type]);
    }
    // Removing the whole summary is behind a switch (spec rule 8).
    expect(html).toContain(zh.progressPage.summary.remove.switch);
    expect(html).not.toContain(zh.progressPage.summary.remove.confirm);
  });

  it("starts empty: nothing is required but its title", () => {
    const html = render(<SummaryEditor project="p1" onCancel={() => {}} onSaved={() => {}} />);
    expect(html).toContain(zh.progressPage.summary.noBlocksYet);
    expect(html).not.toMatch(/data-block-editor=/);
  });
});
