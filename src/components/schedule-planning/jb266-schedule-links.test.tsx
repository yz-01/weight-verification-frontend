/**
 * 施工计划's links (客户 11-26 事项 7, 8, 12, 13, 14 = JB266, JB267, JB271,
 * JB272, JB273).
 *
 * - JB266: 「顾问审批」 sits between 「状态」 and 「操作」, each application's
 *   number and status, 「—」 with none; hidden from a reader without 顾问申请.
 * - JB273: 「附 N 条现场记录」 is a button when the records were sent, plain
 *   text (JB225: a consultant without 施工进度) when not.
 * - JB271: 「关联现场进度」 rows show number, photo, 施工分类, time, 上传人;
 *   the search asks the server (search / phase / dates / page).
 * - JB272: 操作记录 rows show 确认前 → 确认后, the records of that time, who
 *   and when; the entry window shows all of it.
 * - JB267: 项目进度摘要 opens on the schedule's four figures and the chart,
 *   from `get_project_progress`, above the hand-written summaries.
 * - All new words in the four languages.
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
  ProgressCandidate,
  ScheduleHistoryEntry,
  ScheduleProjectProgressPlan,
  ScheduleRevision,
  ScheduleTask,
} from "@/interfaces/schedule-planning";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", features: ["schedule"], portal: "MSE_TRACE" },
    can: () => true,
  }),
}));

const { ScheduleTaskTable } = await import("@/components/schedule-planning/schedule-task-table");
const records = await import("@/components/schedule-planning/schedule-records");
const { ScheduleProgressFigures, ScheduleProgressDashboard } = await import(
  "@/components/progress/schedule-progress-dashboard"
);

const SRC = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf-8");
const u = zh.jb266;

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const revision = { id: "r1", status: "CONFIRMED" } as ScheduleRevision;

function task(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: "t1", project: "p1", revision: "r1", revision_label: "Baseline", parent: null,
    parent_wbs_code: null, wbs_code: "1.1", name: "Reinforcement Works-Ground Floor",
    description: "", planned_start: "2026-11-25", planned_end: "2026-11-30", duration_days: 6,
    weight: "1.00", sort_order: 0, planned_progress: "16.67", actual_progress: "100.00",
    actual_start: "2026-11-25", actual_end: null, delay_days: 0, is_delayed: false,
    schedule_status: "COMPLETED", progress_note: "", progress_confirmed_by: null,
    progress_confirmed_by_name: null, progress_confirmed_at: null,
    progress_links: [
      { id: "l1", progress_record: "rec1", progress_description: "", progress_percent: "0", progress_captured_at: "", created_at: "" },
    ],
    progress_link_count: 4,
    consultant_approvals: [{ id: "a1", application_no: "RFI-PRJ-0003-001", revision: 0, status: "APPROVED" }],
    created_at: "", updated_at: "",
    ...overrides,
  };
}

const record: ProgressCandidate = {
  id: "rec1", record_no: "PG-PRJ-0003-012", phase: "ph1", phase_name: "Package AB",
  category_name: null, description: "Ground floor rebar", percent_complete: null,
  captured_at: "2026-11-23T11:41:00Z", is_rain: false, submitted_by_name: "ah ong",
  created_by_name: "ah ong", cover_photo_url: "https://example.test/t.webp",
  photo_thumbs: ["https://example.test/t.webp"], photo_count: 2,
};

describe("JB266 「顾问审批」 column", () => {
  it("sits between 状态 and 操作 with the application number and status", () => {
    const html = render(
      <ScheduleTaskTable rows={[task()]} revision={revision} canManage canConfirm emptyText=""
        onEdit={() => {}} onProgress={() => {}} onRemove={() => {}}
        onLinkedRecords={() => {}} onOpenApplication={() => {}} />,
    );
    const status = html.indexOf(">" + zh.schedulePlanning.field.status + "<");
    const approvals = html.indexOf(">" + u.approvalColumn + "<");
    const actions = html.indexOf(">" + zh.schedulePlanning.field.actions + "<");
    expect(status).toBeGreaterThan(-1);
    expect(approvals).toBeGreaterThan(status);
    expect(actions).toBeGreaterThan(approvals);
    expect(html).toContain("RFI-PRJ-0003-001");
    expect(html).toContain(zh.consultantWorkflow.status.APPROVED);
  });

  it("shows 「—」 for a task without applications and no column without 顾问申请", () => {
    const none = render(
      <ScheduleTaskTable rows={[task({ consultant_approvals: [] })]} revision={revision} canManage={false}
        canConfirm emptyText="" onEdit={() => {}} onProgress={() => {}} onRemove={() => {}}
        onOpenApplication={() => {}} />,
    );
    expect(none).toMatch(/data-slot="consultant-approvals"[^>]*>—</);
    const hidden = render(
      <ScheduleTaskTable rows={[task()]} revision={revision} canManage={false} canConfirm emptyText=""
        onEdit={() => {}} onProgress={() => {}} onRemove={() => {}} />,
    );
    expect(hidden).not.toContain(u.approvalColumn);
  });

  it("opens the application where the schedule is (the whole approval record)", () => {
    const source = read("components/schedule-planning/schedule-planning-workspace.tsx");
    expect(source).toContain('<InPlaceRecord kind="CONSULTANT_APPLICATION"');
    expect(source).toContain('onOpenApplication={can("approval.view") ? setOpenedApplication : undefined}');
  });
});

describe("JB273 「附 N 条现场记录」 opens the records", () => {
  it("is a button when the records were sent", () => {
    const html = render(
      <ScheduleTaskTable rows={[task()]} revision={revision} canManage={false} canConfirm emptyText=""
        onEdit={() => {}} onProgress={() => {}} onRemove={() => {}} onLinkedRecords={() => {}} />,
    );
    expect(html).toMatch(/<button[^>]*data-slot="linked-records-open"[^>]*>附 4 条现场记录<\/button>/);
  });

  it("stays plain text for a reader the records were not sent to (JB225)", () => {
    const html = render(
      <ScheduleTaskTable rows={[task({ progress_links: [] })]} revision={revision} canManage={false}
        canConfirm emptyText="" onEdit={() => {}} onProgress={() => {}} onRemove={() => {}}
        onLinkedRecords={() => {}} />,
    );
    expect(html).toContain("附 4 条现场记录");
    expect(html).not.toContain("linked-records-open");
  });

  it("lists number, photo, time and 记录人, each opening the original record", () => {
    const client = new QueryClient();
    client.setQueryData(["schedule-task-linked-records", "t1", 1], {
      count: 1, page: 1, page_size: 20, total_pages: 1, results: [record],
    });
    const html = render(<records.LinkedRecordsDialog task={task()} onClose={() => {}} />, client);
    expect(html).toContain("PG-PRJ-0003-012");
    expect(html).toContain("Package AB");
    expect(html).toContain(u.recorder + " ah ong");
    expect(html).toContain("https://example.test/t.webp");
    expect(html).toContain(u.openRecord);
    const source = read("components/schedule-planning/schedule-records.tsx");
    expect(source).toContain('<InPlaceRecord kind="PROGRESS" id={opened}');
  });
});

describe("JB271 「关联现场进度」", () => {
  it("shows number, photo, 施工分类, time and 上传人 on each row", () => {
    const html = render(<records.RecordLine row={record} recorderWord="uploader" />);
    expect(html).toContain("PG-PRJ-0003-012");
    expect(html).toContain("Package AB");
    expect(html).toContain(u.recordedAt);
    expect(html).toContain(u.uploader + " ah ong");
    expect(html).toContain("https://example.test/t.webp");
  });

  it("searches on the server by number / 施工分类 / day, a page at a time", () => {
    const source = read("components/schedule-planning/schedule-records.tsx");
    for (const key of ["search:", "phase:", "date_from:", "date_to:", "page_size: PAGE_SIZE"]) {
      expect(source).toContain(key);
    }
    expect(read("services/schedule-planning.service.ts")).toContain(
      'api.list<ProgressCandidate>("/api/schedule-tasks/get_progress_candidates/"',
    );
    const html = render(
      <records.ProgressRecordPicker project="p1" linked={[record]} selected={["rec1"]} onToggle={() => {}} />,
    );
    expect(html).toContain(u.searchPlaceholder);
    expect(html).toContain(u.alreadyLinked.replace("{count}", "1"));
    // The record already linked is ticked and locked.
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*aria-label="PG-PRJ-0003-012" checked=""/);
  });
});

describe("JB272 操作记录", () => {
  const entry: ScheduleHistoryEntry = {
    id: "h1", plan: "plan1", revision: "r1", revision_label: "Approved Baseline Schedule",
    task: "t1", task_name: "Reinforcement Works-Ground Floor", task_wbs_code: "1.1",
    event: "PROGRESS_CONFIRMED", note: "for testing only",
    snapshot: { actual_start: "2026-11-25", actual_end: "" },
    actor: "u1", actor_name: "mike", created_at: "2026-11-25T15:42:00Z",
    progress_before: "40.00", progress_after: "100.00", linked_records: [record],
    linked_record_count: 1, new_record_ids: ["rec1"],
  };

  it("each row shows before → after, the records of that time, who and when", () => {
    const html = render(<records.HistoryList rows={[entry]} onOpen={() => {}} />);
    expect(html).toContain("进度 40% → 100%");
    expect(html).toContain(u.historyRecords.replace("{count}", "1"));
    expect(html).toContain("PG-PRJ-0003-012");
    expect(html).toContain("mike");
    expect(html).toContain("for testing only");
    expect(html).toMatch(/<button[^>]*data-slot="schedule-history-row"/);
  });

  it("an older entry that cannot tell its before says 「—」", () => {
    const html = render(<records.HistoryList rows={[{ ...entry, progress_before: null }]} onOpen={() => {}} />);
    expect(html).toContain("进度 — → 100%");
  });

  it("the entry window shows the whole confirmation", () => {
    const html = render(<records.HistoryEntryDialog entry={entry} onClose={() => {}} />);
    for (const word of [u.before, u.after, u.confirmer, u.confirmedAt, u.newThisTime]) {
      expect(html).toContain(word);
    }
    expect(html).toContain("40%");
    expect(html).toContain("PG-PRJ-0003-012");
  });

  it("a reader without 施工进度 is told why only the number shows", () => {
    const html = render(
      <records.HistoryEntryDialog entry={{ ...entry, linked_records: [], linked_record_count: 2 }} onClose={() => {}} />,
    );
    expect(html).toContain(u.recordsHidden);
  });

  it("is paged rather than cut at a hundred", () => {
    const source = read("components/schedule-planning/schedule-planning-workspace.tsx");
    expect(source).toContain("getScheduleHistory(plan!.id, { page: historyPage })");
    expect(source).toContain("<Pager page={historyPage}");
  });
});

describe("JB267 项目进度摘要 from the schedule", () => {
  const plan: ScheduleProjectProgressPlan = {
    plan_id: "plan1", plan_name: "Approved Baseline Schedule", revision: null,
    summary: {
      planned_progress: "16.67", actual_progress: "100.00", completed_count: 1, counted_tasks: 1,
      delayed_count: 0, completed_late_count: 0,
    },
    tasks: [{
      id: "t1", wbs_code: "1.1", name: "Reinforcement Works-Ground Floor", planned_progress: "16.67",
      actual_progress: "100.00", schedule_status: "COMPLETED", progress_confirmed_at: null,
    }],
  };

  it("shows the four figures and the planned / actual chart", () => {
    const html = render(<ScheduleProgressFigures plan={plan} />);
    for (const word of [u.plannedProgress, u.actualProgress, u.completedTasks, u.delayedTasks, u.chartTitle]) {
      expect(html).toContain(word);
    }
    expect(html).toContain("16.67%");
    expect(html).toContain("100%");
    expect(html).toContain("1/1");
    expect(html).toContain("Reinforcement Works-Ground Floor");
    expect(html).toContain('style="width:16.67%"');
    expect(html).toContain('style="width:100%"');
  });

  it("opens with the schedule's figures, nothing to press", () => {
    const client = new QueryClient();
    client.setQueryData(["schedule-project-progress", "p1"], { project: "p1", plans: [plan] });
    const html = render(<ScheduleProgressDashboard project="p1" />, client);
    expect(html).toContain(u.dashboardTitle);
    expect(html).toContain("Approved Baseline Schedule");
    expect(html).toContain("16.67%");
    const empty = render(<ScheduleProgressDashboard project="" />);
    expect(empty).toContain(u.chooseProject);
  });

  it("sits above the hand-written summaries, which stay", () => {
    const source = read("components/progress/progress-summary.tsx");
    const dashboard = source.indexOf("<ScheduleProgressDashboard project={project} />");
    expect(dashboard).toBeGreaterThan(-1);
    expect(source.indexOf("<QueryFailedNote query={summaries}")).toBeGreaterThan(dashboard);
    expect(source).toContain('t("new")');
    expect(source).toContain("<FileActionButtons");
  });
});

describe("JB266-JB273 words", () => {
  it("every new word is in all four languages", () => {
    const keys = Object.keys(zh.jb266).sort();
    for (const messages of [zhTW, en, ms]) {
      expect(Object.keys(messages.jb266).sort()).toEqual(keys);
    }
  });

  it("the Chinese speaks 你, never 您", () => {
    expect(JSON.stringify(zh.jb266)).not.toContain("您");
    expect(JSON.stringify(zhTW.jb266)).not.toContain("您");
  });
});
