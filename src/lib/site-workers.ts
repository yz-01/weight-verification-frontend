/**
 * 人员名单 (I20): the pieces pure enough to test.
 */

import type { SiteWorkerDocument, VisitExitState, WorkerStatus } from "@/interfaces/site-workers";
import type { StatusTone } from "@/lib/tones";
import { whatsappShareUrl } from "@/lib/driver-link";

/** J24-4: no 「定位未更新」 to filter by any more - a quiet phone keeps its last place. */
export const WORKER_STATUSES: readonly WorkerStatus[] = [
  "ON_SITE",
  "OFF_SITE",
  "NOT_STARTED",
];

/** 在场 green, 不在场 grey, 定位未更新 amber - never read as 离场. */
export function workerStatusTone(status: WorkerStatus | VisitExitState): StatusTone {
  if (status === "ON_SITE") return "positive";
  if (status === "STALE" || status === "SIGNAL_LOST") return "warning";
  return "neutral";
}

/** Which screen a refused link shows, from the backend's error code. */
export type WorkerLinkOutcome = "invalid" | "closed" | "otherDevice" | "phoneMismatch" | "failed";

export function workerLinkOutcome(code: string | null | undefined): WorkerLinkOutcome {
  if (code === "worker_link_invalid") return "invalid";
  if (code === "worker_link_closed") return "closed";
  if (code === "worker_link_other_device") return "otherDevice";
  if (code === "worker_link_phone_mismatch") return "phoneMismatch";
  return "failed";
}

/** The token as it can appear in the address, or "" when it cannot be one. */
export function workerLinkToken(value: string | null | undefined): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : "";
}

/**
 * A wa.me address opening a chat with the worker, message filled in.
 *
 * The roster keeps numbers as +60…, or +<country>… for a phone from abroad;
 * wa.me wants the digits with the country code.
 */
export function workerWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+") && digits.length >= 8 && !digits.startsWith("60")) {
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }
  return whatsappShareUrl(phone, message);
}

/** The 「其他证件」 rows worth sending: both halves filled, trimmed. */
export function cleanDocuments(rows: readonly SiteWorkerDocument[]): SiteWorkerDocument[] {
  return rows
    .map((row) => ({ name: row.name.trim(), number: row.number.trim() }))
    .filter((row) => row.name || row.number);
}

/** A row with one half filled: the form says which is missing. */
export function incompleteDocument(rows: readonly SiteWorkerDocument[]): boolean {
  return cleanDocuments(rows).some((row) => !row.name || !row.number);
}

/** 24-hour hh:mm in the phone's own time zone, for the worker's page. */
export function clockTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * How often the open page reports: the company's interval, never faster than
 * every 30 seconds (the server's own floor) nor slower than 15 minutes.
 */
export function reportIntervalMs(seconds: number | null | undefined): number {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 60_000;
  // Up to two hours: a location link reports every two hours while open (J24-2).
  return Math.min(7200, Math.max(30, value)) * 1000;
}

/**
 * The passport's three-letter country code (BGD, IDN) as the reader's
 * language names it - 「BGD · 孟加拉」. Anything else is shown as typed.
 * The countries Malaysia's foreign workers come from, and a few more.
 */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  BGD: "BD", IDN: "ID", NPL: "NP", MMR: "MM", IND: "IN", PAK: "PK", VNM: "VN",
  PHL: "PH", LKA: "LK", KHM: "KH", THA: "TH", CHN: "CN", MYS: "MY", LAO: "LA",
  UZB: "UZ", KAZ: "KZ", TKM: "TM", SGP: "SG", BRN: "BN", TWN: "TW", HKG: "HK",
  GBR: "GB", USA: "US", AUS: "AU", JPN: "JP", KOR: "KR",
};

export function nationalityLabel(value: string | null | undefined, locale: string): string {
  const code = (value ?? "").trim().toUpperCase();
  const region = ALPHA3_TO_ALPHA2[code];
  if (!region) return value ?? "";
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(region);
    return name && name !== region ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

/** The passport's expiry is before today (a date as YYYY-MM-DD). */
export function passportExpired(expiry: string | null | undefined, today = new Date()): boolean {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return false;
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return expiry < local;
}
