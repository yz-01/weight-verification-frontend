/**
 * Rainy Weather 雨天记录 (JB192, 客户 11-13 晚上) - `/api/site-progress/`.
 *
 * A rain record is a progress record (`PG-…`) with two photographs and its
 * start, end and minutes. The phone sends both photographs in one request
 * (`create_rain_record`, through the offline queue); the office reads the
 * records (`get_records?rain=1`), the statistics (`rain_summary`), the rules
 * (`rain_rules`, `set_rain_rules`), voids one (`void_rain_record`, signed with
 * the PIN `rain_record.void`) and fetches the month's PDF (`rain_report_pdf`).
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { SiteProgressRecord } from "@/interfaces/contractor-ops";
import { api, fetchAsFile, toastSuccess } from "@/services/api-client";

/** Every query this module reads, so a void or a rule change refreshes them all. */
export const RAIN_RECORDS_KEY = ["rain-records"] as const;

/** One day with rain in the period: its rains, minutes and records. */
export interface RainSummaryDay {
  /** `YYYY-MM-DD`, Malaysian date. */
  date: string;
  times: number;
  minutes: number;
  records: number;
}

/** One stretch of rain: overlapping records merged into one. */
export interface RainPeriodSpan {
  start: string;
  end: string;
  minutes: number;
  /** The records (their `PG-…` numbers) it was merged from. */
  records: string[];
}

/** `rain_summary`: one project's rain over a month or a date range. */
export interface RainSummary {
  project: string;
  from: string;
  to: string;
  /** 下雨次数: merged stretches that began in the period. */
  times: number;
  /** 下雨天数. */
  days: number;
  /** 总时长, in minutes. */
  minutes: number;
  /** Records not voided. */
  records: number;
  voided: number;
  /** Only days with rain, oldest first. */
  daily: RainSummaryDay[];
  periods: RainPeriodSpan[];
}

/** `rain_rules`: at most `limit` records in any `minutes` per project. */
export interface RainRules {
  limit: number;
  minutes: number;
  /** Whether this reader may change them (公司设置). */
  can_change: boolean;
}

/** The records of the rain tab: progress records that are rain records. */
export const getRainRecords = (query: ListQuery = {}): Promise<Paginated<SiteProgressRecord>> =>
  api.list<SiteProgressRecord>("/api/site-progress/get_records/", { ...query, rain: "1" });

/** One project's statistics for a month (`month`) or a range (`date_from` / `date_to`). */
export const getRainSummary = (query: {
  project: string;
  month?: string;
  date_from?: string;
  date_to?: string;
}) => api.get<RainSummary>("/api/site-progress/rain_summary/", query);

export const getRainRules = () => api.get<RainRules>("/api/site-progress/rain_rules/");

/** 【接收规则】: 1–50 records, 5–1440 minutes (the server refuses anything else). */
export async function setRainRules(rules: { limit: number; minutes: number }): Promise<RainRules> {
  const saved = await api.post<RainRules>("/api/site-progress/set_rain_rules/", {
    limit: rules.limit,
    minutes: rules.minutes,
  });
  toastSuccess("rainRecords.rules.saved");
  return saved;
}

/**
 * 【作废】: the reason is required; the server answers with the PIN dialog
 * (`rain_record.void`, 「作废雨天记录」) and the same request goes again.
 */
export async function voidRainRecord(id: string, reason: string): Promise<SiteProgressRecord> {
  const record = await api.post<SiteProgressRecord>(`/api/site-progress/${id}/void_rain_record/`, {
    reason: reason.trim(),
  });
  toastSuccess("rainRecords.void.done", { number: record.record_no ?? "" });
  return record;
}

/** The month's PDF that 预览 · 打印 · 导出 · 发送 act on. */
export const rainReportPdfFile = (project: string, month: string, lang: string) =>
  fetchAsFile("/api/site-progress/rain_report_pdf/", {
    method: "GET",
    query: { project, month, lang },
    fallbackFilename: `Rainy-Weather-${month}.pdf`,
  });

/**
 * 【提交雨天记录】 on the phone, as the offline queue sends it: both photos and
 * their moments and fixes in one form, under the server's names. A fix is
 * sent only whole. Silent: the phone says a refusal in its own words.
 */
export async function createRainRecord(payload: {
  project: string;
  client_event_id: string;
  start_captured_at: string;
  end_captured_at: string;
  start_latitude?: string;
  start_longitude?: string;
  end_latitude?: string;
  end_longitude?: string;
  device_id?: string;
  start_photo: File;
  end_photo: File;
}): Promise<SiteProgressRecord> {
  const data = new FormData();
  data.append("project", payload.project);
  data.append("client_event_id", payload.client_event_id);
  data.append("start_captured_at", payload.start_captured_at);
  data.append("end_captured_at", payload.end_captured_at);
  if (payload.start_latitude && payload.start_longitude) {
    data.append("start_latitude", payload.start_latitude);
    data.append("start_longitude", payload.start_longitude);
  }
  if (payload.end_latitude && payload.end_longitude) {
    data.append("end_latitude", payload.end_latitude);
    data.append("end_longitude", payload.end_longitude);
  }
  if (payload.device_id) data.append("device_id", payload.device_id);
  data.append("start_photo", payload.start_photo);
  data.append("end_photo", payload.end_photo);
  return api.post<SiteProgressRecord>("/api/site-progress/create_rain_record/", data, { silent: true });
}
