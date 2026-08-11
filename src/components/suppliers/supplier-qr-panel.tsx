"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  Power,
  Printer,
  QrCode,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormSection } from "@/components/shared/form-shell";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { Supplier } from "@/interfaces/contractor";
import {
  regenerateSupplierQr,
  setSupplierQrStatus,
} from "@/services/contractor.service";

export function SupplierQrPanel({ supplier }: { supplier: Supplier }) {
  const t = useTranslations("suppliers.qr");
  const queryClient = useQueryClient();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["suppliers", "detail", supplier.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  };
  const statusMutation = useMutation({
    mutationFn: () => setSupplierQrStatus(supplier.id, !supplier.qr_is_active),
    onSuccess: refresh,
  });
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateSupplierQr(supplier.id),
    onSuccess: () => {
      setRegenerating(false);
      refresh();
    },
  });

  if (!supplier.qr_token) return null;

  const scanUrl =
    typeof window === "undefined"
      ? supplier.qr_token
      : `${window.location.origin}/field-staff?tab=records&record=material&supplier_token=${encodeURIComponent(supplier.qr_token)}`;

  function downloadPng() {
    if (!qrRef.current) return;
    const link = document.createElement("a");
    link.href = qrRef.current.toDataURL("image/png");
    link.download = `${supplier.code}-supplier-qr.png`;
    link.click();
  }

  function printQr() {
    if (!qrRef.current) return;
    const printWindow = window.open("", "_blank", "width=560,height=720");
    if (!printWindow) return;
    const image = qrRef.current.toDataURL("image/png");
    printWindow.opener = null;
    printWindow.document.write(
      `<!doctype html><html><head><title>${supplier.code}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}img{width:320px;height:320px}h1{font-size:24px;margin:20px 0 6px}p{font-size:16px;color:#4b5563}</style></head><body><img src="${image}" alt="${supplier.code}"><h1>${supplier.name}</h1><p>${supplier.code}</p><script>window.onload=()=>window.print()</script></body></html>`,
    );
    printWindow.document.close();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(scanUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function shareLink() {
    if (navigator.share) {
      await navigator.share({
        title: supplier.name,
        text: t("shareText", { supplier: supplier.name }),
        url: scanUrl,
      });
      return;
    }
    await copyLink();
  }

  return (
    <FormSection title={t("title")} className="md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="mx-auto rounded-lg border bg-white p-4 shadow-sm">
        <QRCodeCanvas
          ref={qrRef}
          value={scanUrl}
          size={220}
          level="H"
          marginSize={1}
          bgColor="#ffffff"
          fgColor="#111827"
          title={supplier.code}
        />
      </div>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={t(supplier.qr_is_active ? "active" : "inactive")}
            tone={supplier.qr_is_active ? "positive" : "warning"}
          />
          <span className="text-sm font-semibold">{supplier.name}</span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadPng}>
            <Download />
            {t("downloadPng")}
          </Button>
          <Button type="button" variant="outline" onClick={printQr}>
            <Printer />
            {t("printPdf")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void shareLink()}>
            <Share2 />
            {t("share")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void copyLink()}>
            <Copy />
            {copied ? t("copied") : t("copyLink")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            type="button"
            variant={supplier.qr_is_active ? "outline" : "default"}
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate()}
          >
            <Power />
            {t(supplier.qr_is_active ? "disable" : "enable")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setRegenerating(true)}>
            <RefreshCw />
            {t("regenerate")}
          </Button>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          <QrCode className="mt-0.5 size-4 shrink-0" />
          {t("scanHelp")}
        </p>
      </div>

      <ConfirmDialog
        open={regenerating}
        onOpenChange={setRegenerating}
        title={t("regenerateTitle")}
        description={t("regenerateDescription")}
        confirmLabel={t("regenerateConfirm")}
        confirmIcon={RefreshCw}
        isPending={regenerateMutation.isPending}
        onConfirm={() => regenerateMutation.mutate()}
      />
    </FormSection>
  );
}
