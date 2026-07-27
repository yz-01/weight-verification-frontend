"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  Camera,
  Info,
  Plus,
  RotateCcw,
  ScrollText,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  Deduction,
  DeductionDecision,
  DeductionState,
} from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { getDeductions, respondToDeduction } from "@/services/recycler.service";

const STATE_TONE: Record<
  DeductionState,
  "positive" | "warning" | "danger" | "info" | "neutral"
> = {
  AUTO_ACCEPTED: "neutral",
  PENDING: "warning",
  ACCEPTED: "positive",
  REJECTED: "danger",
  RECHECK: "info",
};

/**
 * One screen for both sides of the same argument.
 *
 * A recycler comes here to see what it has claimed; a producer comes here to
 * answer. Splitting it into two screens would mean two lists of the same rows
 * that could drift, and would hide the thing worth seeing — that a claim has
 * two ends and one of them is waiting.
 *
 * Which side you are on decides what you can do, and the backend decides that,
 * not this file. The Answer button appears when the record says the claim is
 * still open and the account holds the approval permission; if that is ever
 * wrong, the request is refused rather than the wrong thing happening.
 */
export function Deductions() {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["state", "kind", "awaiting_me"]);
  const [answering, setAnswering] = useState<Deduction | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["deductions", list.query],
    queryFn: () => getDeductions(list.query),
  });

  const columns = useMemo<ColumnDef<Deduction, unknown>[]>(
    () => [
      {
        accessorKey: "dispatch_no",
        meta: { label: t("deductions.field.dispatchNo") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("deductions.field.dispatchNo")}
          </span>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular font-medium text-foreground">
              {row.original.dispatch_no}
            </p>
            <p className="max-w-[200px] truncate text-xs text-muted-foreground">
              {row.original.project_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "state",
        meta: { label: t("deductions.field.state") },
        header: ({ column }) => (
          <SortableHeader
            label={t("deductions.field.state")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`deductions.state.${row.original.state}`)}
            tone={STATE_TONE[row.original.state]}
          />
        ),
      },
      {
        accessorKey: "kind",
        meta: { label: t("deductions.field.kind") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("deductions.field.kind")}
          </span>
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`deductions.kind.${row.original.kind}`)} />
        ),
      },
      {
        accessorKey: "weight_kg",
        meta: { label: t("deductions.field.weightKg") },
        header: ({ column }) => (
          <SortableHeader
            label={t("deductions.field.weightKg")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular font-medium text-foreground">
            {row.original.weight_kg}
          </span>
        ),
      },
      {
        accessorKey: "reason",
        meta: { label: t("deductions.field.reason") },
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("deductions.field.reason")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[280px] truncate"
            title={row.original.reason}
          >
            {row.original.reason}
          </span>
        ),
      },
      {
        accessorKey: "inspected_at",
        meta: { label: t("deductions.field.inspectedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("deductions.field.inspectedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="tabular text-muted-foreground">
              {df.date(row.original.inspected_at)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.inspected_by_name}
            </p>
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {row.original.photos.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title={t("deductions.section.photos")}
              >
                <Camera className="h-3.5 w-3.5" />
                {row.original.photos.length}
              </span>
            )}
            {can("deduction.approve") && row.original.is_open && (
              <Button
                size="sm"
                className="h-7 rounded-full px-3 text-xs shadow-sm"
                onClick={() => setAnswering(row.original)}
              >
                {t("deductions.respond.title")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, df, can],
  );

  const totalCount = data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("deductions.title")}
        subtitle={isLoading ? "—" : t("deductions.count", { count: totalCount })}
        action={
          can("deduction.create") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <a href="/deductions/create">
                <Plus className="h-4 w-4" />
                {t("deductions.new")}
              </a>
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={data?.results ?? []}
        totalCount={totalCount}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={isLoading}
        isError={isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="deductions"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.awaiting_me && !list.filters.state,
            onSelect: () => list.clearFilters(),
          },
          {
            key: "awaiting",
            label: t("deductions.awaitingMe"),
            active: list.filters.awaiting_me === "true",
            onSelect: () => list.setFilter("awaiting_me", "true"),
          },
          ...(["ACCEPTED", "REJECTED", "AUTO_ACCEPTED"] as const).map(
            (state) => ({
              key: state,
              label: t(`deductions.state.${state}`),
              active: list.filters.state === state,
              onSelect: () => list.setFilter("state", state),
            }),
          ),
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {answering && (
        <RespondDialog
          deduction={answering}
          onClose={() => setAnswering(null)}
        />
      )}
    </div>
  );
}

/**
 * The producer's answer.
 *
 * Shows the claim, the photographs and what accepting would cost, because the
 * whole point of the approval step is that somebody looks before agreeing. A
 * dialog that only offered three buttons would be a faster way to click accept
 * without reading, which is exactly what the threshold exists to avoid.
 */
function RespondDialog({
  deduction,
  onClose,
}: {
  deduction: Deduction;
  onClose: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<DeductionDecision>("ACCEPT");
  const [note, setNote] = useState("");

  const respond = useMutation({
    mutationFn: () => respondToDeduction(deduction.id, decision, note.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deductions"] });
      void queryClient.invalidateQueries({ queryKey: ["settlements"] });
      onClose();
    },
  });

  const noteRequired = decision !== "ACCEPT";
  const blocked = noteRequired && note.trim() === "";

  const choices: Array<{
    value: DeductionDecision;
    label: string;
    icon: typeof Check;
    tone: string;
  }> = [
    {
      value: "ACCEPT",
      label: t("deductions.respond.accept"),
      icon: Check,
      tone: "text-success",
    },
    {
      value: "REJECT",
      label: t("deductions.respond.reject"),
      icon: X,
      tone: "text-destructive",
    },
    {
      value: "RECHECK",
      label: t("deductions.respond.recheck"),
      icon: RotateCcw,
      tone: "text-info",
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-[680px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("deductions.respond.title")}</DialogTitle>
          <DialogDescription>
            {t("deductions.respond.weight", {
              weight: deduction.weight_kg,
              dispatchNo: deduction.dispatch_no,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border bg-muted/40 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge label={t(`deductions.kind.${deduction.kind}`)} />
              <span className="text-xs text-muted-foreground">
                {deduction.site_name} · {df.date(deduction.inspected_at)} ·{" "}
                {deduction.inspected_by_name}
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground">{deduction.reason}</p>
          </div>

          {deduction.photos.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("deductions.photoNote")}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {deduction.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-4/3 overflow-hidden rounded-md border bg-muted/40"
                  >
                    <Image
                      src={photo.image}
                      alt={photo.caption || t("deductions.section.photos")}
                      fill
                      sizes="200px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("deductions.noPhotos")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("deductions.respond.title")}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setDecision(choice.value)}
                  className={
                    decision === choice.value
                      ? "flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
                      : "flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  <choice.icon className="h-3.5 w-3.5" />
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          {decision === "ACCEPT" && (
            <p className="text-xs text-muted-foreground">
              {t("deductions.respond.effect", { weight: deduction.weight_kg })}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("deductions.respond.note")}
              {noteRequired && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {noteRequired && (
              <p className="text-xs text-muted-foreground">
                {t("deductions.respond.noteRequired")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            disabled={blocked || respond.isPending}
            onClick={() => respond.mutate()}
          >
            <ScrollText className="h-4 w-4" />
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
