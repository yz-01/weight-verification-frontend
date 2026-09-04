"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Package, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { ListHeader } from "@/components/shared/page-primitives";
import { useDateFormat } from "@/lib/dates";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import type { MaterialReceipt } from "@/interfaces/contractor";
import { getReceipts } from "@/services/contractor.service";
import { getProjectCategories } from "@/services/contractor-ops.service";

/**
 * The material columns, as this reader sees them.
 *
 * Two zones, and both are answers about the person looking. Everything that
 * has arrived waits in the pending pile until *they* have read it; only then
 * does it file into its column, and only for them. Head office reading a
 * delivery archives it for head office and leaves it sitting in the project
 * manager's pile, so the same delivery is genuinely in two different places
 * depending on who is looking (user, 2026-09-04).
 *
 * That is why nothing here is a shared count. A single "12 waiting" would be
 * the one number that makes the whole design collapse back into a shared
 * inbox where whoever opens it first clears it for everybody.
 */
export function MaterialColumns() {
  const t = useTranslations();
  const df = useDateFormat();

  const pending = useQuery({
    queryKey: ["receipts", "pending-for-me"],
    queryFn: () => getReceipts({ seen: "false", page_size: 50 }),
  });
  const columns = useQuery({
    queryKey: ["project-categories", "material-columns"],
    queryFn: () => getProjectCategories({ page_size: 200 }),
  });

  const pendingRows: MaterialReceipt[] = pending.data?.results ?? [];
  const pendingCount = pending.data?.count ?? 0;
  const columnRows: ProjectCategory[] = columns.data?.results ?? [];

  return (
    <div className="flex flex-col gap-6 pb-10">
      <ListHeader
        title={t("materialColumns.title")}
        subtitle={t("materialColumns.subtitle")}
      />

      {/* Zone 1 - everything this reader still owes a look. */}
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <header className="flex items-center gap-2">
          <Inbox className="size-5 text-primary" />
          <h2 className="font-semibold">
            {t("materialColumns.pending", { count: pendingCount })}
          </h2>
        </header>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("materialColumns.pendingHelp")}
        </p>

        {pending.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : pendingRows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("materialColumns.pendingEmpty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y rounded-lg border">
            {pendingRows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/receipts/${row.id}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-accent"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {row.material_name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.receipt_no} · {row.supplier_name} ·{" "}
                      {/* Where it will file once they have read it, so the
                          pending pile is not an unsorted mystery. */}
                      {row.category_name ?? t("receipts.unfiled")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <span className="block">{df.date(row.captured_at)}</span>
                    <span className="block">
                      {row.quantity} {row.unit}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pendingCount > pendingRows.length && (
          <Link
            href="/receipts?seen=false"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            {t("materialColumns.seeAllPending", { count: pendingCount })}
          </Link>
        )}
      </section>

      {/* Zone 2 - what this reader has already filed away, by column. */}
      <section>
        <header className="flex items-center gap-2">
          <Package className="size-5 text-muted-foreground" />
          <h2 className="font-semibold">{t("materialColumns.archived")}</h2>
        </header>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("materialColumns.archivedHelp")}
        </p>

        {columns.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : columnRows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("materialColumns.noColumns")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {columnRows.map((column) => (
              <ColumnCard key={column.id} column={column} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ColumnCard({ column }: { column: ProjectCategory }) {
  const t = useTranslations();
  const percent = column.budget_used_percent;
  // Over budget is its own state, not "100% and a bit". The bar stops at full
  // so the number, not the bar, is what says how far past it went.
  const barWidth = percent === null ? 0 : Math.min(percent, 100);
  const tone =
    percent === null
      ? "bg-muted-foreground/30"
      : percent >= 100
        ? "bg-destructive"
        : percent >= 80
          ? "bg-warning"
          : "bg-primary";

  return (
    <Link
      href={`/receipts?category=${column.id}&seen=true`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{column.name}</h3>
          <p className="text-xs text-muted-foreground">{column.code}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
          {t("materialColumns.filed", { count: column.archived_deliveries ?? 0 })}
        </span>
      </div>

      {column.tracks_spend && column.budget_amount ? (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium tabular-nums">
              <Wallet className="size-3.5 text-muted-foreground" />
              RM {column.spend_amount}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              / RM {column.budget_amount}
              {percent !== null && ` · ${percent}%`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${tone}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("materialColumns.noBudget")}
        </p>
      )}

      {/* Weight is shown because it was asked for, never used to decide an
          alert - a budget on this platform is money. */}
      <p className="text-xs text-muted-foreground">
        {t("materialColumns.tonnes", { tonnes: column.tonnes_received ?? "0" })}
      </p>

      {(column.spend_uncounted_deliveries ?? 0) > 0 && (
        // Said out loud, because a total that quietly skipped these reads as
        // under budget exactly when the paperwork could not be read.
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t("materialColumns.uncounted", {
            count: column.spend_uncounted_deliveries ?? 0,
          })}
        </p>
      )}
    </Link>
  );
}
