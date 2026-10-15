/**
 * The field-task list's 待验收 view, for the addresses of the photo review
 * that was taken out (I17, ID38: 「整个系统没有照片审批的审批是审批事项」).
 *
 * A photo submission waiting on the office is a field task waiting for
 * acceptance, so an old bookmark or notice - `/photo-approvals`, or the MR
 * page's former `?tab=photos` - opens that view instead. Whatever else the
 * link carried (`project`, `task`, ...) is kept; `tab` belonged to the old
 * page and is dropped.
 */
export function awaitingFieldTasksAddress(search: string | URLSearchParams = ""): string {
  const params = new URLSearchParams(search);
  params.delete("tab");
  params.set("stage", "AWAITING");
  return `/field-tasks?${params.toString()}`;
}
