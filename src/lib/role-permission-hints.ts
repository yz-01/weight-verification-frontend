/**
 * What a role editor should warn about before the role is saved (I32).
 *
 * The client built 「安全经理」 with Safety view, manage and verify, and nobody
 * holding it ever appeared as a permit approver. Approving needs
 * `safety.verify` *on a project the person can see*, and seeing a project
 * starts with `project.view` - then either `project.view_all` or a place on
 * the project's team. The editor says so at the moment the box is ticked, and
 * offers to tick 查看项目 in one click.
 */

export const SAFETY_VERIFY = "safety.verify";
export const PROJECT_VIEW = "project.view";

/** `safety.verify` ticked without `project.view`. */
export function approvesPermitsWithoutSeeingProjects(codes: readonly string[]): boolean {
  const held = new Set(codes);
  return held.has(SAFETY_VERIFY) && !held.has(PROJECT_VIEW);
}

/** The same codes with `project.view` added, sorted as the matrix keeps them. */
export function withProjectView(codes: readonly string[]): string[] {
  return [...new Set([...codes, PROJECT_VIEW])].sort();
}
