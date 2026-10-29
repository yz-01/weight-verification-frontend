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
export const ARCHIVE_LOCKS_CHANGES = false;
