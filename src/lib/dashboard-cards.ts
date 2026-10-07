/**
 * The project dashboard's six small cards (B8, F6; Q6, Q20) and the list each
 * one opens.
 *
 * The client: 「点卡到对应列表，数字和列表条数一致」. So each card's link
 * carries exactly the filter its number was counted with - the backend test
 * `contractor_ops.tests.test_dashboard_cards` calls every list with these
 * same parameters and compares the counts.
 */
export type DashboardCard =
  | "waiting"
  | "approvals"
  | "rectifications"
  | "receipts"
  | "attendance"
  | "safety";

/** Left to right, top to bottom on a phone (2 × 3). */
export const DASHBOARD_CARDS: readonly DashboardCard[] = [
  "waiting",
  "approvals",
  "rectifications",
  "receipts",
  "attendance",
  "safety",
];

export interface CardScope {
  /** The dashboard's project, or empty for every project. */
  project?: string;
  /** The day the dashboard counted "today" by (`ContractorDashboard.date`). */
  date: string;
}

function withQuery(path: string, params: Record<string, string | undefined>, hash = "") {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return `${path}${text ? `?${text}` : ""}${hash}`;
}

/** The full list a card opens, filtered the way its number was counted. */
export function cardListHref(card: DashboardCard, { project, date }: CardScope): string {
  const day = { date_from: date, date_to: date };
  switch (card) {
    case "waiting":
      // What waits for this reader's 【确认】 (X10), in the record centre.
      return withQuery("/archive-queue", { waiting: "1", project });
    case "approvals":
      // 总部集中审批 (C16), the one list of every waiting decision.
      return approvalsListHref(project);
    case "rectifications":
      // The items this reader moves on next: assign, rectify or confirm.
      return withQuery("/hazard-rectifications", { waiting: "me", project });
    case "receipts":
      // Material In for the day (the list's default view).
      return withQuery("/receipts", { ...day, project });
    case "attendance":
      return withQuery("/attendance", { ...day, project });
    case "safety":
      return withQuery("/hazard-rectifications", { ...day, project });
  }
}

/**
 * 总部集中审批 on the 公司总部 page, opened on its tab and narrowed to one
 * project when one is given. Not `?project=`: on `/dashboard` that address
 * forwards to the project dashboard (`legacyDashboardTarget`).
 */
export function approvalsListHref(project?: string): string {
  return withQuery(
    "/dashboard",
    { work: "approvals", work_project: project },
    "#headquarters-work",
  );
}

/**
 * One clock-in or clock-out from the 今日进出打卡 pop-up: the attendance list
 * of that person on that day, where the record and its selfie are. A clock
 * event has no page of its own.
 */
export function attendanceRecordHref(input: {
  user: string;
  date: string;
  project?: string;
}): string {
  return withQuery("/attendance", {
    date_from: input.date,
    date_to: input.date,
    user: input.user,
    project: input.project,
  });
}
