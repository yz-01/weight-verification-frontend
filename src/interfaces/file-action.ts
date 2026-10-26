/** 打印 · 下载 / 导出 · 发送 / 分享 (JB27). */
export type FileActionType = "PRINT" | "DOWNLOAD" | "SEND";

export const FILE_ACTION_TYPES: readonly FileActionType[] = ["PRINT", "DOWNLOAD", "SEND"];

/** One row of 「操作记录」 - written once, never changed (JB27). */
export interface FileActionRecord {
  id: string;
  created_at: string;
  action: FileActionType;
  actor_name: string;
  actor_account: string;
  project: string | null;
  project_name: string | null;
  subject: string;
  file_name: string;
  record_kind: string;
  record_id: string;
  link: string;
  channel: string;
  report_export: string | null;
  report_file_name: string | null;
  report_type: string | null;
  report_has_file: boolean;
}
