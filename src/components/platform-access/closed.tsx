"use client";

/**
 * What an MSE screen shows where a customer has not opened its records
 * (JB220, 客户 11-18 「MSE 管理人员……是否必须经过客户授权，才能进入客户后台查看
 * 其内部业务资料？」).
 *
 * A mixed list answers MSE with the customer's fields `null` and the row
 * flagged `platform_closed` (contract §3). Left to the cells, `null` reads as
 * 「—」 - missing data, or a bug. So the cell says 「客户未开放」, and one line
 * above the table says why and whom to ask. Tenant rows never carry the flag,
 * so a customer's own screens are untouched.
 */

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Whether a row came back with the customer's fields withheld. */
export function isPlatformClosed(row: unknown): boolean {
  return typeof row === "object" && row !== null && (row as { platform_closed?: unknown }).platform_closed === true;
}

/** Whether any row on the page was withheld: then the note line shows. */
export function anyPlatformClosed(rows: readonly unknown[] | null | undefined): boolean {
  return (rows ?? []).some(isPlatformClosed);
}

/** 「客户未开放」 in a cell: a quiet lock, never a dash that reads as missing. */
export function PlatformClosedCell({ className }: { className?: string }) {
  const t = useTranslations("mseAccess.closed");
  return (
    <span
      data-platform-closed
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Lock className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 break-words [word-break:keep-all]">{t("cell")}</span>
    </span>
  );
}

/**
 * For a field that takes a value rather than children (`ReadField`): the
 * value, or the 「客户未开放」 cell when this row's customer withheld it.
 */
export function closedValue<T>(row: unknown, value: T): T | ReactNode {
  const missing = value === null || value === undefined || value === "";
  return missing && isPlatformClosed(row) ? <PlatformClosedCell /> : value;
}

/**
 * The value, or 「客户未开放」 when this row's customer withheld it. A value
 * that is simply empty on an open row stays whatever the screen shows for
 * empty (`empty`).
 */
export function ClosedOr({
  row,
  value,
  empty = null,
}: {
  row: unknown;
  value: ReactNode;
  empty?: ReactNode;
}) {
  const missing = value === null || value === undefined || value === "";
  if (missing && isPlatformClosed(row)) return <PlatformClosedCell />;
  return <>{missing ? empty : value}</>;
}

/**
 * One line above a table: 「客户没有开放查看的资料，这里只显示数量和状态……」
 * when a row on it was withheld, or - for a list that leaves closed
 * customers' rows out instead (审计日志, 报表导出历史) - `hidden`.
 */
export function PlatformClosedNote({
  rows,
  hidden = false,
  className,
}: {
  rows?: readonly unknown[] | null;
  /** Rows were left out (the server said `hidden_customer_rows`). */
  hidden?: boolean;
  className?: string;
}) {
  const t = useTranslations("mseAccess.closed");
  const masked = anyPlatformClosed(rows);
  if (!masked && !hidden) return null;
  return (
    <p
      data-platform-closed-note
      className={cn(
        "flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-foreground",
        className,
      )}
    >
      <Lock className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">{t(masked ? "note" : "hiddenRows")}</span>
    </p>
  );
}

/**
 * A reason said on the page, beside greyed buttons that wait for the customer
 * - the tooltip alone is never seen on a phone, and easily missed on a desk.
 */
export function PlatformReasonLine({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <p
      data-platform-reason
      className={cn(
        "flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-foreground",
        className,
      )}
    >
      <Lock className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">{text}</span>
    </p>
  );
}

/**
 * Under MSE's dashboard map: how many customer sites were left off it because
 * their customer has not opened 「允许 MSE 查看」 (PO-1 = A). Nothing when none.
 */
export function PlatformHiddenPins({ count, className }: { count: number | null | undefined; className?: string }) {
  const t = useTranslations("mseAccess.closed");
  if (!count) return null;
  return (
    <p data-platform-hidden-pins className={cn("flex items-start gap-2 text-xs text-muted-foreground", className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{t("mapPins", { count })}</span>
    </p>
  );
}

/** The closed-door sentence where a record's photos, attachments and PDF would be. */
export function PlatformClosedPhotos({ className }: { className?: string }) {
  const t = useTranslations("mseAccess.closed");
  return (
    <p
      role="note"
      data-platform-closed-photos
      className={cn(
        "flex items-start gap-2 rounded-lg border border-dashed border-panel-border bg-muted/40 px-3 py-3 text-sm leading-6 text-muted-foreground",
        className,
      )}
    >
      <Lock className="mt-1 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{t("photos")}</span>
    </p>
  );
}
