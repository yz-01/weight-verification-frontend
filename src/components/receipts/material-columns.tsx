"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Package, Pencil, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, ListHeader } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDateFormat } from "@/lib/dates";
import { ApiError } from "@/interfaces/api";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import type { MaterialReceipt } from "@/interfaces/contractor";
import { getReceipts, refileReceipt } from "@/services/contractor.service";
import {
  getProjectCategories,
  updateProjectCategory,
} from "@/services/contractor-ops.service";

/**
 * "Not filed in any column" as a Select value.
 *
 * A Radix `SelectItem` cannot carry an empty string, and unfiled is a real
 * choice here rather than the absence of one.
 */
const UNFILED = "__unfiled__";

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
 *
 * The screen was read-only until T-162, and two endpoints had nothing calling
 * them because of it: `update_category` could always rename a column and move
 * its budget, and `refile_receipt` was written for T-156 so a delivery in the
 * wrong column could be moved. Neither had a button anywhere in the product,
 * which is why `delete_category` refused to remove a column holding
 * deliveries with the message "move those deliveries before removing it" -
 * naming an action nobody could take (F-204).
 */
export function MaterialColumns() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const [editing, setEditing] = useState<ProjectCategory | null>(null);
  const [refiling, setRefiling] = useState<MaterialReceipt | null>(null);

  const pending = useQuery({
    queryKey: ["receipts", "pending-for-me"],
    queryFn: () => getReceipts({ seen: "false", page_size: 50 }),
  });
  const columns = useQuery({
    queryKey: ["project-categories", "material-columns"],
    // The material columns, and only those. This asked for the whole category
    // tree with no filter, so it listed the site-record columns too - the
    // screen was showing the other filing scheme's columns as though
    // deliveries could be filed in them (F-200, T-161). A column marked BOTH
    // still comes back: that marker means nobody has classified it yet, and
    // hiding it here would hide whatever is filed in it.
    queryFn: () => getProjectCategories({ page_size: 200, kind: "MATERIAL" }),
  });

  const pendingRows: MaterialReceipt[] = pending.data?.results ?? [];
  const pendingCount = pending.data?.count ?? 0;
  const columnRows: ProjectCategory[] = columns.data?.results ?? [];
  const canEditColumns = can("category.manage");
  const canRefile = can("receipt.update");

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

        {pending.isError ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {t("materialColumns.pendingFailed")}
          </p>
        ) : pending.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : pendingRows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("materialColumns.pendingEmpty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y rounded-lg border">
            {pendingRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 pr-3">
                <Link
                  href={`/receipts/${row.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 transition-colors hover:bg-accent"
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
                {/* Outside the Link rather than inside it: a button nested in
                    an anchor is not reachable as its own control. */}
                {canRefile && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setRefiling(row)}
                  >
                    {t("materialColumns.fileInto")}
                  </Button>
                )}
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

        {columns.isError ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {t("materialColumns.columnsFailed")}
          </p>
        ) : columns.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : columnRows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("materialColumns.noColumns")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {columnRows.map((column) => (
              <ColumnCard
                key={column.id}
                column={column}
                onEdit={canEditColumns ? () => setEditing(column) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <EditColumnDialog column={editing} onClose={() => setEditing(null)} />
      )}
      {refiling && (
        <RefileDialog receipt={refiling} onClose={() => setRefiling(null)} />
      )}
    </div>
  );
}

function ColumnCard({
  column,
  onEdit,
}: {
  column: ProjectCategory;
  onEdit?: () => void;
}) {
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
    <article className="relative rounded-xl border bg-card shadow-sm transition-colors hover:bg-accent">
      {onEdit && (
        <Button
          size="icon-sm"
          variant="ghost"
          title={t("materialColumns.edit")}
          className="absolute right-2 top-2 z-10"
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      )}
      <Link
        href={`/receipts?category=${column.id}&seen=true`}
        className="flex flex-col gap-3 p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{column.name}</h3>
            <p className="text-xs text-muted-foreground">{column.code}</p>
          </div>
          <span
            className={`shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums ${
              onEdit ? "mr-8" : ""
            }`}
          >
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
    </article>
  );
}

/**
 * Rename a column, move its budget, and move its warning lines.
 *
 * Deliberately not a second copy of the office's category form. That one owns
 * the filing scheme - the code, the parent, who may see and who may upload -
 * and this one owns the three things a person watching a budget needs to
 * change while watching it. Nothing here touches what is filed in the column.
 *
 * Changing the budget re-evaluates the warnings server-side, because raising
 * it can put a crossed line back under the total, and crossing that line a
 * second time is a genuinely new event that deserves to be said again.
 */
function EditColumnDialog({
  column,
  onClose,
}: {
  column: ProjectCategory;
  onClose: () => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [name, setName] = useState(column.name);
  const [tracksSpend, setTracksSpend] = useState(column.tracks_spend);
  const [budget, setBudget] = useState(column.budget_amount ?? "");
  const [alerts, setAlerts] = useState(
    (column.budget_alert_percentages ?? []).join(", "),
  );
  const [error, setError] = useState("");

  /**
   * The typed percentages, or null when they cannot be read.
   *
   * Null rather than an empty list, because an empty list is a legitimate
   * answer meaning "do not warn me". Sending it for a typo like "80, ninety"
   * would turn a slip into switching the warnings off, with the form showing
   * nothing wrong.
   */
  const parsedAlerts = (() => {
    const text = alerts.trim();
    if (!text) return [];
    const parts = text.split(",").map((part) => part.trim());
    const numbers = parts.map(Number);
    if (
      numbers.some(
        (value, index) =>
          parts[index] === "" ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > 500,
      )
    ) {
      return null;
    }
    return [...new Set(numbers)].sort((a, b) => a - b);
  })();

  const save = useMutation({
    mutationFn: () =>
      updateProjectCategory(column.id, {
        name: name.trim(),
        tracks_spend: tracksSpend,
        // Null, not "", for a column that counts nothing: the field is a
        // nullable decimal and an empty string is not a number.
        budget_amount: tracksSpend && budget.trim() ? budget.trim() : null,
        budget_alert_percentages: parsedAlerts ?? [],
      }),
    onSuccess: () => {
      // Both lists: the columns themselves, and the receipt screens that show
      // a column's name beside a delivery.
      void qc.invalidateQueries({ queryKey: ["project-categories"] });
      void qc.invalidateQueries({ queryKey: ["receipts"] });
      onClose();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("materialColumns.saveFailed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("materialColumns.editTitle", { name: column.name })}
          </DialogTitle>
          <DialogDescription>{t("materialColumns.editHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("contractorOps.field.name")} required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FieldWrapper>
          <label className="flex items-center justify-between gap-4 rounded-lg border bg-card p-3">
            <span className="text-sm font-medium">
              {t("materialColumns.tracksSpend")}
            </span>
            <Switch checked={tracksSpend} onCheckedChange={setTracksSpend} />
          </label>
          {tracksSpend && (
            <>
              <FieldWrapper
                label={t("materialColumns.budgetAmount")}
                hint={t("materialColumns.budgetNone")}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper
                label={t("materialColumns.alertPercentages")}
                hint={t("materialColumns.alertHelp")}
                error={
                  parsedAlerts === null
                    ? t("materialColumns.alertInvalid")
                    : undefined
                }
              >
                <Input
                  value={alerts}
                  onChange={(event) => setAlerts(event.target.value)}
                />
              </FieldWrapper>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("contractorOps.action.cancel")}
          </Button>
          <Button
            requires={[[name.trim(), t("contractorOps.field.name")]]}
            // Not a `requires` entry: the percentages are optional - an empty
            // list means "do not warn me" - so listing them there would put a
            // required marker on a field that is not required. What is wrong
            // when this is null is that the text cannot be read as numbers,
            // and the field says so inline.
            disabledReason={
              parsedAlerts === null
                ? t("materialColumns.alertInvalid")
                : undefined
            }
            disabled={save.isPending || parsedAlerts === null}
            onClick={() => save.mutate()}
          >
            {t("contractorOps.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * File one delivery into a column, or take it back out of one.
 *
 * The column a delivery files under is not part of what the delivery *is*:
 * the photographs, the quantity, the signature, the time and the place are
 * the evidence, and none of them change here. That is why this sits next to
 * an `update_receipt` that refuses every edit.
 *
 * Only the columns of that delivery's own project are offered. Filing across
 * projects would not look like an error on the form - it would quietly put
 * one site's tonnage in another site's report - and the server refuses it for
 * the same reason.
 */
function RefileDialog({
  receipt,
  onClose,
}: {
  receipt: MaterialReceipt;
  onClose: () => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [category, setCategory] = useState(receipt.category ?? UNFILED);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const columns = useQuery({
    queryKey: ["project-categories", "refile-options", receipt.project],
    queryFn: () =>
      getProjectCategories({
        project: receipt.project,
        kind: "MATERIAL",
        is_active: true,
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
  });
  const rows = columns.data?.results ?? [];
  // A column with subcolumns is not where deliveries live - the server sends
  // the caller down to the last level, so those are not offered here either.
  const options = rows.filter(
    (row) => !rows.some((other) => other.parent === row.id),
  );

  const submit = useMutation({
    mutationFn: () =>
      refileReceipt(receipt.id, {
        category: category === UNFILED ? null : category,
        reason: note.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["receipts"] });
      // The budgets of both columns moved with the delivery, so the cards
      // have to be re-read rather than left showing the old totals.
      void qc.invalidateQueries({ queryKey: ["project-categories"] });
      onClose();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("materialColumns.saveFailed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("materialColumns.refileTitle", { receipt: receipt.receipt_no })}
          </DialogTitle>
          <DialogDescription>
            {t("materialColumns.refileHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("materialColumns.fileInto")} required>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Unfiled stays on offer: taking a delivery back out is
                    honest when nobody yet knows where it belongs, and better
                    than an arbitrary column somebody later pays against. */}
                <SelectItem value={UNFILED}>
                  {t("receipts.unfiled")}
                </SelectItem>
                {options.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {columns.isError ? (
            <p className="text-sm text-destructive">
              {t("materialColumns.columnsFailedRefile")}
            </p>
          ) : !columns.isLoading && options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("materialColumns.noMaterialColumns")}
            </p>
          ) : null}
          <FieldWrapper
            label={t("materialColumns.refileReason")}
            optional={t("common.optional")}
          >
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("contractorOps.action.cancel")}
          </Button>
          <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
            {t("materialColumns.refileConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
