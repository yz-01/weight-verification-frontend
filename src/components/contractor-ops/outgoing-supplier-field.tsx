"use client";

/**
 * Who the material goes back to, on the phone (2026-10 C9): optional on the
 * application, confirmed at the exit - chosen from the list, or scanned from
 * the supplier's own QR card, which wins (Q1: the lorry in front of you is
 * the fact). Each supplier with finished returns carries 「有退场资料」 (C10).
 *
 * The list is the shared searchable `SupplierPicker` (audit #25), as the
 * Return Note uses: typed, searched on the server, so a company with more
 * than one page of suppliers still finds the one at the gate.
 */

import { useMutation } from "@tanstack/react-query";
import { Loader2, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { SupplierPicker } from "@/components/shared/supplier-picker";
import { Button } from "@/components/ui/button";
import type { Supplier } from "@/interfaces/contractor";
import { scanSupplierQr } from "@/services/contractor.service";

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
  const scan = useMutation({
    mutationFn: (token: string) => scanSupplierQr(token),
    onSuccess: (supplier) => {
      setError("");
      setScanned(supplier);
      onChange(supplier.id, true);
    },
    onError: () => setError(t("outgoing.scanFailed")),
  });
  return (
    <FieldWrapper
      label={t("outgoing.supplier")}
      required={required}
      hint={required ? undefined : t("outgoing.supplierOptional")}
      className={className}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SupplierPicker
            value={value}
            onChange={(next) => {
              setScanned(null);
              onChange(next, false);
            }}
            known={scanned}
            allowedIds={allowedIds && scanned ? [...allowedIds, scanned.id] : allowedIds}
            placeholder={t("outgoing.chooseSupplier")}
            allowNone={!required}
            noneLabel={t("outgoing.noSupplier")}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
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
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
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
