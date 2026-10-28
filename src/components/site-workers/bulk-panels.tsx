"use client";

/**
 * 批量新增人员 (JB61-1): the phones' QR code, and the big photo to type from.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, Square } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
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
import { useDateFormat } from "@/lib/dates";
import { confirmRow, editRow, type BulkField, type BulkRow } from "@/lib/site-workers-bulk";
import { getCaptureLink, stopCapture } from "@/services/site-workers.service";

/**
 * 「用手机拍护照」: a QR code any phone can scan to photograph passports into
 * this batch. Several phones at once; what they take appears in the table.
 */
export function CapturePanel({
  batchId,
  phoneCount,
  onStopped,
}: {
  batchId: string;
  phoneCount: number;
  onStopped: () => void;
}) {
  const bulk = useTranslations("siteWorkers.bulk");
  const df = useDateFormat();
  const link = useQuery({
    queryKey: ["site-workers", "batch", batchId, "capture-link"],
    queryFn: () => getCaptureLink(batchId),
    staleTime: Infinity,
    gcTime: 0,
  });
  const stop = useMutation({
    mutationFn: () => stopCapture(batchId),
    onSuccess: onStopped,
  });
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
      <div className="flex size-48 shrink-0 items-center justify-center rounded-md border bg-card p-2">
        {link.data ? (
          <QRCodeSVG value={link.data.url} size={176} level="M" />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <h2 className="panel-title">{bulk("capture.title")}</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>{bulk("capture.step1")}</li>
          <li>{bulk("capture.step2")}</li>
          <li>{bulk("capture.step3")}</li>
        </ol>
        <p className="text-muted-foreground">
          {link.data ? bulk("capture.validUntil", { at: df.dateTime(link.data.expires_at) }) : ""}
        </p>
        <p className="font-medium">{bulk("capture.phoneCount", { count: phoneCount })}</p>
        <QueryFailedNote query={link} what={bulk("capture.what")} />
        <Button variant="outline" size="sm" onClick={() => stop.mutate()} disabled={stop.isPending}>
          {stop.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          {bulk("capture.stop")}
        </Button>
        <p className="text-xs text-muted-foreground">{bulk("capture.stopHint")}</p>
      </div>
    </section>
  );
}

const CHECK_FIELDS: { field: BulkField; label: string }[] = [
  { field: "name", label: "field.name" },
  { field: "passport_no", label: "field.passportNo" },
  { field: "nationality", label: "field.nationality" },
  { field: "date_of_birth", label: "field.dateOfBirth" },
  { field: "passport_expiry", label: "field.passportExpiry" },
  { field: "phone", label: "field.phone" },
];

/**
 * 「对着照片补打」: the passport large on the left, the row's boxes on the
 * right. 「核对好了」 clears the yellow.
 */
export function RowCheckDialog({
  row,
  number,
  onChange,
  onClose,
}: {
  row: BulkRow | null;
  number: number;
  onChange: (row: BulkRow) => void;
  onClose: () => void;
}) {
  const t = useTranslations("siteWorkers");
  const bulk = useTranslations("siteWorkers.bulk");
  const common = useTranslations("common");
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{bulk("check.title", { number })}</DialogTitle>
          <DialogDescription>
            {row?.needsCheck ? bulk("check.yellowBody") : bulk("check.body")}
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-3">
              {row.photoUrl && !row.photoIsPdf ? (
                <a href={row.photoUrl} target="_blank" rel="noreferrer" className="block">
                  <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted">
                    <Image
                      src={row.photoUrl}
                      alt={bulk("column.photo")}
                      fill
                      sizes="(min-width: 768px) 60vw, 100vw"
                      className="object-contain"
                      unoptimized
                    />
                  </span>
                </a>
              ) : row.photoUrl ? (
                <a
                  href={row.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border bg-muted text-sm text-primary"
                >
                  <FileText className="h-8 w-8" />
                  {bulk("check.openPdf")}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">{bulk("check.noPhoto")}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{bulk("check.zoomHint")}</p>
            </div>
            <div className="grid content-start gap-3 md:col-span-2">
              {CHECK_FIELDS.map(({ field, label }) => (
                <FieldWrapper key={field} label={t(label)}>
                  <Input
                    value={row.values[field]}
                    placeholder={
                      field === "date_of_birth" || field === "passport_expiry" ? bulk("datePlaceholder") : undefined
                    }
                    onChange={(event) => onChange(editRow(row, field, event.target.value))}
                  />
                </FieldWrapper>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("close")}
          </Button>
          {row?.needsCheck && (
            <Button
              onClick={() => {
                onChange(confirmRow(row));
                onClose();
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {bulk("check.confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
