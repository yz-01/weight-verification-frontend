/**
 * 施工计划 ↔ 项目进度摘要 (客户 11-27c = JB289).
 *
 * - 一: 项目进度摘要 draws the 计划 / 实际 曲线 by itself, below the 对比条,
 *   two colours and a legend, dates across and % up; every confirmation is a
 *   point; no confirmation / no task says what is missing; the hand-made
 *   summaries and their charts stay.
 * - 二: 施工计划's Excel carries 实际完成日期, 任务完成状态, 顾问审批编号及审批结果,
 *   关联现场记录编号, 进度确认人, 确认时间 and 施工计划版本, in the reader's words.
 * - 三: the automatic block has 预览 · 打印 · 导出 · 发送 (one PDF); a draft
 *   version is previewed only; never on the phone.
 * - All new words in the four languages, saying 你.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  ScheduleProgressCurve,
  ScheduleProjectProgressPlan,
  ScheduleRevision,
} from "@/interfaces/schedule-planning";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ fieldStaff: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", features: ["schedule"], portal: "MSE_TRACE", is_field_staff: auth.fieldStaff },
    can: () => true,
  }),
}));

const { ScheduleProgressCurveChart, curveRows, dayValue } = await import(
  "@/components/progress/schedule-progress-curve"
);
const { ScheduleProgressFigures, ScheduleProgressDashboard } = await import(
  "@/components/progress/schedule-progress-dashboard"
);
const { scheduleExportBody, SCHEDULE_EXPORT_COLUMNS } = await import(
  "@/services/schedule-planning.service"
);
const { versionLine } = await import("@/components/schedule-planning/schedule-export-words");

const SRC = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf-8");
const w = zh.jb289;

function render(node: React.ReactNode, client = new QueryClient(), locale = "zh") {
  const messages = { zh, "zh-TW": zhTW, en, ms }[locale] ?? zh;
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const curve: ScheduleProgressCurve = {
  start: "2026-11-24",
  end: "2026-11-27",
  today: "2026-11-26",
  planned: [
    { date: "2026-11-24", value: "8.33" },
    { date: "2026-11-25", value: "16.67" },
    { date: "2026-11-26", value: "25.00" },
    { date: "2026-11-27", value: "100.00" },
  ],
  actual: [
    { at: null, date: "2026-11-24", value: "0.00", task_wbs_code: "", task_name: "", actor_name: "", progress_before: null, progress_after: null },
    { at: "2026-11-26T02:00:00Z", date: "2026-11-26", value: "20.00", task_wbs_code: "1.1", task_name: "Rebar", actor_name: "Ong", progress_before: "0.00", progress_after: "40.00" },
    { at: "2026-11-26T05:00:00Z", date: "2026-11-26", value: "50.00", task_wbs_code: "1.1", task_name: "Rebar", actor_name: "Ong", progress_before: "40.00", progress_after: "100.00" },
  ],
};

function plan(overrides: Partial<ScheduleProjectProgressPlan> = {}): ScheduleProjectProgressPlan {
  return {
    plan_id: "plan1",
    plan_name: "Approved Baseline Schedule",
    revision: { id: "r1", status: "CONFIRMED", revision_number: 1, label: "Tender Baseline" } as ScheduleRevision,
    summary: {
      planned_progress: "25.00", actual_progress: "50.00", completed_count: 1, counted_tasks: 2,
      delayed_count: 0, completed_late_count: 0,
    },
    tasks: [{
      id: "t1", wbs_code: "1.1", name: "Rebar", planned_progress: "50.00",
      actual_progress: "100.00", schedule_status: "COMPLETED", progress_confirmed_at: null,
    }],
    curve,
    ...overrides,
  };
}

describe("JB289 一 曲线图 in 项目进度摘要", () => {
  it("puts every planned day and every confirmation on the chart, in date order", () => {
    const rows = curveRows(curve);
    expect(rows.map((row) => [row.t, row.planned, row.actual])).toEqual([
      [dayValue("2026-11-24"), 8.33, 0],
      [dayValue("2026-11-25"), 16.67, undefined],
      [dayValue("2026-11-26"), 25, 20],
      [dayValue("2026-11-26"), 25, 50],
      [dayValue("2026-11-27"), 100, undefined],
    ]);
    // Each change of the history keeps who confirmed what.
    expect(rows[3].confirmation?.progress_after).toBe("100.00");
    expect(rows[0].confirmation).toBeUndefined();
  });

  it("shows the two lines' legend, the axes and no empty note once confirmed", () => {
    const html = render(<ScheduleProgressCurveChart curve={curve} />);
    expect(html).toContain(w.curveTitle);
    expect(html).toContain(w.curvePlanned);
    expect(html).toContain(w.curveActual);
    expect(html).toContain("计划进度（Planned Progress）");
    expect(html).toContain("实际进度（Actual Progress）");
    expect(html).toContain(w.curveAxes);
    expect(html).not.toContain(w.noConfirmation);
  });

  it("says what is missing: no confirmation yet, or no task", () => {
    const unconfirmed = render(<ScheduleProgressCurveChart curve={{ ...curve, actual: [] }} />);
    expect(unconfirmed).toContain(w.noConfirmation);
    expect(unconfirmed).toContain(w.curvePlanned);
    const none = render(
      <ScheduleProgressCurveChart curve={{ start: null, end: null, today: null, planned: [], actual: [] }} />,
    );
    expect(none).toContain(w.noCurve);
  });

  it("sits below the 对比条, inside the automatic block", () => {
    const html = render(<ScheduleProgressFigures plan={plan()} />);
    const bars = html.indexOf('data-slot="schedule-progress-chart"');
    const lines = html.indexOf('data-slot="schedule-progress-curve"');
    expect(bars).toBeGreaterThan(-1);
    expect(lines).toBeGreaterThan(bars);
  });

  it("uses the product's chart colours (two different ones) in light and dark", () => {
    const source = read("components/progress/schedule-progress-curve.tsx");
    expect(source).toContain('PLANNED_COLOUR = "var(--chart-2)"');
    expect(source).toContain('ACTUAL_COLOUR = "var(--chart-5)"');
    expect(source).toContain('from "recharts"');
  });

  it("keeps the hand-made summaries and their charts", () => {
    const source = read("components/progress/progress-summary.tsx");
    expect(source).toContain("<ScheduleProgressDashboard project={project} />");
    expect(source).toContain("export function SummaryChart");
    expect(source).toContain('t("new")');
  });
});

describe("JB289 三 报表: 预览 · 打印 · 导出 · 发送", () => {
  it("offers the four file actions on the automatic block", () => {
    auth.fieldStaff = false;
    const client = new QueryClient();
    client.setQueryData(["schedule-project-progress", "p1"], { project: "p1", plans: [plan()] });
    const html = render(<ScheduleProgressDashboard project="p1" />, client);
    expect(html).toContain('data-slot="schedule-progress-report"');
    expect(html).toContain(w.reportLabel);
    for (const action of ["preview", "print", "save", "share"] as const) {
      expect(html).toContain(zh.fileActions[action]);
    }
  });

  it("previews a draft version only, and says why", () => {
    const client = new QueryClient();
    const draft = plan({ revision: { id: "r2", status: "DRAFT", revision_number: 2, label: "Rev 1" } as ScheduleRevision });
    client.setQueryData(["schedule-project-progress", "p1"], { project: "p1", plans: [draft] });
    const html = render(<ScheduleProgressDashboard project="p1" />, client);
    expect(html).toContain(zh.draftRecords.draftRevision);
  });

  it("never shows on the phone", () => {
    auth.fieldStaff = true;
    const client = new QueryClient();
    client.setQueryData(["schedule-project-progress", "p1"], { project: "p1", plans: [plan()] });
    const html = render(<ScheduleProgressDashboard project="p1" />, client);
    expect(html).not.toContain('data-slot="schedule-progress-report"');
    auth.fieldStaff = false;
  });

  it("asks the server for the PDF of the version on screen, in the reader's language", () => {
    const source = read("services/schedule-planning.service.ts");
    expect(source).toContain("/api/schedules/${planId}/get_progress_report_pdf/");
    expect(source).toContain("query: { lang, ...(revisionId ? { revision: revisionId } : {}) }");
  });
});

describe("JB289 二 施工计划 Excel", () => {
  const words = {
    lang: "zh",
    title: w.exportTitle,
    subtitle: "施工计划版本：版本 2 · Rev 1",
    columns: Object.fromEntries(SCHEDULE_EXPORT_COLUMNS.map((key) => [key, w.column[key]])) as Record<
      (typeof SCHEDULE_EXPORT_COLUMNS)[number],
      string
    >,
    status: {
      NOT_STARTED: "未开始", IN_PROGRESS: "进行中", DELAYED: "已延误", COMPLETED: "已完成", COMPLETED_LATE: "延期完成",
    },
  };

  it("adds the six related figures to the file, worded", () => {
    const body = scheduleExportBody("r1", "xlsx", { words });
    const labels = body.columns.map((column) => column.label);
    for (const label of [
      "实际完成日期", "任务完成状态", "顾问审批编号及审批结果", "关联现场记录编号", "进度确认人", "确认时间", "施工计划版本",
    ]) {
      expect(labels).toContain(label);
    }
    expect(body.subtitle).toContain("施工计划版本");
    expect(body.lang).toBe("zh");
    expect(body.columns.find((column) => column.key === "schedule_status")).toMatchObject({
      values: { COMPLETED: "已完成", NOT_STARTED: "未开始" },
    });
  });

  it("keeps the old columns and the delayed-only choice", () => {
    const body = scheduleExportBody("r1", "pdf", { delayed: true, words });
    expect(body.delayed).toBe(true);
    const keys = body.columns.map((column) => column.key);
    for (const key of ["wbs_code", "name", "planned_start", "planned_end", "actual_progress", "delay_days", "progress_note"]) {
      expect(keys).toContain(key);
    }
  });

  it("the workspace hands the export its words and the version", () => {
    const source = read("components/schedule-planning/schedule-planning-workspace.tsx");
    expect(source).toContain("words: exportWords(revision)");
    expect(versionLine("版本 2", "Rev 1")).toBe("版本 2 · Rev 1");
    expect(versionLine("版本 1", "")).toBe("版本 1");
  });
});

describe("JB289 words", () => {
  it("every new word is in all four languages", () => {
    const keys = (group: Record<string, unknown>) =>
      Object.entries(group)
        .flatMap(([key, value]) =>
          typeof value === "object" && value ? Object.keys(value).map((inner) => `${key}.${inner}`) : [key],
        )
        .sort();
    for (const messages of [zhTW, en, ms]) {
      expect(keys(messages.jb289)).toEqual(keys(zh.jb289));
    }
    for (const key of SCHEDULE_EXPORT_COLUMNS) {
      for (const messages of [zh, zhTW, en, ms]) {
        expect(messages.jb289.column[key]).toBeTruthy();
      }
    }
  });

  it("the Chinese speaks 你, never 您", () => {
    expect(JSON.stringify(zh.jb289)).not.toContain("您");
    expect(JSON.stringify(zhTW.jb289)).not.toContain("您");
  });

  it("reads in English for an English reader", () => {
    const html = render(<ScheduleProgressCurveChart curve={curve} />, new QueryClient(), "en");
    expect(html).toContain("Planned Progress");
    expect(html).toContain("Actual Progress");
  });
});
