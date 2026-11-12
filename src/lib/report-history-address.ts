/**
 * 「报表历史记录」 remembers itself in its address (JB183 做法 5, 客户 11-13
 * 事项 1: 「返回后保留原来的项目选择、筛选条件及列表位置」).
 *
 * The tab, the four filters, the recipient, the project chosen on the page
 * and the page number of each tab were kept only in the page's memory: a
 * trip to a record and back opened 「报表」, unfiltered, on page 1. Now they
 * are in the address (`?tab=log&operator=…&log_page=3`), written as they
 * change (replacing, not adding, history entries), so the back arrow, the
 * browser's back and a reload all come back to the same list.
 *
 * The record a row opened is in the address too (`open_kind` + `open_id`),
 * as its own history entry: the browser's back closes the window and stays
 * on the list.
 */

export type HistoryTab = "reports" | "log";

export interface HistoryAddressState {
  tab: HistoryTab;
  date: string;
  operator: string;
  action: string;
  name: string;
  recipient: string;
  /** The page's own project choice ("all" for 全部项目). */
  project: string;
  page: number;
  logPage: number;
}

/** The record window a row opened. */
export const OPEN_KIND = "open_kind";
export const OPEN_ID = "open_id";

/**
 * The page's own project choice. Not `project`: that one is the top bar's
 * (a link's `?project=` moves the top bar), and the top bar remembers itself.
 */
export const PROJECT_PARAM = "project_filter";

const TEXT_KEYS = ["date", "operator", "action", "name", "recipient"] as const;

function pageNumber(value: string | null): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 1 ? number : 1;
}

/** The page's state as the address has it; anything missing as a fresh page. */
export function readHistoryAddress(params: URLSearchParams): HistoryAddressState {
  return {
    tab: params.get("tab") === "log" ? "log" : "reports",
    date: params.get("date") ?? "",
    operator: params.get("operator") ?? "",
    action: params.get("action") ?? "",
    name: params.get("name") ?? "",
    recipient: params.get("recipient") ?? "",
    project: params.get(PROJECT_PARAM) || "all",
    page: pageNumber(params.get("page")),
    logPage: pageNumber(params.get("log_page")),
  };
}

/**
 * The query for `state`, on top of `current`: every other parameter (the
 * open record, the top bar's) is left as it is. Defaults are left out, so a
 * fresh page keeps a bare address.
 */
export function historyQuery(current: URLSearchParams, state: HistoryAddressState): string {
  const next = new URLSearchParams(current.toString());
  const put = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  put("tab", state.tab === "log" ? "log" : null);
  for (const key of TEXT_KEYS) put(key, state[key]);
  put(PROJECT_PARAM, state.project && state.project !== "all" ? state.project : null);
  put("page", state.page > 1 ? String(state.page) : null);
  put("log_page", state.logPage > 1 ? String(state.logPage) : null);
  return next.toString();
}

/** The record window open in the address, or null. */
export function openRecordIn(params: URLSearchParams): { kind: string; id: string } | null {
  const kind = params.get(OPEN_KIND);
  const id = params.get(OPEN_ID);
  return kind && id ? { kind, id } : null;
}

/** The query with the record window `kind` + `id` open. */
export function withOpenRecord(current: URLSearchParams, kind: string, id: string): string {
  const next = new URLSearchParams(current.toString());
  next.set(OPEN_KIND, kind);
  next.set(OPEN_ID, id);
  return next.toString();
}

/** The query with no record window open. */
export function withoutOpenRecord(current: URLSearchParams): string {
  const next = new URLSearchParams(current.toString());
  next.delete(OPEN_KIND);
  next.delete(OPEN_ID);
  return next.toString();
}

/**
 * Which list a scroll position belongs to: the address without the open
 * window. A different tab, filter or page is a different list, and its
 * position is not restored onto this one.
 */
export function scrollKey(pathname: string, current: URLSearchParams): string {
  const params = new URLSearchParams(withoutOpenRecord(current));
  params.sort();
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
