/**
 * The invitation e-mail's words (JB242).
 *
 * The server splices in the link and ``{valid_for}`` - how long the link
 * lasts (Lucas 11-26: 7 days) - in ``language``, so the e-mail says the real
 * lifetime. ``{valid_for}`` is handed to the catalogue as itself so the
 * message keeps the placeholder for the server.
 */

import type { useTranslations } from "next-intl";

import type { EmailCopy } from "@/interfaces/auth";

type Translate = ReturnType<typeof useTranslations>;

export function inviteEmailCopy(t: Translate, language: string): EmailCopy {
  return {
    subject: t("email.invite.subject"),
    body: t("email.invite.body", { valid_for: "{valid_for}" }),
    language,
  };
}

/** 「7 天」, "7 days": how long an invitation link lasts, in the reader's words. */
export function linkValidFor(t: Translate, hours: number): string {
  return hours % 24 === 0 ? t("jb242.days", { n: hours / 24 }) : t("jb242.hours", { n: hours });
}
