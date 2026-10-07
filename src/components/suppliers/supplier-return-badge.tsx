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
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Printer, Share2, Undo2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { ExportButton } from "@/components/shared/export-button";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
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
  const [open, setOpen] = useState(false);
  const count = supplier?.completed_return_count ?? 0;
  if (!supplier || count <= 0) return null;
  const look = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0 text-[11px] font-medium leading-5 text-warning-foreground",
    className,
  );
  if (!interactive) {
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

export function SupplierReturnsDialog({
  supplier,
  onClose,
}: {
  supplier: ReturnBadgeSupplier;
  onClose: () => void;
}) {
  const t = useTranslations("supplierReturns");
  const ops = useTranslations("contractorOps");
  const common = useTranslations("common");
  const unitValues = useUnitExportValues();
  const [printing, setPrinting] = useState(false);
  const returns = useQuery({
    queryKey: ["suppliers", "returns", supplier.id],
    queryFn: () => getSupplierReturns(supplier.id),
  });
  const rows = returns.data?.results ?? [];
  const title = t("title", { name: supplier.name });
  const listHref = `/material-outgoing?supplier=${encodeURIComponent(supplier.id)}&status=COMPLETED`;

  // The same export the 材料出场 list makes, narrowed to this supplier's
  // finished returns: each row with its photographs (C12) and Return Note.
  const exportRequest = (format: "xlsx" | "pdf"): ExportRequest => ({
    format,
    title,
    emptyLabel: t("empty"),
    query: { supplier: supplier.id, status: "COMPLETED" },
    columns: [
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
      { key: "completed_at", label: ops("outgoing.completedBy") },
    ],
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
            size="sm"
            variant="outline"
            disabled={!rows.length}
            disabledReason={t("empty")}
            onClick={() => setPrinting(true)}
          >
            <Printer className="size-4" />
            {t("print")}
          </Button>
          <ExportButton
            onExport={(format) => exportMaterialOutgoing(exportRequest(format))}
            disabled={!rows.length}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={share.isPending}
            onClick={() => share.mutate()}
          >
            {share.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
            {t("share")}
          </Button>
        </div>
        <QueryFailedNote query={returns} what={t("what")} />
        {returns.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : returns.isSuccess && !rows.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
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

function Thumb({ src, alt, label }: { src?: string | null; alt: string; label?: string }) {
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block shrink-0" title={label ?? alt}>
      <Image
        src={src}
        alt={alt}
        width={56}
        height={40}
        unoptimized
        className="h-10 w-14 rounded border bg-white object-cover"
      />
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
    <TableRow className="align-top">
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
        <div className="flex max-w-56 flex-wrap gap-1">
          {row.photos.slice(0, 6).map((shot) => (
            <Thumb
              key={shot.id}
              src={shot.watermarked || shot.image}
              alt={shot.caption || row.reference_no}
              label={ops(`outgoing.stage.${shot.stage ?? "APPLICATION"}`)}
            />
          ))}
          {row.photos.length > 6 ? (
            <span className="self-center text-xs text-muted-foreground">+{row.photos.length - 6}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Thumb src={row.site_signature} alt={t("site")} label={t("site")} />
          <Thumb src={row.supplier_signature} alt={t("supplierSide")} label={t("supplierSide")} />
        </div>
      </TableCell>
      <TableCell className="text-xs">
        <div>{row.approved_by_name || "—"}</div>
        {row.approved_at ? <div className="text-muted-foreground">{df.date(row.approved_at)}</div> : null}
        {row.approver_name ? (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-muted-foreground">{t("approver")}:</span> {row.approver_name}
          </div>
        ) : null}
        <Thumb src={row.approver_signature} alt={t("approver")} label={t("approver")} />
      </TableCell>
    </TableRow>
  );
}
