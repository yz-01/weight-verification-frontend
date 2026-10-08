import type { CurrentUser } from "@/interfaces/auth";

/**
 * The project to open for a consultant who has exactly one (C2).
 *
 * A consultant's requests carry the project they are working on; with none
 * chosen, every consultant page is refused and 「待审批事项」 stays empty
 * although an application is waiting. Sign-in already picks one, but a
 * session that outlives it (cleared storage, a grant added later) did not, and
 * the toolbar then showed the only project as if it were selected.
 *
 * Returns the project id to select, or `null` when there is nothing to do:
 * not a consultant, already on that project, or several projects - choosing
 * between those is the consultant's call, not ours.
 */
export function consultantProjectToAutoSelect(
  user: Pick<CurrentUser, "account_type" | "consultant_projects" | "active_project"> | null | undefined,
): string | null {
  if (!user || user.account_type !== "CONSULTANT") return null;
  const current = (user.consultant_projects ?? []).filter((project) => project.is_current);
  if (current.length !== 1) return null;
  const only = current[0].project_id;
  return user.active_project?.project_id === only ? null : only;
}
