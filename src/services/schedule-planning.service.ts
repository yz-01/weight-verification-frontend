import type { ListQuery } from "@/interfaces/api";
import type {
  ProgressCandidate,
  ScheduleHistoryEntry,
  ScheduleImportPreview,
  ScheduleOverview,
  SchedulePlan,
  ScheduleProjectProgressPlan,
  ScheduleRevision,
  ScheduleTask,
  ScheduleTaskPayload,
  ScheduleTaskStatus,
} from "@/interfaces/schedule-planning";
import { api, download, fetchAsFile, toastSuccess } from "@/services/api-client";

export const getSchedulePlans = (query: ListQuery = {}) =>
  api.list<SchedulePlan>("/api/schedules/get_plans/", query);

/**
 * The cards' figures for one revision: the one on screen, so the cards and
 * the task list beside them describe the same schedule. Without a revision
 * the server picks the current one, then a draft.
 */
export const getScheduleOverview = (planId: string, revisionId?: string) =>
  api.get<ScheduleOverview>(
    `/api/schedules/${planId}/get_overview/`,
    revisionId ? { revision: revisionId } : undefined,
  );

export const createSchedulePlan = async (payload: {
  project: string;
  name: string;
  description: string;
  baseline_label: string;
}) => {
  const row = await api.post<{ plan: SchedulePlan; revision: ScheduleRevision }>(
    "/api/schedules/create_plan/",
    payload,
  );
  toastSuccess("schedulePlanning.toast.planCreated");
  return row;
};

/**
 * Rename a plan, or fix its description.
 *
 * Only those two - the baseline that came with the plan is a revision, and
 * revisions are edited on their own. Two plans on one site may not share a
 * name, so the API answers 409 and the error toast carries the reason.
 */
export const updateSchedulePlan = async (
  id: string,
  payload: { name?: string; description?: string },
) => {
  const row = await api.patch<SchedulePlan>(
    `/api/schedules/${id}/update_plan/`,
    payload,
  );
  toastSuccess("schedulePlanning.toast.planUpdated");
  return row;
};

export const archiveSchedulePlan = async (id: string, reason: string) => {
  const row = await api.post<SchedulePlan>(
    `/api/schedules/${id}/archive_plan/`,
    { reason },
  );
  toastSuccess("schedulePlanning.toast.planArchived");
  return row;
};

export const getScheduleRevisions = (query: ListQuery = {}) =>
  api.list<ScheduleRevision>("/api/schedule-revisions/get_revisions/", query);

export const createScheduleRevision = async (payload: {
  plan: string;
  label: string;
  reason: string;
}) => {
  const row = await api.post<ScheduleRevision>(
    "/api/schedule-revisions/create_revision/",
    payload,
  );
  toastSuccess("schedulePlanning.toast.revisionCreated");
  return row;
};

/**
 * Correct a draft revision's label or the reason it exists.
 *
 * Refused with 409 once the revision is confirmed: from that point it is the
 * schedule everyone is working to, and the reason recorded against it is part
 * of why the dates changed. The console offers the control on drafts only.
 */
export const updateScheduleRevision = async (
  id: string,
  payload: { label?: string; reason?: string },
) => {
  const row = await api.patch<ScheduleRevision>(
    `/api/schedule-revisions/${id}/update_revision/`,
    payload,
  );
  toastSuccess("schedulePlanning.toast.revisionUpdated");
  return row;
};

export const confirmScheduleRevision = async (id: string) => {
  const row = await api.post<ScheduleRevision>(
    `/api/schedule-revisions/${id}/confirm_revision/`,
    {},
  );
  toastSuccess("schedulePlanning.toast.revisionConfirmed");
  return row;
};

export const deleteScheduleRevision = async (id: string) => {
  await api.delete(`/api/schedule-revisions/${id}/delete_revision/`);
  toastSuccess("schedulePlanning.toast.revisionRemoved");
};

export const getScheduleTasks = (query: ListQuery = {}) =>
  api.list<ScheduleTask>("/api/schedule-tasks/get_tasks/", query);

export const createScheduleTask = async (payload: ScheduleTaskPayload) => {
  const row = await api.post<ScheduleTask>(
    "/api/schedule-tasks/create_task/",
    payload,
  );
  toastSuccess("schedulePlanning.toast.taskSaved");
  return row;
};

export const updateScheduleTask = async (
  id: string,
  payload: Partial<ScheduleTaskPayload>,
) => {
  const row = await api.patch<ScheduleTask>(
    `/api/schedule-tasks/${id}/update_task/`,
    payload,
  );
  toastSuccess("schedulePlanning.toast.taskSaved");
  return row;
};

export const deleteScheduleTask = async (id: string) => {
  await api.delete(`/api/schedule-tasks/${id}/delete_task/`);
  toastSuccess("schedulePlanning.toast.taskRemoved");
};

export const confirmScheduleTaskProgress = async (
  id: string,
  payload: {
    actual_progress: string;
    actual_start: string | null;
    actual_end: string | null;
    note: string;
    progress_record_ids: string[];
  },
) => {
  const row = await api.post<ScheduleTask>(
    `/api/schedule-tasks/${id}/confirm_progress/`,
    payload,
  );
  toastSuccess("schedulePlanning.toast.progressConfirmed");
  return row;
};

/**
 * 「关联现场进度」 in 确认实际进度 (JB271): a page of the project's records,
 * searched on the server - `search` (number, 施工分类, words), `phase`,
 * `date_from` / `date_to`.
 */
export const getProgressCandidates = (project: string, query: ListQuery = {}) =>
  api.list<ProgressCandidate>("/api/schedule-tasks/get_progress_candidates/", {
    ...query,
    project,
  });

/** 「附 N 条现场记录」 opened (JB273): the task's records, a page at a time. */
export const getTaskLinkedRecords = (taskId: string, query: ListQuery = {}) =>
  api.list<ProgressCandidate>(`/api/schedule-tasks/${taskId}/get_linked_records/`, query);

/** 项目进度摘要's figures, straight from the project's schedules (JB267). */
export const getProjectScheduleProgress = (project: string) =>
  api.get<{ project: string; plans: ScheduleProjectProgressPlan[] }>(
    "/api/schedules/get_project_progress/",
    { project },
  );

export const createScheduleImportPreview = async (payload: {
  project: string;
  plan?: string;
  file: File;
}) => {
  const data = new FormData();
  data.append("project", payload.project);
  if (payload.plan) data.append("plan", payload.plan);
  data.append("file", payload.file);
  const row = await api.post<ScheduleImportPreview>(
    "/api/schedule-imports/create_preview/",
    data,
  );
  toastSuccess("schedulePlanning.toast.previewReady");
  return row;
};

export const confirmScheduleImport = async (
  id: string,
  payload: {
    plan_name: string;
    revision_label: string;
    reason: string;
    mapping: Record<string, string>;
  },
) => {
  const row = await api.post<ScheduleRevision>(
    `/api/schedule-imports/${id}/confirm_import/`,
    payload,
  );
  toastSuccess("schedulePlanning.toast.imported");
  return row;
};

/** 操作记录, a page at a time (JB272: every entry is kept, none cut off). */
export const getScheduleHistory = (planId: string, query: ListQuery = {}) =>
  api.list<ScheduleHistoryEntry>(`/api/schedules/${planId}/get_history/`, {
    page_size: 50,
    ...query,
  });

/**
 * The words 施工计划's Excel / PDF are written in (JB289 二: 「四种语言」): the
 * column names, the status words and the 施工计划版本 line, from the screen's
 * catalogue. Without them the file keeps its old English headings.
 */
export interface ScheduleExportWords {
  lang: string;
  title: string;
  subtitle?: string;
  columns: Record<ScheduleExportColumn, string>;
  status: Record<ScheduleTaskStatus, string>;
}

/** The columns of 施工计划's Excel / PDF, in their order (JB289 adds the related ones). */
export const SCHEDULE_EXPORT_COLUMNS = [
  "wbs_code",
  "name",
  "parent_wbs_code",
  "planned_start",
  "planned_end",
  "duration_days",
  "planned_progress",
  "actual_progress",
  // JB289 二 (客户 11-27c): 实际完成日期、任务完成状态 ...
  "actual_completion_date",
  "schedule_status",
  "delay_days",
  // ... 顾问审批编号及审批结果、关联现场记录编号、进度确认人及确认时间 ...
  "consultant_approvals_text",
  "linked_record_nos",
  "progress_confirmed_by_name",
  "progress_confirmed_at",
  "progress_note",
  // ... 施工计划版本.
  "plan_version",
] as const;

export type ScheduleExportColumn = (typeof SCHEDULE_EXPORT_COLUMNS)[number];

const ENGLISH_COLUMNS: Record<ScheduleExportColumn, string> = {
  wbs_code: "WBS",
  name: "Task",
  parent_wbs_code: "Parent WBS",
  planned_start: "Planned Start",
  planned_end: "Planned End",
  duration_days: "Duration (days)",
  planned_progress: "Planned Progress (%)",
  actual_progress: "Actual Progress (%)",
  actual_completion_date: "Actual Completion Date",
  schedule_status: "Task Status",
  delay_days: "Delay (days)",
  consultant_approvals_text: "Consultant Approval No. and Result",
  linked_record_nos: "Linked Site Records",
  progress_confirmed_by_name: "Progress Confirmed By",
  progress_confirmed_at: "Confirmed At",
  progress_note: "Manager Note",
  plan_version: "Schedule Version",
};

/** The body of 施工计划's export request: the columns in the reader's words. */
export function scheduleExportBody(
  revisionId: string,
  format: "xlsx" | "pdf",
  options: { delayed?: boolean; words?: ScheduleExportWords } = {},
) {
  const words = options.words;
  return {
    revision: revisionId,
    format,
    ...(options.delayed ? { delayed: true } : {}),
    title: words?.title ?? "Construction Schedule",
    ...(words?.subtitle ? { subtitle: words.subtitle } : {}),
    ...(words?.lang ? { lang: words.lang } : {}),
    columns: SCHEDULE_EXPORT_COLUMNS.map((key) => ({
      key,
      label: words?.columns[key] ?? ENGLISH_COLUMNS[key],
      // 任务完成状态 in words, not codes (`utils.exports._cell`).
      ...(key === "schedule_status" && words ? { values: words.status } : {}),
    })),
  };
}

export const exportSchedule = (
  planId: string,
  revisionId: string,
  format: "xlsx" | "pdf",
  /** 「只看延误」 on (H16): the file holds only the delayed tasks, as the screen. */
  options: { delayed?: boolean; words?: ScheduleExportWords } = {},
) =>
  download(`/api/schedules/${planId}/export_schedule/`, {
    method: "POST",
    body: scheduleExportBody(revisionId, format, options),
    fallbackFilename: `construction-schedule.${format}`,
  });

/**
 * 项目进度摘要's automatic part as a PDF (JB289 三): the figures, the 对比图,
 * the 曲线图, the 甘特图 and the 相关进度资料, for 预览 · 打印 · 导出 · 发送.
 */
export const scheduleProgressReportFile = (
  planId: string,
  lang: string,
  title: string,
  revisionId?: string,
) =>
  fetchAsFile(`/api/schedules/${planId}/get_progress_report_pdf/`, {
    method: "GET",
    query: { lang, ...(revisionId ? { revision: revisionId } : {}) },
    fallbackFilename: `${(title || "progress-report").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`,
  });
