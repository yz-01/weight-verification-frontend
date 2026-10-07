import { redirect } from "next/navigation";

/**
 * The old 「现场资料收件箱」 address (2026-10 C1, Q2). The inbox is now the
 * 「待整理现场资料」 tab of 顾问申请; a bookmark or an earlier notification
 * still arrives, with the submission it pointed at.
 */
export default async function ConsultantFieldInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const { task } = await searchParams;
  const query = new URLSearchParams({ stage: "inbox" });
  if (task) query.set("task", task);
  redirect(`/consultant-applications?${query.toString()}`);
}
