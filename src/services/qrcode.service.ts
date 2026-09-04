/** QR code management service (module 7). */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  IssueQRCodePayload,
  QRCode,
  QRCodeIssue,
  QRCodeSummary,
  QRScanPayload,
  QRScanRecord,
  QRScanResult,
  QRSubjectOptions,
  QRSubjectType,
} from "@/interfaces/qrcode";
import { t } from "@/lib/i18n-runtime";
import { api, download, toastSuccess } from "@/services/api-client";

export function getQRCodes(query?: ListQuery): Promise<Paginated<QRCode>> {
  return api.list<QRCode>("/api/qr-codes/get_codes/", query);
}

export function getQRCode(id: string): Promise<QRCode> {
  return api.get<QRCode>(`/api/qr-codes/${id}/get_code/`);
}

export async function updateQRCode(
  id: string,
  payload: Partial<IssueQRCodePayload>,
): Promise<QRCode> {
  const code = await api.patch<QRCode>(
    `/api/qr-codes/${id}/update_code/`,
    payload,
  );
  toastSuccess("adminQr.toast.updated");
  return code;
}

export function getQRSummary(): Promise<QRCodeSummary> {
  return api.get<QRCodeSummary>("/api/qr-codes/get_summary/");
}

export async function issueQRCode(
  payload: IssueQRCodePayload,
): Promise<QRCodeIssue> {
  const code = await api.post<QRCodeIssue>("/api/qr-codes/issue_code/", payload);
  toastSuccess("adminQr.toast.issued");
  return code;
}

export async function setQRStatus(
  id: string,
  status: "ACTIVE" | "DISABLED" | "VOIDED",
  note = "",
): Promise<QRCode> {
  const code = await api.post<QRCode>(`/api/qr-codes/${id}/set_status/`, {
    status,
    note,
  });
  toastSuccess("adminQr.toast.statusUpdated");
  return code;
}

export async function reissueQRCode(id: string, note: string): Promise<QRCodeIssue> {
  const code = await api.post<QRCodeIssue>(`/api/qr-codes/${id}/reissue_code/`, { note });
  toastSuccess("adminQr.toast.reissued");
  return code;
}

export function getScanRecords(
  query?: ListQuery,
): Promise<Paginated<QRScanRecord>> {
  return api.list<QRScanRecord>("/api/qr-codes/get_scans/", query);
}

export function getQRAnomalies(
  query?: ListQuery,
): Promise<Paginated<QRScanRecord>> {
  return api.list<QRScanRecord>("/api/qr-codes/get_anomalies/", query);
}

export function getQRSubjectOptions(
  subjectType: QRSubjectType,
  company?: string,
): Promise<QRSubjectOptions> {
  return api.get<QRSubjectOptions>("/api/qr-codes/get_subject_options/", {
    subject_type: subjectType,
    company,
  });
}

export function scanQRCode(payload: QRScanPayload): Promise<QRScanResult> {
  return api.post<QRScanResult>("/api/qr-codes/scan/", payload);
}

export function exportQRRegister(
  kind: "codes" | "scans" | "anomalies",
  format: "pdf" | "xlsx",
  query: ListQuery = {},
): Promise<void> {
  // Written out as three whole paths rather than one path with the action
  // spliced in. Both call the same three endpoints; only this version says
  // which ones, to anything reading the source. The reachability guard reads
  // the source, so the spliced version made three working buttons look like
  // three missing screens (F-147).
  const endpoint =
    kind === "codes"
      ? "/api/qr-codes/export_codes/"
      : kind === "scans"
        ? "/api/qr-codes/export_scans/"
        : "/api/qr-codes/export_anomalies/";
  const labelKeys: Record<string, string> = {
    serial: "qrId",
    subject_type: "subjectType",
    subject_label: "subject",
    company_name: "company",
    status: "status",
    issued_on: "issuedOn",
    expires_on: "expiresOn",
    scan_count: "scanCount",
    last_scanned_at: "lastScanned",
    outcome: "outcome",
    scanned_at: "scannedAt",
    scanned_by_name: "scannedBy",
    project_name: "project",
    site_name: "site",
    location_label: "location",
    device_id: "subject",
    note: "notes",
  };
  const keys = kind === "codes"
    ? ["serial", "subject_type", "subject_label", "company_name", "status", "issued_on", "expires_on", "scan_count", "last_scanned_at"]
    : ["serial", "subject_type", "subject_label", "outcome", "scanned_at", "scanned_by_name", "company_name", "project_name", "site_name", "location_label", "device_id", "note"];
  const columns = keys.map((key) => ({
    key,
    label: t(`adminQr.field.${labelKeys[key]}`),
  }));
  return download(endpoint, {
    method: "POST",
    query,
    body: {
      format,
      title: t("adminQr.title"),
      columns,
    },
    fallbackFilename: `qr-${kind}.${format}`,
  });
}
