/**
 * Which of the five bottom-navigation buttons belongs to the screen on show.
 *
 * One answer, read by all five buttons. It used to be five predicates, each
 * button deciding for itself whether it was the current one - and two of them
 * said yes at the same time. 隐患 does not open a tab of its own: it opens the
 * hazard reporting form, which lives *inside* the 拍照 tab, so `openRecord`
 * sets `tab` to `"records"` and `recordMode` to `"safety"` together. That made
 * `tab === "records"` true for 拍照 and `recordMode === "safety"` true for
 * 隐患 at the same moment, and the worker saw two lit buttons for one tap
 * (F-374).
 *
 * Deriving it once rather than adding a second `&&` to the 拍照 predicate is
 * the point of D-166: the defect is two places computing the same fact, and a
 * patched predicate only fixes today's pair. A sixth button added later would
 * have to remember to exclude every mode that borrows its tab - here it simply
 * cannot, because there is one place that decides.
 */

import type { PhoneRole } from "@/interfaces/auth";

/** The keys the bottom navigation renders, in the order they appear. */
export type FieldNavKey =
  | "home"
  | "attendance"
  | "records"
  | "hazards"
  // 沟通 and 设备操作 (JB104, 客户 11-05 事项 9).
  | "talk"
  | "operate";

/** Tabs the workspace can be on. Kept as a string so the caller owns the union. */
export type FieldNavTab = string;

export function activeFieldNav(
  tab: FieldNavTab,
  recordMode: string | null | undefined,
): FieldNavKey {
  // The hazard conversation, and the reporting form that borrows the 拍照
  // tab to render itself. Both belong to 隐患, and only to 隐患.
  if (tab === "incidents") return "hazards";
  if (recordMode === "safety") return "hazards";
  if (tab === "attendance" || tab === "records" || tab === "talk" || tab === "operate") {
    return tab;
  }
  // `home` and `tasks`; the latter is reached from the home screen and has no
  // button of its own, so the home button stays lit while a task is open.
  return "home";
}

/**
 * The bottom navigation of each phone (JB104, 客户 11-05 事项 9).
 *
 * 「现场工作人员手机端 保留原有现场工作功能，包括门岗页面及沟通功能」 - the four
 * buttons it had, and 沟通. 「设备操作人员…只保留「设备操作」和「沟通」两个页面」.
 * 「门岗…只保留「拍照」和「沟通」两个页面」. The server refuses the rest; this
 * is the screen's half of the same rule.
 */
export const FIELD_NAV: Readonly<Record<PhoneRole, readonly FieldNavKey[]>> = {
  site_staff: ["home", "attendance", "records", "hazards", "talk"],
  equipment_operator: ["operate", "talk"],
  gate_guard: ["records", "talk"],
};

/** Which phone an account gets: the full one unless the server says otherwise. */
export function phoneRoleOf(user: { phone_role?: PhoneRole | null } | null | undefined): PhoneRole {
  const role = user?.phone_role;
  return role === "equipment_operator" || role === "gate_guard" ? role : "site_staff";
}

export function fieldNavFor(role: PhoneRole): readonly FieldNavKey[] {
  return FIELD_NAV[role];
}

/**
 * The workspace tabs a phone may be on. Site staff keep every tab they had -
 * `tasks` and `incidents` open from 首页 and 隐患 - and gain `talk`; the two
 * narrow phones have their two pages and nothing a link could open besides.
 */
export function fieldTabsFor(role: PhoneRole): readonly string[] {
  if (role === "equipment_operator") return ["operate", "talk"];
  if (role === "gate_guard") return ["records", "talk"];
  return ["home", "tasks", "attendance", "records", "incidents", "talk"];
}

/** Where a phone opens, and where a tab it does not have falls back to. */
export function fieldStartTab(role: PhoneRole): string {
  return fieldTabsFor(role)[0];
}
