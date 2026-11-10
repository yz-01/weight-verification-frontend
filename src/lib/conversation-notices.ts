import type { NotificationSummary } from "@/interfaces/platform-ops";

/**
 * Chat messages on the phone's red dot (2026-10-09).
 *
 * Lucas: 「手机端发起材料出场，后台发信息可是手机端没收到通知红点，不只是材料出场，
 * 全部聊天室如果有新的信息都应该会收到通知红点。」
 *
 * The phone's dot was its to-do number only (L1, `card=ACTION`), and a chat
 * message is news, not work - so the office could write and the phone showed
 * nothing. The dot is now the to-do number plus the threads with something
 * unread: the server keeps one waiting notice per person per thread and
 * reports them as `conversations` whatever `card` asked for. The 我的待办
 * card keeps `total` alone - it lists work, and a message is not work.
 *
 * JB153 (客户 11-10 第二批事项 2: 「什么通知都没有」): a notice the office
 * sends - news, neither work nor chat - sat in the bell's list without a dot.
 * The dot now adds the waiting notices too (`notices`, also reported whatever
 * `card` asked for); 10-29: 「红点数量必须与后台未读事项保持一致」.
 */
export function fieldBellCount(
  summary: NotificationSummary | undefined,
): { total: number; today: number; earlier: number } | undefined {
  if (!summary) return undefined;
  const conversations = summary.conversations ?? 0;
  const conversationsToday = summary.conversations_today ?? 0;
  const notices = summary.notices ?? 0;
  const noticesToday = summary.notices_today ?? 0;
  return {
    total: summary.total + conversations + notices,
    today: summary.today + conversationsToday + noticesToday,
    earlier:
      summary.earlier + (conversations - conversationsToday) + (notices - noticesToday),
  };
}

/**
 * Whether opening a conversation settled a chat notice of the reader's.
 *
 * Reading a thread clears that person's notice for it on the server, and the
 * reply says how many (`cleared_notices`); only then is the dot re-read, so a
 * chat refetched on every live event does not drag the bell along with it.
 */
export function clearedNotices(response: { cleared_notices?: number } | undefined): boolean {
  return (response?.cleared_notices ?? 0) > 0;
}
