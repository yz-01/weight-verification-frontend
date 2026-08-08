import type { ListQuery } from "@/interfaces/api";
import type {
  ProgressCandidate,
  ScheduleHistoryEntry,
  ScheduleImportPreview,
  ScheduleOverview,
  SchedulePlan,
  ScheduleRevision,
  ScheduleTask,
  ScheduleTaskPayload,
} from "@/interfaces/schedule-planning";
import { api, download, toastSuccess } from "@/services/api-client";

export const getSchedulePlans = (query: ListQuery = {}) =>
  api.list<SchedulePlan>("/api/schedules/get_plans/", query);

export const getScheduleOverview = (planId: string) =>
  api.get<ScheduleOverview>(`/api/schedules/${planId}/get_overview/`);

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

export const getProgressCandidates = (project: string) =>
  api.get<{ results: ProgressCandidate[]; count: number }>(
    "/api/schedule-tasks/get_progress_candidates/",
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

export const getScheduleHistory = (planId: string) =>
  api.list<ScheduleHistoryEntry>(
    `/api/schedules/${planId}/get_history/`,
    { page_size: 200 },
  );

export const exportSchedule = (
  planId: string,
  revisionId: string,
  format: "xlsx" | "pdf",
) =>
  download(`/api/schedules/${planId}/export_schedule/`, {
    method: "POST",
    body: {
      revision: revisionId,
      format,
      title: "Construction Schedule",
      columns: [
        { key: "wbs_code", label: "WBS" },
        { key: "name", label: "Task" },
        { key: "parent_wbs_code", label: "Parent WBS" },
        { key: "planned_start", label: "Planned Start" },
        { key: "planned_end", label: "Planned End" },
        { key: "duration_days", label: "Duration (days)" },
        { key: "planned_progress", label: "Planned Progress (%)" },
        { key: "actual_progress", label: "Actual Progress (%)" },
        { key: "delay_days", label: "Delay (days)" },
        { key: "progress_note", label: "Manager Note" },
      ],
    },
    fallbackFilename: `construction-schedule.${format}`,
  });
