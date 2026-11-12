"use client";

/**
 * The consultant module's settings, in one place (T-373).
 *
 * Three of the module's eight menu entries were settings - workflows,
 * templates, consultant access - sitting beside the two pages people actually
 * work in, which is a large part of why the module read as unusable. They now
 * live behind this one entry, each with a sentence saying whether it has to
 * be done at all. The pages themselves are unchanged and still reachable.
 *
 * JB176: for a project user the 顾问账号授权 card says it is head office's to
 * set (「由总部设置」) - only head office opens a project to a consultant
 * (Lucas 11-12) - and that the page shows what is open on his projects.
 */

import { ChevronRight, FileStack, Route, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader } from "@/components/shared/page-primitives";
import { setsUpConsultants } from "@/lib/consultant-access";

const ENTRIES = [
  { key: "access", href: "/consultant-access", icon: UserCheck },
  { key: "workflows", href: "/consultant-workflows", icon: Route },
  { key: "templates", href: "/consultant-templates", icon: FileStack },
] as const;

export function ConsultantSettingsHub() {
  const t = useTranslations("consultantWorkflow.settingsHub");
  const { can } = useAuth();
  const projectUser = !setsUpConsultants(can);
  return (
    <div className="space-y-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <ul className="grid gap-3 md:grid-cols-3">
        {ENTRIES.map(({ key, href, icon: Icon }) => {
          const headOfficeOnly = key === "access" && projectUser;
          return (
            <li key={key}>
              <Link
                href={href}
                className="flex h-full flex-col gap-2 surface-panel rounded-xl p-4 transition hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Icon className="size-4 text-primary" />
                  {t(`${key}.title`)}
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                </span>
                <span className="text-xs font-medium text-primary">
                  {headOfficeOnly ? t("access.needProject") : t(`${key}.need`)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {headOfficeOnly ? t("access.bodyProject") : t(`${key}.body`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
