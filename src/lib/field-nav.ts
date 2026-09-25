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

/** The keys the bottom navigation renders, in the order they appear. */
export type FieldNavKey =
  | "home"
  | "attendance"
  | "records"
  | "hazards";

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
  if (tab === "attendance" || tab === "records") {
    return tab;
  }
  // `home` and `tasks`; the latter is reached from the home screen and has no
  // button of its own, so the home button stays lit while a task is open.
  return "home";
}
