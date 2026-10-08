/**
 * 施工计划管理, made simple (Lucas, 2026-10-09: 「这个施工计划管理也是很乱，
 * 我不会用，改成简单的就好，可是gantt chart那些还是需要保留」).
 *
 * Pinned here:
 *
 * - the delay rule as the screen draws it: a task at 100% is never
 *   「已延误」; one finished after its planned end is 「延期完成 N 天」 and says
 *   why, in amber, in the list and on the Gantt alike (spec 7.2.14.10-11);
 * - the layout: plan bar → three figures → Gantt → task list, no view tabs,
 *   everything advanced behind 「更多」 or folded into 「计划版本和记录」;
 * - the figures: 进度 X%（计划 Y%）, 已完成 n/N, 延误 k, and "-" rather than
 *   a zero while there is no answer.
 *
 * Rendered to static markup (the runner has no DOM). Opening 「更多」 and the
 * folded section are browser gestures, checked by eye.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  ScheduleOverview,
  SchedulePlan,
  ScheduleRevision,
  ScheduleTask,
  ScheduleTaskStatus,
} from "@/interfaces/schedule-planning";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({
  permissions: ["schedule.view", "schedule.manage", "schedule.confirm"] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/schedule",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", features: ["schedule"], portal: "MSE_TRACE" },
    can: (code: string) => auth.permissions.includes(code),
  }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["p1", () => {}],
  useProjectBoxShown: () => false,
}));
vi.mock("@/components/consultant-workflow/project-scope-picker", () => ({
  ConsultantProjectPicker: () => <div data-stub="project-picker" />,
}));

const { taskStatusView, isDelayed, lateLabelKey } = await import(
  "@/components/schedule-planning/task-status"
);
const { ScheduleTaskTable } = await import("@/components/schedule-planning/schedule-task-table");
const { ScheduleGantt } = await import("@/components/schedule-planning/schedule-gantt");
const { ScheduleFigures } = await import("@/components/schedule-planning/schedule-figures");
const { SchedulePlanningWorkspace, AdvancedSection } = await import(
  "@/components/schedule-planning/schedule-planning-workspace"
);

const sp = zh.schedulePlanning;

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function task(id: string, overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id,
    project: "p1",
    revision: "r1",
    revision_label: "Baseline",
    parent: null,
    parent_wbs_code: null,
    wbs_code: id,
    name: "Task " + id,
    description: "",
    planned_start: "2026-09-01",
    planned_end: "2026-09-30",
    duration_days: 30,
    weight: "1.00",
    sort_order: 0,
    planned_progress: "100.00",
    actual_progress: "0.00",
    actual_start: null,
    actual_end: null,
    delay_days: 0,
    is_delayed: false,
    schedule_status: "NOT_STARTED",
    progress_note: "",
    progress_confirmed_by: null,
    progress_confirmed_by_name: null,
    progress_confirmed_at: null,
    progress_links: [],
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/** The screenshot's case: 100% done, finished three days after the plan. */
const finishedLate = task("1.1", {
  name: "Piling",
  actual_progress: "100.00",
  actual_start: "2026-09-01",
  actual_end: "2026-10-03",
  delay_days: 3,
  schedule_status: "COMPLETED_LATE",
});
const delayed = task("1.2", {
  name: "Pile caps",
  actual_progress: "60.00",
  delay_days: 9,
  is_delayed: true,
  schedule_status: "DELAYED",
});
const onTime = task("1.3", {
  name: "Hoarding",
  actual_progress: "100.00",
  actual_end: "2026-09-28",
  schedule_status: "COMPLETED",
});

const revision: ScheduleRevision = {
  id: "r1",
  plan: "plan1",
  plan_name: "Master programme",
  project: "p1",
  project_name: "Site A",
  revision_number: 1,
  kind: "BASELINE",
  label: "Tender baseline",
  reason: "",
  source: "MANUAL",
  status: "CONFIRMED",
  is_current: true,
  confirmed_by: "u1",
  confirmed_by_name: "PM",
  confirmed_at: "2026-09-01T00:00:00Z",
  task_count: 3,
  planned_start: "2026-09-01",
  planned_end: "2026-09-30",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const plan: SchedulePlan = {
  id: "plan1",
  project: "p1",
  project_name: "Site A",
  name: "Master programme",
  description: "",
  status: "ACTIVE",
  revision_count: 1,
  current_revision_id: "r1",
  current_revision_label: "Tender baseline",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const summary: ScheduleOverview["summary"] = {
  task_count: 4,
  counted_tasks: 3,
  summary_rows_excluded: 1,
  completed_count: 2,
  delayed_count: 1,
  completed_late_count: 1,
  planned_progress: "100.00",
  actual_progress: "86.67",
};

/** The markup of one table or Gantt row, by its WBS code. */
function rowOf(html: string, wbs: string): string {
  const at = html.indexOf(`>${wbs}</span>`);
  expect(at, `row ${wbs} is drawn`).toBeGreaterThan(-1);
  const start = html.lastIndexOf("data-status=", at);
  const next = html.indexOf("data-status=", at);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("the delay rule, as the screen draws it", () => {
  it("never calls a finished task delayed", () => {
    const statuses: ScheduleTaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELAYED", "COMPLETED", "COMPLETED_LATE"];
    for (const status of statuses) {
      const view = taskStatusView({ schedule_status: status, delay_days: 3 });
      if (status === "COMPLETED" || status === "COMPLETED_LATE") {
        expect(view.key).not.toBe("delayed");
        expect(view.tone).not.toBe("danger");
      }
    }
    expect(taskStatusView(finishedLate)).toEqual({ key: "completedLate", tone: "warning", days: 3, late: true });
    expect(taskStatusView(delayed)).toEqual({ key: "delayed", tone: "danger", days: 9, late: true });
    expect(taskStatusView(onTime)).toEqual({ key: "completed", tone: "positive", days: 0, late: false });
  });

  it("counts only open tasks past their end as delayed, the rows the 延误 card filters to", () => {
    expect([finishedLate, delayed, onTime].filter(isDelayed)).toEqual([delayed]);
  });

  it("puts the days in the badge of a late task only", () => {
    expect(lateLabelKey(taskStatusView(delayed))).toBe("status.delayedDays");
    expect(lateLabelKey(taskStatusView(finishedLate))).toBe("status.completedLateDays");
    expect(lateLabelKey(taskStatusView(onTime))).toBeNull();
  });
});

describe("the task list", () => {
  const html = render(
    <ScheduleTaskTable
      rows={[finishedLate, delayed, onTime]}
      revision={revision}
      canManage
      canConfirm
      emptyText={sp.state.noTasks}
      onEdit={() => {}}
      onProgress={() => {}}
      onRemove={() => {}}
    />,
  );

  it("has the plain columns, in order", () => {
    const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual([
      sp.field.task, sp.field.start, sp.field.end, sp.field.days, sp.field.done, sp.field.status, sp.field.actions,
    ]);
  });

  it("shows a task finished late as 延期完成 with its reason, not 已延误", () => {
    const row = rowOf(html, "1.1");
    expect(row).toContain("延期完成 3 天");
    expect(row).toContain("实际");
    expect(row).not.toContain(sp.status.delayed);
  });

  it("explains each delay beside its badge", () => {
    const row = rowOf(html, "1.2");
    expect(row).toContain("已延误 9 天");
    expect(row).toContain("还没做完");
  });

  it("offers 确认进度 on a confirmed revision", () => {
    expect(html).toContain(sp.action.confirmProgress);
  });

  it("says when 完成% is backed by site records", () => {
    const backed = render(
      <ScheduleTaskTable
        rows={[task("2.1", {
          actual_progress: "40.00",
          schedule_status: "IN_PROGRESS",
          progress_links: [{ id: "l1", progress_record: "rec1", progress_description: "", progress_percent: "40.00", progress_captured_at: "2026-09-10T00:00:00Z", created_at: "2026-09-10T00:00:00Z" }],
        })]}
        revision={revision}
        canManage={false}
        canConfirm={false}
        emptyText={sp.state.noTasks}
        onEdit={() => {}}
        onProgress={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(backed).toContain("附 1 条现场记录");
    // No actions this person may take: no empty 操作 column.
    expect(backed).not.toContain(sp.field.actions);
  });
});

describe("the Gantt chart", () => {
  const html = render(
    <ScheduleGantt tasks={[finishedLate, delayed, onTime]} today={new Date(2026, 8, 15)} />,
  );

  it("paints a task finished late as finished late, never as delayed", () => {
    const row = rowOf(html, "1.1");
    expect(row).toContain('data-status="completedLate"');
    expect(row).toContain("延期完成 3 天");
    expect(row).not.toContain(sp.status.delayed);
  });

  it("marks a task finished on time with no late badge", () => {
    const row = rowOf(html, "1.3");
    expect(row).toContain('data-status="completed"');
    // No badge: the duration is the only thing under its name.
    expect(row).not.toMatch(/inline-flex h-6/);
  });

  it("draws where today falls", () => {
    expect(html).toContain('data-slot="gantt-today"');
    expect(html).toContain(sp.gantt.today);
  });
});

describe("the three figures", () => {
  it("say 进度 X%（计划 Y%）, 已完成 n/N and 延误 k", () => {
    const html = render(
      <ScheduleFigures summary={summary} loading={false} onlyDelayed={false} onToggleDelayed={() => {}} />,
    );
    expect(html).toContain(sp.summary.progress);
    expect(html).toContain("86.67%");
    expect(html).toContain("按计划今天应到 100%");
    // N is the tasks counted, not every row including the summary row.
    expect(html).toContain("2/3");
    expect(html).toContain("其中 1 项延期完成");
    expect(html).toContain(sp.summary.delayedHint);
  });

  it("show a dash, not a zero, while there is no answer", () => {
    const html = render(
      <ScheduleFigures summary={undefined} loading onlyDelayed={false} onToggleDelayed={() => {}} />,
    );
    expect(html).not.toContain("0%");
    expect(html.match(/>-</g)?.length).toBe(3);
  });
});

describe("the page", () => {
  function seeded(rows: ScheduleTask[], plans: SchedulePlan[] = [plan]) {
    const client = new QueryClient();
    client.setQueryData(["schedule-plans", "p1"], { results: plans, count: plans.length });
    client.setQueryData(["schedule-revisions", "plan1"], { results: [revision], count: 1 });
    client.setQueryData(["schedule-tasks", "r1"], { results: rows, count: rows.length });
    client.setQueryData(["schedule-overview", "plan1", "r1"], { plan_id: "plan1", revision, summary });
    return client;
  }

  it("runs plan → figures → Gantt → tasks, with no view tabs", () => {
    const html = render(<SchedulePlanningWorkspace project="p1" />, seeded([finishedLate, delayed, onTime]));
    const order = [
      'data-slot="schedule-plan-bar"',
      'data-slot="schedule-figures"',
      'data-slot="schedule-gantt"',
      'data-slot="schedule-progress-source"',
      'data-slot="schedule-task-table"',
      'data-slot="schedule-advanced"',
    ].map((marker) => html.indexOf(marker));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain('role="tablist"');
  });

  it("keeps the advanced things behind 更多 and a folded section", () => {
    const html = render(<SchedulePlanningWorkspace project="p1" />, seeded([onTime]));
    expect(html).toContain('data-slot="schedule-more"');
    expect(html).toContain(sp.action.more);
    expect(html).toContain(sp.advanced.title);
    expect(html).toContain('aria-expanded="false"');
    // Not on the page itself until asked for.
    expect(html).not.toContain(sp.action.newRevision);
    expect(html).not.toContain(sp.action.exportExcel);
  });

  it("explains where 完成% comes from in one line", () => {
    const html = render(<SchedulePlanningWorkspace project="p1" />, seeded([onTime]));
    expect(html).toContain(sp.progressSource);
  });

  it("offers to make or import a plan when the project has none", () => {
    const html = render(<SchedulePlanningWorkspace project="p1" />, seeded([], []));
    expect(html).toContain(sp.state.noPlans);
    expect(html).toContain(sp.action.newPlan);
    expect(html).toContain(sp.action.importExcel);
    expect(html).not.toContain('data-slot="schedule-gantt"');
  });

  it("opens the folded section onto versions or the log", () => {
    const html = render(
      <AdvancedSection open onOpenChange={() => {}} tab="history" onTabChange={() => {}}>
        <p>log</p>
      </AdvancedSection>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(sp.advanced.revisions);
    expect(html).toContain(sp.advanced.history);
    expect(html).toContain("<p>log</p>");
  });
});
