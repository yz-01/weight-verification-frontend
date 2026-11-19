/**
 * MSE 查看权限 (JB220): the customer opens and closes MSE's look into its
 * business records and accounts; MSE asks for it; both read 「MSE 查看记录」.
 */
import type { Paginated } from "@/interfaces/api";
import type {
  PlatformAccessKind,
  PlatformAccessRecord,
  PlatformAccessRecordQuery,
  PlatformAccessStatus,
} from "@/interfaces/platform-access";
import { api, toastRefusal, toastSuccess } from "@/services/api-client";

const BASE = "/api/platform-access";

/** The customer's own status; MSE names the company. */
export function getPlatformAccessStatus(company?: string): Promise<PlatformAccessStatus> {
  return api.get<PlatformAccessStatus>(`${BASE}/get_status/`, company ? { company } : undefined);
}

/**
 * Open 「允许 MSE 查看」 / 「允许 MSE 管理账号」 for `hours`. The server asks for
 * the sign-off PIN (`platform_access.open`); the shared dialog answers it and
 * the request goes again. `untilWords` words the new closing time for the toast.
 */
export async function openPlatformAccess(
  body: { kind: PlatformAccessKind; hours: number; reason: string },
  untilWords: (iso: string | null) => string,
): Promise<PlatformAccessStatus> {
  const status = await api.post<PlatformAccessStatus>(`${BASE}/open_access/`, {
    kind: body.kind,
    hours: body.hours,
    reason: body.reason.trim(),
  });
  const window = body.kind === "VIEW_RECORDS" ? status.view : status.accounts;
  toastSuccess(body.kind === "VIEW_RECORDS" ? "mseAccess.toast.openedView" : "mseAccess.toast.openedAccounts", {
    until: untilWords(window.until),
  });
  return status;
}

/** 「马上关闭」: no PIN, closing only makes the company safer. */
export async function closePlatformAccess(kind: PlatformAccessKind): Promise<PlatformAccessStatus> {
  const status = await api.post<PlatformAccessStatus>(`${BASE}/close_access/`, { kind });
  toastSuccess(kind === "VIEW_RECORDS" ? "mseAccess.toast.closedView" : "mseAccess.toast.closedAccounts");
  return status;
}

/** MSE: 「请客户开放查看」 / 「请客户开放账号管理」 - a notice to the customer's 公司管理员. */
export async function requestPlatformAccess(
  body: { company: string; kind: PlatformAccessKind; reason: string },
  /** `silent`: the dialog says the refusal (once an hour) where the person is looking. */
  options: { silent?: boolean } = {},
): Promise<{ notified: number }> {
  const result = await api.post<{ notified: number }>(
    `${BASE}/request_access/`,
    { company: body.company, kind: body.kind, reason: body.reason.trim() },
    options,
  );
  if (result.notified > 0) toastSuccess("mseAccess.toast.requested");
  // Nobody to tell is not a success: said as what to do instead.
  else toastRefusal("mseAccess.toast.requestedNone");
  return result;
}

/** 「MSE 查看记录」, newest first. The customer's own; MSE names the company. */
export function getPlatformAccessRecords(query: PlatformAccessRecordQuery): Promise<Paginated<PlatformAccessRecord>> {
  return api.list<PlatformAccessRecord>(`${BASE}/get_records/`, { ...query });
}
