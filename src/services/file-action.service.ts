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
import { ApiError, type ListQuery, type Paginated } from "@/interfaces/api";
import type {
  FileActionRecord,
  FileActionType,
  FileShare,
  SendMethod,
  SendRecipient,
  ShareLink,
  SharedFileInfo,
} from "@/interfaces/file-action";
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
  /** JB64: which of the record's files went (a package's `R2` / `TRANSCRIPT`). */
  part?: string;
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
 * one, asking for the PIN itself. The row when it was written: only then may
 * the file be printed, saved or sent. A send names its recipient (JB64), and
 * its row carries the share (已打开分享窗口) the person confirms afterwards.
 */
export async function recordFileAction(
  action: FileActionType,
  details: FileActionDetails,
  grant?: string | null,
  recipient?: SendRecipient | null,
): Promise<FileActionRecord | null> {
  try {
    return await api.post<FileActionRecord>("/api/file-actions/record/", {
      ...details,
      link: linkPath(details.link),
      action,
      ...(recipient ?? {}),
      ...(grant ? { grant } : {}),
    });
  } catch {
    return null;
  }
}

/**
 * For a page printed as it stands (a QR label, a list on screen) or a file
 * opened by its address: the PIN and the log row in one call. True to go
 * ahead; always true on the phone.
 */
export function signFileAction(action: FileActionType, details: FileActionDetails): Promise<boolean> {
  if (!signsFileActions()) return Promise.resolve(true);
  return recordFileAction(action, details).then(Boolean);
}

/** 「操作记录」: the prints, downloads and sends this person may read. */
export function getFileActionRecords(query: ListQuery = {}): Promise<Paginated<FileActionRecord>> {
  return api.list("/api/file-actions/get_records/", query);
}

/** 「发送记录」 of one record (JB65): every send, newest first. */
export function getRecordShares(recordKind: string, recordId: string): Promise<FileShare[]> {
  return api.get<FileShare[]>("/api/file-actions/get_shares/", {
    record_kind: recordKind,
    record_id: recordId,
  });
}

/** 「已发送」 / 「标记为已发送」 (JB64): 已打开分享窗口 → 已确认发送. */
export function confirmFileShare(share: string): Promise<FileShare> {
  return api.post<FileShare>("/api/file-actions/confirm_share/", { share });
}

/** The people this company sent to lately (JB64), newest first. */
export function getRecentRecipients(method?: SendMethod): Promise<SendRecipient[]> {
  return api.get<SendRecipient[]>("/api/file-actions/get_recent_recipients/", method ? { method } : {});
}

/**
 * The PDF of a WhatsApp / email send, kept for the private link the message
 * carries (客户 11-08: a website cannot put a file into a WhatsApp chat). Only
 * the person who wrote the send, once: a second call answers the same link.
 */
export function attachShareFile(share: string, file: File): Promise<ShareLink> {
  const body = new FormData();
  body.append("share", share);
  body.append("file", file, file.name);
  return api.post<ShareLink>("/api/file-actions/attach_file/", body);
}

/** The recipient's page for a link token, on this site. */
export function shareLinkUrl(token: string, origin = typeof window === "undefined" ? "" : window.location.origin): string {
  return `${origin}/s/${encodeURIComponent(token)}`;
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

/** The PDF itself: a download, counted as 「对方已打开」. Only ever followed by a tap. */
export function sharedFileDownloadUrl(token: string): string {
  return `${API_BASE_URL}/api/file-shares/public/${encodeURIComponent(token)}/download/`;
}

/**
 * What `/s/<token>` shows. No session: never the office's cookies or token,
 * whatever this browser holds - the token in the address is the credential.
 * Does not count as opened.
 */
export async function getSharedFileInfo(token: string): Promise<SharedFileInfo> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/file-shares/public/${encodeURIComponent(token)}/`, {
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", 0, {}, "network_error");
  }
  let envelope: { success?: boolean; data?: SharedFileInfo; message?: string; code?: string };
  try {
    envelope = await response.json();
  } catch {
    envelope = {};
  }
  if (!response.ok || !envelope.success || !envelope.data) {
    throw new ApiError(envelope.message || "not_found", response.status, {}, envelope.code ?? "");
  }
  return envelope.data;
}
