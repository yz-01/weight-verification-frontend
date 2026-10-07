"use client";

/**
 * Who the material goes back to, on the phone (2026-10 C9): optional on the
 * application, confirmed at the exit - chosen from the list, or scanned from
 * the supplier's own QR card, which wins (Q1: the lorry in front of you is
 * the fact). Each supplier with finished returns carries 「有退场资料」 (C10).
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { SupplierReturnBadge } from "@/components/suppliers/supplier-return-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Supplier } from "@/interfaces/contractor";
import { getSuppliers, scanSupplierQr } from "@/services/contractor.service";

const NONE = "__none__";

export function OutgoingSupplierField({
  value,
  onChange,
  allowedIds = null,
  required = false,
  className,
}: {
  value: string;
  /** `scanned` is true when the value came from a QR code. */
  onChange: (supplier: string, scanned: boolean) => void;
  /** The material category's own suppliers, when it names any (A4, Q1). */
  allowedIds?: readonly string[] | null;
  required?: boolean;
  className?: string;
}) {
  const t = useTranslations("contractorOps");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState<Supplier | null>(null);
  const [error, setError] = useState("");
  const suppliers = useQuery({
    queryKey: ["suppliers", "outgoing"],
    queryFn: () => getSuppliers({ page_size: 100, sort_by: "name" }),
  });
  const rows = (suppliers.data?.results ?? []).filter(
    (row) =>
      (row.is_active || row.id === value) &&
      (!allowedIds || allowedIds.includes(row.id) || row.id === value || row.id === scanned?.id),
  );
  // A scanned card may name a supplier past the first page: keep it offered.
  const options = scanned && !rows.some((row) => row.id === scanned.id) ? [scanned, ...rows] : rows;
  const scan = useMutation({
    mutationFn: (token: string) => scanSupplierQr(token),
    onSuccess: (supplier) => {
      setError("");
      setScanned(supplier);
      onChange(supplier.id, true);
    },
    onError: () => setError(t("outgoing.scanFailed")),
  });
  const chosen = options.find((row) => row.id === value);
  return (
    <FieldWrapper
      label={t("outgoing.supplier")}
      required={required}
      hint={required ? undefined : t("outgoing.supplierOptional")}
      className={className}
    >
      <div className="flex gap-2">
        <Select
          value={value || NONE}
          onValueChange={(next) => {
            setScanned(null);
            onChange(next === NONE ? "" : next, false);
          }}
        >
          <SelectTrigger className="h-11 min-w-0 flex-1">
            <SelectValue placeholder={t("outgoing.chooseSupplier")} />
          </SelectTrigger>
          <SelectContent>
            {!required && <SelectItem value={NONE}>{t("outgoing.noSupplier")}</SelectItem>}
            {options.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
                <SupplierReturnBadge supplier={row} interactive={false} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          disabled={scan.isPending}
          onClick={() => setScannerOpen(true)}
        >
          {scan.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
          <span className="sr-only sm:not-sr-only">{t("outgoing.scanSupplier")}</span>
        </Button>
      </div>
      {scanned && scanned.id === value ? (
        <p className="text-xs text-muted-foreground">
          {t("outgoing.scannedSupplier", { name: scanned.name })}
        </p>
      ) : null}
      {/* 「有退场资料」 (2026-10 C10): the chosen supplier's returns. */}
      <SupplierReturnBadge supplier={chosen} />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <QueryFailedNote query={suppliers} what={t("what.suppliers")} />
      <SupplierQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(token) => {
          setScannerOpen(false);
          scan.mutate(token);
        }}
      />
    </FieldWrapper>
  );
}
