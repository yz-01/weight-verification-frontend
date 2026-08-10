"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Power, Printer, QrCode, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  getProjectQr,
  regenerateProjectQr,
  setProjectQrStatus,
} from "@/services/contractor.service";

export function ProjectQrPanel({
  projectId,
  projectName,
  archived = false,
}: {
  projectId: string;
  projectName: string;
  archived?: boolean;
}) {
  const t = useTranslations("projects.qr");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [reason, setReason] = useState("");

  const qr = useQuery({
    queryKey: ["projects", "qr", projectId],
    queryFn: () => getProjectQr(projectId),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "ACTIVE" | "DISABLED") =>
      setProjectQrStatus(projectId, status, t("statusChangeNote")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "qr", projectId] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateProjectQr(projectId, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "qr", projectId] });
      setRegenerating(false);
      setReason("");
    },
  });

  const code = qr.data;
  const scanUrl = code && typeof window !== "undefined"
    ? `${window.location.origin}/scan/qr#token=${encodeURIComponent(code.token)}`
    : "";

  function downloadQr(format: "png" | "jpg") {
    if (!code || !qrRef.current) return;
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const link = document.createElement("a");
    link.href = qrRef.current.toDataURL(mime, 0.96);
    link.download = `${code.serial}.${format}`;
    link.click();
  }

  function printQr() {
    if (!code || !qrRef.current) return;
    const printWindow = window.open("", "_blank", "width=520,height=680");
    if (!printWindow) return;
    const image = qrRef.current.toDataURL("image/png");
    printWindow.opener = null;
    printWindow.document.write(
      `<!doctype html><html><head><title>${code.serial}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px}img{width:320px;height:320px}.serial{font-size:20px;font-weight:700;margin-top:20px}</style></head><body><img src="${image}" alt="${code.serial}"><div class="serial">${code.serial}</div><script>window.onload=()=>{window.print();window.close()}</script></body></html>`,
    );
    printWindow.document.close();
  }

  async function copyLink() {
    if (!scanUrl) return;
    await navigator.clipboard.writeText(scanUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  if (qr.isLoading) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{common("loading")}</div>;
  }
  if (qr.isError) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{t("loadError")}</div>;
  }
  if (!code) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("notAvailable")}</div>;
  }

  const active = code.effective_status === "ACTIVE";
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <QrCode className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("description", { project: projectName })}</p>
          </div>
        </div>
        <StatusBadge label={t(`status.${code.effective_status}`)} tone={active ? "positive" : "warning"} />
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="mx-auto rounded-xl border bg-white p-4 shadow-sm">
          <QRCodeCanvas
            ref={qrRef}
            value={scanUrl}
            size={240}
            level="H"
            marginSize={1}
            bgColor="#ffffff"
            fgColor="#111827"
            title={code.serial}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("serialLabel")}</p>
            <p className="mt-1 break-all text-lg font-semibold tabular-nums">{code.serial}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("scanHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadQr("png")}><Download />{t("downloadPng")}</Button>
            <Button variant="outline" onClick={() => downloadQr("jpg")}><Download />{t("downloadJpg")}</Button>
            <Button variant="outline" onClick={printQr}><Printer />{t("print")}</Button>
            <Button variant="outline" onClick={() => void copyLink()}><Copy />{copied ? t("copied") : t("copyLink")}</Button>
          </div>
          {!archived && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                variant={active ? "outline" : "default"}
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(active ? "DISABLED" : "ACTIVE")}
              >
                <Power />
                {active ? t("disable") : t("enable")}
              </Button>
              <Button variant="outline" onClick={() => setRegenerating(true)}>
                <RefreshCw />
                {t("regenerate")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={regenerating}
        onOpenChange={setRegenerating}
        title={t("regenerateTitle")}
        description={t("regenerateDescription")}
        confirmLabel={t("regenerateConfirm")}
        confirmIcon={RefreshCw}
        isPending={regenerateMutation.isPending}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired
        reasonLabel={t("reasonLabel")}
        onConfirm={() => regenerateMutation.mutate()}
      />
    </section>
  );
}
