/**
 * Whether 确认归档 stops a record from being changed - the server's
 * `core.models.ARCHIVE_LOCKS_CHANGES`, kept in step by hand.
 *
 * Lucas 10-30 evening: 「全部事项归档后都可以修改，不只是补空白……这个系统的
 * 归档后的事项都可以修改，只是不能聊天而已」. So it does not: an archived
 * record keeps its 修改 / 上传 / 改正 buttons; its conversation closes and it
 * can no longer be deleted. Every screen that hid an edit on archiving reads
 * this one constant.
 */
import { useQuery } from "@tanstack/react-query";

import { getProject } from "@/services/contractor.service";

export const ARCHIVE_LOCKS_CHANGES = false;

/**
 * Whether an archived record of `project` takes only blanks filled in.
 *
 * JB214-3d (Lucas 11-16 「把它们真的做出来」, Q1 = A 「按项目锁」): MSE can turn
 * 「归档后锁定记录」 on for one project - the client, 11-05 事项 2: 「涉及正式
 * 业务记录完整性，不能让客户随意关闭」. That project's archived records then
 * follow the 10-30 afternoon rule; every other project keeps Lucas's 10-30
 * evening rule above. The server decides (`record_closure.archive_locks_changes`)
 * and refuses a change whatever a screen shows; this only keeps a screen from
 * offering one. While the project is still being read it answers as before.
 */
export function useArchiveLocksChanges(project: string | null | undefined): boolean {
  // query-failure: the server refuses a locked change whatever the screen shows; unread, the buttons stay as before (10-30).
  const detail = useQuery({
    queryKey: ["projects", "detail", project],
    queryFn: () => getProject(project as string),
    enabled: Boolean(project) && !ARCHIVE_LOCKS_CHANGES,
    staleTime: 60_000,
  });
  return ARCHIVE_LOCKS_CHANGES || detail.data?.archive_locked === true;
}
