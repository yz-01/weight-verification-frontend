"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Database,
  FileLock2,
  History,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuditLogs } from "@/components/audit/audit-logs";
import { LoginRecords } from "@/components/audit/login-records";
import { ListHeader } from "@/components/shared/page-primitives";
import { useDateFormat } from "@/lib/dates";
import { getAuditSummary } from "@/services/audit.service";

export type AuditCenterSection =
  | "overview"
  | "login"
  | "search"
  | "immutable";

const SUBMODULES: Array<{
  section: Exclude<AuditCenterSection, "overview">;
  number: string;
}> = [
  { section: "login", number: "12.2.7" },
  { section: "search", number: "12.2.8" },
  { section: "immutable", number: "12.2.10" },
];

export function AuditCenterWorkspace({
  section = "overview",
}: {
  section?: AuditCenterSection;
}) {
  const t = useTranslations("adminAuditCenter");
  if (section === "login") return <LoginRecords />;
  if (section === "immutable") return <ImmutableAuditStatus />;
  if (section !== "overview") {
    return (
      <AuditLogs
        advanced
        showExport
        title={t(`section.${section}.title`)}
        subtitle={t(`section.${section}.subtitle`)}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {SUBMODULES.map((module) => (
            <Link
              key={module.section}
              href={`/audit-logs/${module.section}`}
              className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0 flex-1 font-medium">
                {t(`section.${module.section}.title`)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImmutableAuditStatus() {
  const t = useTranslations("adminAuditCenter");
  const df = useDateFormat();
  const summary = useQuery({
    queryKey: ["audit-logs", "summary"],
    queryFn: getAuditSummary,
  });
  const data = summary.data;
  const metrics = [
    {
      key: "total",
      icon: Database,
      value: data?.total ?? 0,
    },
    {
      key: "retention",
      icon: ShieldCheck,
      value: t("immutableStatus.permanent"),
    },
    {
      key: "updates",
      icon: FileLock2,
      value: t("immutableStatus.blocked"),
    },
    {
      key: "deletes",
      icon: FileLock2,
      value: t("immutableStatus.blocked"),
    },
  ] as const;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("section.immutable.title")}
        subtitle={t("section.immutable.subtitle")}
      />
      <div className="grid border-l border-t bg-card sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ key, icon: Icon, value }) => (
          <div key={key} className="min-h-28 border-b border-r p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="size-4" />
              {t(`immutableStatus.${key}`)}
            </div>
            <p className="mt-4 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid border-l border-t bg-card sm:grid-cols-2">
        <div className="min-h-24 border-b border-r p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="size-4" />
            {t("immutableStatus.oldest")}
          </p>
          <p className="mt-3 text-sm font-semibold tabular-nums">
            {data?.oldest_entry_at
              ? df.precise(data.oldest_entry_at)
              : t("immutableStatus.empty")}
          </p>
        </div>
        <div className="min-h-24 border-b border-r p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="size-4" />
            {t("immutableStatus.newest")}
          </p>
          <p className="mt-3 text-sm font-semibold tabular-nums">
            {data?.newest_entry_at
              ? df.precise(data.newest_entry_at)
              : t("immutableStatus.empty")}
          </p>
        </div>
      </div>
    </div>
  );
}
