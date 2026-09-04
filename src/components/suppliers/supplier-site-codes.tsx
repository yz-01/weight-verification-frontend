"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, QrCode, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormSection } from "@/components/shared/form-shell";
import { StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Supplier, SupplierQRCode } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import {
  createQRCode,
  getProjects,
  getQRCodes,
  revokeQRCode,
} from "@/services/contractor.service";

/**
 * The standing codes that bind this supplier to individual sites.
 *
 * Separate from the supplier's own code above, and not the same thing: the
 * supplier's code says who is delivering, this one says who and where. That
 * difference is why a receipt taken against a site code needs no project
 * chosen by hand, and why the receipt form quietly cites the live code for
 * the pair on every delivery it files.
 *
 * The backend allows exactly one live code per supplier per site. Rather than
 * offer a site that would be refused, the picker lists only sites without one
 * - reissuing means revoking the old code first, which is also what stops the
 * printed sheet already on a gate house wall.
 */
export function SupplierSiteCodes({ supplier }: { supplier: Supplier }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [chosenProject, setChosenProject] = useState("");
  const [revoking, setRevoking] = useState<SupplierQRCode | null>(null);
  const [reason, setReason] = useState("");
  const [showing, setShowing] = useState<SupplierQRCode | null>(null);

  const codes = useQuery({
    queryKey: ["supplier-qr-codes", supplier.id],
    queryFn: () => getQRCodes({ supplier: supplier.id, page_size: 100 }),
  });
  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["supplier-qr-codes", supplier.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["qr-codes"] });
    void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const issue = useMutation({
    mutationFn: () =>
      createQRCode({ project: chosenProject, supplier: supplier.id }),
    onSuccess: (code) => {
      setChosenProject("");
      setShowing(code);
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (code: SupplierQRCode) => revokeQRCode(code.id, reason.trim()),
    onSuccess: () => {
      setRevoking(null);
      setReason("");
      refresh();
    },
  });

  const rows = codes.data?.results ?? [];
  const live = new Set(
    rows.filter((row) => row.is_active).map((row) => row.project),
  );
  const available = (projects.data?.results ?? []).filter(
    (project) => !live.has(project.id),
  );
  const mayIssue = can("supplier.update");

  return (
    <FormSection title={t("suppliers.siteCodes.title")} className="md:grid-cols-1">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("suppliers.siteCodes.description")}
      </p>

      {codes.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          {t("suppliers.siteCodes.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {row.project_code} - {row.project_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.is_active
                    ? t("suppliers.siteCodes.issuedOn", {
                        date: df.date(row.created_at),
                      })
                    : t("suppliers.siteCodes.revokedOn", {
                        date: row.revoked_at ? df.date(row.revoked_at) : "-",
                      })}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={t(
                    row.is_active
                      ? "qrCodes.status.active"
                      : "qrCodes.status.revoked",
                  )}
                  tone={row.is_active ? "positive" : "neutral"}
                />
                {row.is_active && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowing(row)}
                  >
                    <QrCode className="h-4 w-4" />
                    {t("qrCodes.viewQr")}
                  </Button>
                )}
                {row.is_active && mayIssue && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setRevoking(row)}
                  >
                    <XCircle className="h-4 w-4" />
                    {t("qrCodes.revoke.confirm")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {mayIssue &&
        (available.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {projects.data?.results?.length
              ? t("suppliers.siteCodes.allSitesCovered")
              : t("suppliers.siteCodes.noSites")}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-56 flex-1">
              <ProjectPicker
                value={chosenProject}
                onValueChange={setChosenProject}
                placeholder={t("suppliers.siteCodes.chooseSite")}
                projects={available}
              />
            </div>
            <Button
              type="button"
              requires={[[chosenProject, t("suppliers.siteCodes.chooseSite")]]}
              disabled={issue.isPending}
              onClick={() => issue.mutate()}
            >
              <Plus className="h-4 w-4" />
              {t("suppliers.siteCodes.issue")}
            </Button>
          </div>
        ))}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
            setReason("");
          }
        }}
        title={t("qrCodes.revoke.title")}
        description={t("qrCodes.revoke.description")}
        confirmLabel={t("qrCodes.revoke.confirm")}
        confirmIcon={XCircle}
        isPending={revoke.isPending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />

      {showing && (
        <SiteCodeDialog code={showing} onClose={() => setShowing(null)} />
      )}
    </FormSection>
  );
}

/**
 * The printable sheet for one site code.
 *
 * The encoded link is the same shape the supplier's own code uses, because
 * the field screen tries the site code first when it resolves a scanned
 * token: scanning this one fills in both the site and the supplier, while the
 * supplier's own code can only fill in the supplier.
 */
function SiteCodeDialog({
  code,
  onClose,
}: {
  code: SupplierQRCode;
  onClose: () => void;
}) {
  const t = useTranslations();
  const canvas = useRef<HTMLCanvasElement>(null);

  const scanUrl =
    typeof window === "undefined"
      ? code.token
      : `${window.location.origin}/field-staff?tab=records&record=material&supplier_token=${encodeURIComponent(code.token)}`;

  function downloadPng() {
    if (!canvas.current) return;
    const link = document.createElement("a");
    link.href = canvas.current.toDataURL("image/png");
    link.download = `${code.project_code}-${code.supplier_code}.png`;
    link.click();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {code.project_code} - {code.supplier_name}
          </DialogTitle>
          <DialogDescription>
            {t("suppliers.siteCodes.scanHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto rounded-lg border bg-white p-4">
          <QRCodeCanvas
            ref={canvas}
            value={scanUrl}
            size={220}
            level="H"
            marginSize={1}
            bgColor="#ffffff"
            fgColor="#111827"
            title={code.project_code}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={downloadPng}>
            <Download className="h-4 w-4" />
            {t("qrCodes.downloadPng")}
          </Button>
          <Button type="button" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
