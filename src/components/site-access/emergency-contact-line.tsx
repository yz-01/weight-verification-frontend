"use client";

import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { QueryFailedNote } from "@/components/shared/page-primitives";
import { getEmergencyContact, type EmergencyContact } from "@/services/site-access.service";

/** The `tel:` address of a typed number: digits and a leading +, nothing else. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * 公司设置's 紧急联系人 and 紧急联系电话, read only, as one line to tap.
 *
 * The hint said 「给门岗用」 and nothing ever showed them (JB206-9, Lucas
 * 11-16 audit, F1): they are now on 紧急名单 in the office and on the guard's
 * 门岗 phone page. Nothing at all when the company left both empty.
 */
export function EmergencyContactLine() {
  const t = useTranslations("siteControl.emergencyContact");
  const contact = useQuery({
    queryKey: ["emergency-contact"],
    queryFn: getEmergencyContact,
    staleTime: 60_000,
  });
  return (
    <>
      <EmergencyContactView contact={contact.data} />
      <QueryFailedNote query={contact} what={t("what")} />
    </>
  );
}

/** The line itself, from what the server sent. */
export function EmergencyContactView({ contact }: { contact: EmergencyContact | undefined }) {
  const t = useTranslations("siteControl.emergencyContact");
  const name = contact?.name.trim() ?? "";
  const phone = contact?.phone.trim() ?? "";
  if (!name && !phone) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3"
      data-emergency-contact
    >
      <span className="text-sm text-muted-foreground">{t("label")}</span>
      {name ? <span className="font-semibold">{name}</span> : null}
      {phone ? (
        <a
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 text-base font-semibold text-primary hover:underline"
          href={telHref(phone)}
          aria-label={t("call", { phone })}
        >
          <Phone className="size-5" />
          {phone}
        </a>
      ) : null}
    </div>
  );
}
