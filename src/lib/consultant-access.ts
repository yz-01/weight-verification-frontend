/**
 * Who sets up consultants: head office (JB176).
 *
 * Lucas 11-12: 「只有总部给顾问开通项目」 - the client's own 11-09 rule that the
 * A group (用户管理, 项目分配) stays with head office. 「顾问账号与项目授权」
 * reads and writes with exactly those permissions (`user.view`,
 * `user.create`, `project.assign`), while the page itself opens with
 * `consultant.config`, which every project manager has. An account holding
 * none of the three saw three empty tabs and no button; it now gets the
 * read-only page instead. Anyone holding one of them keeps the page as it was.
 */
export function setsUpConsultants(can: (code: string) => boolean): boolean {
  return can("user.view") || can("user.create") || can("project.assign");
}
