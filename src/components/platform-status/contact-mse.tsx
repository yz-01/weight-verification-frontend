"use client";

import { Globe, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { contactLines, type ContactLine, type PlatformContact } from "@/lib/platform-status";
import { cn } from "@/lib/utils";

const ICONS: Record<ContactLine["kind"], typeof Phone> = {
  phone: Phone,
  email: Mail,
  website: Globe,
};

/**
 * 「联系 MSE」 with MSE's own phone, email and website from 11.2.1 平台基本资料
 * (JB211, Lucas 11-16 「把它们真的做出来」; 「要站在老人家的角度去思考」: a
 * refusal says who to call, with the number to call). Blank fields are left
 * out; with none filled in, nothing is shown.
 */
export function ContactMse({
  contact,
  className,
}: {
  contact?: PlatformContact | null;
  className?: string;
}) {
  const t = useTranslations("platformStatus.contact");
  const lines = contactLines(contact);
  if (lines.length === 0) return null;
  return (
    <div data-testid="contact-mse" className={cn("space-y-1 text-sm", className)}>
      <p className="font-medium text-foreground">{t("title")}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {lines.map((line) => {
          const Icon = ICONS[line.kind];
          return (
            <li key={line.kind}>
              <a
                href={line.href}
                {...(line.kind === "website" ? { target: "_blank", rel: "noreferrer" } : {})}
                className="inline-flex min-h-10 items-center gap-1.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Icon className="size-4 shrink-0" />
                <span>{t(line.kind)}</span>
                <span className="font-medium text-foreground [overflow-wrap:anywhere]">{line.value}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
