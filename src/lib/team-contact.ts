/**
 * How a person on a project's team is reached: a phone account by its number -
 * its email is an internal placeholder (field+…@mse.invalid) - anyone else by
 * email. Shared by 「项目人员名单」 and 发送项目通知's recipient list, which
 * showed the placeholders (JB159).
 */
export function contactOf(assignment: { is_field_staff: boolean; user_phone?: string; user_email: string }) {
  if (assignment.is_field_staff || isPlaceholderEmail(assignment.user_email)) {
    return assignment.user_phone || "";
  }
  return assignment.user_email;
}

/** The address a phone account is made with (`field+<hex>@mse.invalid`); nobody reads mail there. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return /^field\+[^@]*@mse\.invalid$/i.test(email ?? "");
}

/**
 * Who 发送项目通知 may pick (JB164, screens 11-10): an invited account has not
 * been activated, so it cannot read a notice yet - it is left out. Deleted
 * accounts never come from the server. Rows without a status (an older
 * server) are all kept.
 */
export function noticeRecipients<T extends { user_status?: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.user_status !== "INVITED");
}
