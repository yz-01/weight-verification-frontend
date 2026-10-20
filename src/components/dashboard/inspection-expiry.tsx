"use client";

/**
 * 检验报告到期 (J11-4, Q11-3): the latest inspection reports running out within
 * 30 days, or out, on the project dashboard - in the back office, telling
 * nobody. A new report ends its machine's or material's line.
 */

import { useQuery } from "@tanstack/react-query";
import { FileClock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { useDateFormat } from "@/lib/dates";
import { getExpiringInspections } from "@/services/document-workflow.service";

const SHOWN = 5;

export function InspectionExpiry({ project }: { project?: string }) {
  const t = useTranslations("documents.inspection");
  const df = useDateFormat();
  const { can } = useAuth();
  const allowed = can("document.view") || can("equipment.view");
  const rows = useQuery({
    queryKey: ["documents", "expiring-inspections", project ?? ""],
    queryFn: () => getExpiringInspections(project || undefined),
    enabled: allowed,
  });
  if (!allowed) return null;
  const items = rows.data ?? [];
  if (rows.isSuccess && items.length === 0) return null;
  return (
    <section className="surface-panel space-y-2 rounded-xl p-3" data-testid="inspection-expiry">
      <h2 className="panel-title flex items-center gap-2">
        <FileClock className="size-4" />
        {t("expiryTitle", { count: items.length })}
      </h2>
      <QueryFailedNote query={rows} what={t("expiryTitle", { count: 0 })} />
      <ul className="divide-y text-sm">
        {items.slice(0, SHOWN).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate">
              {row.target === "EQUIPMENT"
                ? row.equipment_name
                : [row.material_name, row.spec_name].filter(Boolean).join(" · ")}
              <span className="text-muted-foreground"> · {row.inspection_no}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {row.expiry === "EXPIRED"
                ? t("expired", { date: df.date(row.valid_until ?? "") })
                : t("expiring", { date: df.date(row.valid_until ?? "") })}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/documents" className="text-xs text-primary underline underline-offset-4">
        {t("openArchive")}
      </Link>
    </section>
  );
}
