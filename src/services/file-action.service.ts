/**
 * 打印 / 下载 / 发送 with the person's own six-digit PIN, every time, and a
 * permanent log row for each (JB27, 客户 10-26 事项 3).
 *
 * The client: 「整个电脑 Web 后台，所有业务事项执行以下操作时，必须验证本人六位数
 * 密码：打印、下载 / 导出、发送 / 分享 · 正常查看、预览资料不需要密码」「每次操作
 * 自动记录」「仅针对电脑 Web 后台，手机 H5/PWA 端不需要增加」.
 *
 * The shared file buttons (`components/shared/file-actions.tsx`) call these
 * before they print, save or send - so the PIN dialog comes first, and
 * closing it does nothing. The PIN itself is asked by the shared dialog the
 * API client opens on `sign_off_pin_required` (`lib/sign-off`).
 */
import type { ListQuery, Paginated } from "@/interfaces/api";
import type { FileActionRecord, FileActionType } from "@/interfaces/file-action";
import { isDriverSessionContext, isFieldSessionContext } from "@/lib/auth-token";
import { api } from "@/services/api-client";

/** What the log row names, beside who and when (the server knows those). */
export interface FileActionDetails {
  /** The business item: a record's reference, a list's or report's title. */
  subject?: string;
  file_name?: string;
  project?: string;
  record_kind?: string;
  record_id?: string;
  /** The 「报表导出历史」 row the file is. */
  report_export?: string;
  /** Where it opens in the back office; an address on this site is kept as its path. */
  link?: string;
  channel?: string;
}

/**
 * Whether this session signs for its prints, downloads and sends: the desktop
 * back office. The phone (现场 PWA) and the driver's app do not - their
 * buttons behave exactly as before.
 */
export function signsFileActions(): boolean {
  return !isFieldSessionContext() && !isDriverSessionContext();
}

/** An address on this site as its path; anything else is left out. */
export function linkPath(link: string | undefined): string | undefined {
  if (!link) return undefined;
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  if (typeof window === "undefined") return undefined;
  try {
    const url = new URL(link);
    if (url.origin !== window.location.origin) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

/**
 * The PIN for one print / download / send: a grant to fetch the file and
 * write its log row with, or null when the dialog was closed or the server
 * refused (already said in a toast).
 */
export async function authorizeFileAction(action: FileActionType): Promise<string | null> {
  try {
    const data = await api.post<{ grant: string }>("/api/file-actions/authorize/", { action });
    return data.grant || null;
  } catch {
    return null;
  }
}

/**
 * Write the log row - with the grant `authorizeFileAction` gave, or, without
 * one, asking for the PIN itself. True when it was written: only then may
 * the file be printed, saved or sent.
 */
export async function recordFileAction(
  action: FileActionType,
  details: FileActionDetails,
  grant?: string | null,
): Promise<boolean> {
  try {
    await api.post("/api/file-actions/record/", {
      ...details,
      link: linkPath(details.link),
      action,
      ...(grant ? { grant } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * For a page printed as it stands (a QR label, a list on screen) or a file
 * opened by its address: the PIN and the log row in one call. True to go
 * ahead; always true on the phone.
 */
export function signFileAction(action: FileActionType, details: FileActionDetails): Promise<boolean> {
  if (!signsFileActions()) return Promise.resolve(true);
  return recordFileAction(action, details);
}

/** 「操作记录」: the prints, downloads and sends this person may read. */
export function getFileActionRecords(query: ListQuery = {}): Promise<Paginated<FileActionRecord>> {
  return api.list("/api/file-actions/get_records/", query);
}
