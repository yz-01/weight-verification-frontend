"use client";

/**
 * 「有退场资料」 (2026-10 C10): a supplier that has taken material back is
 * flagged wherever it is listed or chosen, and the flag opens every finished
 * return to it - date, material, quantity, plate, reason, Return Note,
 * photographs, both signatures and who approved it - to print, export or
 * share.
 *
 * Two shapes. Inside a dropdown's option the badge is only a mark: pressing
 * an option chooses the supplier, so it cannot also open a list. Beside a
 * chosen supplier, or in a list, the badge is a button that opens the
 * returns (`interactive`).
 *
 * Everyone who sees the supplier sees the mark (Q29.13: 「任何地方搜到或选到
 * 这家供应商，就提醒」); only someone who may read 材料出场 records can open
 * it - for anyone else it stays a mark, so nothing they press is refused.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, PackageMinus, Printer, Share2, Undo2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { ExportButton } from "@/components/shared/export-button";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import { PhotoThumb, rowPhotos } from "@/components/shared/photo-thumb";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { absoluteUrl, shareOrCopy } from "@/lib/share";
import { cn } from "@/lib/utils";
import { fetchAsFile, fetchObjectUrl } from "@/services/api-client";
import {
  exportBody,
  exportQuery,
  getSupplierReturns,
  type ExportRequest,
} from "@/services/contractor.service";
import { exportMaterialOutgoing } from "@/services/contractor-ops.service";

/** What the badge needs to know about a supplier. */
export interface ReturnBadgeSupplier {
  id: string;
  name: string;
  completed_return_count?: number;
}

export function SupplierReturnBadge({
  supplier,
  interactive = true,
  className,
}: {
  supplier: ReturnBadgeSupplier | null | undefined;
  /** Off inside a dropdown option: there it marks, it does not open. */
  interactive?: boolean;
  className?: string;
}) {
  const t = useTranslations("supplierReturns");
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const count = supplier?.completed_return_count ?? 0;
  if (!supplier || count <= 0) return null;
  const look = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-full border border-tone-amber/35 bg-tone-amber/12 px-1.5 py-0 text-2xs font-medium leading-5 text-tone-amber-fg",
    className,
  );
  // The returns are 材料出场 records: without leave to read those, the mark
  // still shows (Q29.13) but opens nothing that would only be refused.
  if (!interactive || !can("material_outgoing.view")) {
    return (
      <span className={look} data-slot="supplier-return-badge">
        <Undo2 className="size-3" />
        {t("badge")}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={cn(look, "cursor-pointer hover:bg-warning/20")}
        data-slot="supplier-return-badge"
        title={t("badgeHint", { count })}
        aria-label={t("badgeHint", { count })}
        onClick={(event) => {
          // A list row or a picker around it must not act on this press too.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Undo2 className="size-3" />
        {t("badge")}
      </button>
      {open && <SupplierReturnsDialog supplier={supplier} onClose={() => setOpen(false)} />}
    </>
  );
}

const EXPORT_PATH = "/api/material-outgoing/export_records/";

type Translate = (key: string) => string;

/**
 * The columns of the returns' export. Exported for its test: the completion
 * date is a date, labelled as one (audit #23), not 「完成人」.
 */
export function supplierReturnsExportColumns(
  t: Translate,
  ops: Translate,
  unitValues: Record<string, string>,
) {
  return [
    { key: "captured_at", label: t("column.date") },
    { key: "reference_no", label: ops("outgoing.referenceNo") },
    { key: "material_name", label: t("column.material") },
    { key: "returned_quantity", label: t("column.quantity") },
    { key: "unit", label: ops("field.unit"), values: unitValues },
    { key: "vehicle_plate", label: t("column.plate") },
    { key: "delivery_note_no", label: ops("field.deliveryNote") },
    { key: "reason", label: t("column.reason") },
    { key: "return_note_no", label: t("column.returnNote") },
    { key: "approver_name", label: ops("returnNote.approverName") },
    { key: "approved_by_name", label: ops("outgoing.approvedBy") },
    { key: "completed_by_name", label: ops("outgoing.completedBy") },
    { key: "completed_at", label: t("column.completedAt") },
  ];
}

export function SupplierReturnsDialog({
  supplier,
  onClose,
}: {
  supplier: ReturnBadgeSupplier;
  onClose: () => void;
}) {
  const t = useTranslations("supplierReturns");
  const ops = useTranslations("contractorOps");
  const dates = useTranslations("supplierDateFilter");
  const common = useTranslations("common");
  const { can } = useAuth();
  const unitValues = useUnitExportValues();
  const [printing, setPrinting] = useState(false);
  // A long history is cut at the server's cap (audit #24): narrowed here by
  // project and by the day the material left. Every project the reader sees
  // to begin with, not the top bar's: the 「有退场资料」 mark counts them all,
  // and the list it opens says the same (Q33.2).
  const [filters, setFilters] = useState({ project: "", date_from: "", date_to: "" });
  const returns = useQuery({
    queryKey: ["suppliers", "returns", supplier.id, filters],
    queryFn: () => getSupplierReturns(supplier.id, filters),
  });
  const rows = returns.data?.results ?? [];
  const narrow = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => Boolean(value)),
  );
  const title = t("title", { name: supplier.name });
  // The 材料出场 list follows the top bar; the link names the project shown
  // here (「all」 for every one) so it opens on the same returns (Q33.2).
  const listHref = `/material-outgoing?supplier=${encodeURIComponent(supplier.id)}&status=COMPLETED&project=${encodeURIComponent(filters.project || "all")}`;

  // The same export the 材料出场 list makes, narrowed to this supplier's
  // finished returns: each row with its photographs (C12) and Return Note.
  const exportRequest = (format: "xlsx" | "pdf"): ExportRequest => ({
    format,
    title,
    emptyLabel: t("empty"),
    query: { supplier: supplier.id, status: "COMPLETED", ...narrow },
    columns: supplierReturnsExportColumns(t, ops, unitValues),
  });
  const requestOptions = (format: "xlsx" | "pdf") => {
    const request = exportRequest(format);
    return { method: "POST" as const, query: exportQuery(request), body: exportBody(request) };
  };
  const share = useMutation({
    mutationFn: async () => {
      const file = await fetchAsFile(EXPORT_PATH, {
        ...requestOptions("pdf"),
        fallbackFilename: `${supplier.name}.pdf`,
      }).catch(() => null);
      return shareOrCopy({ title, url: absoluteUrl(listHref), file });
    },
    onSuccess: (outcome) => {
      if (outcome === "copied") toast.success(common("linkCopied"));
      else if (outcome === "failed") toast.error(common("shareFailed"));
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={!rows.length}
            disabledReason={t("empty")}
            onClick={() => setPrinting(true)}
          >
            <Printer className="size-4" />
            {t("print")}
          </Button>
          {/* Exporting is its own permission, as on every other list. */}
          {can("report.export") ? (
            <ExportButton
              onExport={(format) => exportMaterialOutgoing(exportRequest(format))}
              disabled={!rows.length}
            />
          ) : null}
          <Button
            variant="outline"
            disabled={share.isPending}
            onClick={() => share.mutate()}
          >
            {share.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
            {t("share")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectPicker
            value={filters.project || "all"}
            onValueChange={(next) =>
              setFilters((old) => ({ ...old, project: next === "all" ? "" : next }))
            }
            placeholder={ops("field.selectProject")}
            allowAll
            allLabel={ops("field.allProjects")}
            scope="own"
            className="w-full sm:w-64"
          />
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              type="date"
              aria-label={dates("from")}
              title={dates("from")}
              className="min-w-0 flex-1 sm:w-40 sm:flex-none"
              value={filters.date_from}
              max={filters.date_to || undefined}
              onChange={(event) => setFilters((old) => ({ ...old, date_from: event.target.value }))}
            />
            <span className="text-xs text-muted-foreground">{dates("to")}</span>
            <Input
              type="date"
              aria-label={dates("toLabel")}
              title={dates("toLabel")}
              className="min-w-0 flex-1 sm:w-40 sm:flex-none"
              value={filters.date_to}
              min={filters.date_from || undefined}
              onChange={(event) => setFilters((old) => ({ ...old, date_to: event.target.value }))}
            />
          </div>
        </div>
        <QueryFailedNote query={returns} what={t("what")} />
        {returns.data?.truncated ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
            {t("truncated", { shown: returns.data.count, total: returns.data.total ?? returns.data.count })}
          </p>
        ) : null}
        {returns.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : returns.isSuccess && !rows.length ? (
          <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : rows.length ? (
          <SupplierReturnsTable rows={rows} />
        ) : null}
        {printing && (
          <FilePreviewDialog
            title={title}
            load={() => fetchObjectUrl(EXPORT_PATH, requestOptions("pdf"))}
            previewType="application/pdf"
            filename={`${supplier.name}.pdf`}
            onDownload={() => exportMaterialOutgoing(exportRequest("pdf"))}
            onClose={() => setPrinting(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The returns as the badge shows them: one row per finished return. */
export function SupplierReturnsTable({ rows }: { rows: readonly MaterialOutgoing[] }) {
  const t = useTranslations("supplierReturns");
  const df = useDateFormat();
  const unitName = useUnitName();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("column.date")}</TableHead>
            <TableHead>{t("column.material")}</TableHead>
            <TableHead className="text-right">{t("column.quantity")}</TableHead>
            <TableHead>{t("column.plate")}</TableHead>
            <TableHead>{t("column.reason")}</TableHead>
            <TableHead>{t("column.returnNote")}</TableHead>
            <TableHead>{t("column.photos")}</TableHead>
            <TableHead>{t("column.signatures")}</TableHead>
            <TableHead>{t("column.approval")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ReturnRow key={row.id} row={row} unitName={unitName} df={df} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A signature as it was signed: dark ink on white, whole (not cropped), with
 * whose it is under it. The photo style (dark hatching, cover crop) made
 * signatures unreadable on the dark theme.
 */
function Signature({ src, label }: { src?: string | null; label: string }) {
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="flex w-20 shrink-0 flex-col items-center gap-0.5" title={label}>
      <Image
        src={src}
        alt={label}
        width={80}
        height={44}
        unoptimized
        className="h-11 w-20 rounded-md border bg-white object-contain p-0.5"
      />
      <span className="text-2xs text-muted-foreground">{label}</span>
    </a>
  );
}

function ReturnRow({
  row,
  unitName,
  df,
}: {
  row: MaterialOutgoing;
  unitName: ReturnType<typeof useUnitName>;
  df: ReturnType<typeof useDateFormat>;
}) {
  const t = useTranslations("supplierReturns");
  const ops = useTranslations("contractorOps");
  const when = row.processed_at || row.completed_at || row.captured_at;
  return (
    <TableRow className="align-middle">
      <TableCell className="whitespace-nowrap">
        <div className="tabular">{df.date(when)}</div>
        <Link
          href={`/material-outgoing?record=${row.id}`}
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          {row.reference_no}
          <ExternalLink className="size-3" />
        </Link>
      </TableCell>
      <TableCell className="max-w-48">
        <span className="font-medium">{row.material_name}</span>
        {row.category_name && row.category_name !== row.material_name ? (
          <span className="block text-xs text-muted-foreground">{row.category_name}</span>
        ) : null}
      </TableCell>
      <TableCell className="tabular whitespace-nowrap text-right">
        {row.returned_quantity ?? row.quantity} {unitName(row.unit, row.unit_label)}
      </TableCell>
      <TableCell className="whitespace-nowrap">{row.vehicle_plate || "—"}</TableCell>
      <TableCell className="max-w-56 text-xs">{row.reason || "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {row.return_note_no ? (
          <>
            <div className="font-medium">{row.return_note_no}</div>
            {row.return_note_at ? <div className="text-muted-foreground">{df.date(row.return_note_at)}</div> : null}
            {row.return_note_delivery_note_no ? (
              <div className="text-muted-foreground">
                {ops("returnNote.deliveryNoteNo")}: {row.return_note_delivery_note_no}
              </div>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        {/* One cover and the count, opening every photograph - as every
            other list shows a record's photographs. */}
        <PhotoThumb
          coverUrl={row.cover_photo_url ?? row.photos[0]?.watermarked}
          count={row.photo_count ?? row.photos.length}
          icon={PackageMinus}
          reference={row.reference_no}
          photos={rowPhotos(row.photos, row.reference_no)}
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Signature src={row.site_signature} label={t("site")} />
          <Signature src={row.supplier_signature} label={t("supplierSide")} />
        </div>
      </TableCell>
      <TableCell className="text-xs">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            {/* Who approved it in the system, and when; then the approver
                named on the Return Note, when there is one. */}
            <div>{row.approved_by_name || "—"}</div>
            {row.approved_at ? <div className="text-muted-foreground">{df.date(row.approved_at)}</div> : null}
            {row.approver_name ? (
              <div>
                <span className="text-muted-foreground">{t("approver")}:</span> {row.approver_name}
              </div>
            ) : null}
          </div>
          <Signature src={row.approver_signature} label={t("approver")} />
        </div>
      </TableCell>
    </TableRow>
  );
}
