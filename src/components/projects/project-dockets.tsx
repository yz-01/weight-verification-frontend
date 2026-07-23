"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, Plus, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupplierQRCode } from "@/interfaces/contractor";
import {
  createQRCode,
  getQRCodes,
  getSuppliers,
  revokeQRCode,
} from "@/services/contractor.service";

/**
 * The dockets issued for one project.
 *
 * Lives on the project rather than in its own screen because a docket has no
 * meaning apart from the pair it binds: this supplier, delivering to this site.
 * Seeing them here answers the question people actually have — who is cleared
 * to deliver to this site.
 */
export function ProjectDockets({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<SupplierQRCode | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["qr-codes", projectId],
    queryFn: () => getQRCodes({ project: projectId, page_size: 100 }),
  });

  const revocation = useMutation({
    mutationFn: (id: string) => revokeQRCode(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["qr-codes", projectId] });
      setRevoking(null);
      setReason("");
    },
  });

  const rows = data?.results ?? [];

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {t("qrCodes.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("qrCodes.description")}
          </p>
        </div>
        {can("supplier.update") && (
          <Button
            size="sm"
            className="shrink-0 rounded-full px-4 shadow-sm"
            onClick={() => setIssuing(true)}
          >
            <QrCode className="h-4 w-4" />
            {t("qrCodes.new")}
          </Button>
        )}
      </div>

      <div className="divide-y border-t">
        {isLoading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("qrCodes.count", { count: 0 })}
          </p>
        ) : (
          rows.map((code) => (
            <div
              key={code.id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {code.supplier_name}
                </p>
                <p className="tabular truncate text-xs text-muted-foreground">
                  {code.token}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular hidden text-xs text-muted-foreground sm:inline">
                  {format(new Date(code.created_at), "dd MMM yyyy")}
                </span>
                <StatusBadge
                  label={
                    code.is_active
                      ? t("qrCodes.status.active")
                      : t("qrCodes.status.revoked")
                  }
                  tone={code.is_active ? "positive" : "neutral"}
                />
                {can("supplier.update") && code.is_active && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    title={t("qrCodes.revoke.confirm")}
                    onClick={() => setRevoking(code)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {issuing && (
        <IssueDocketDialog
          projectId={projectId}
          onClose={() => setIssuing(false)}
        />
      )}

      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setRevoking(null);
            setReason("");
          }}
          title={t("qrCodes.revoke.title")}
          description={t("qrCodes.revoke.description")}
          confirmLabel={t("qrCodes.revoke.confirm")}
          confirmIcon={Ban}
          isPending={revocation.isPending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() => revocation.mutate(revoking.id)}
        />
      )}
    </div>
  );
}

function IssueDocketDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState("");

  const { data } = useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: () => getSuppliers({ page_size: 100 }),
  });

  const creation = useMutation({
    mutationFn: (supplierId: string) =>
      createQRCode({ project: projectId, supplier: supplierId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["qr-codes", projectId] });
      onClose();
    },
  });

  const options = data?.results ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[440px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("qrCodes.createTitle")}</DialogTitle>
          <DialogDescription>{t("qrCodes.description")}</DialogDescription>
        </DialogHeader>

        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="w-full bg-card">
            <SelectValue placeholder={t("qrCodes.field.supplier")} />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? (
              <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                {t("common.noOptions")}
              </div>
            ) : (
              options.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

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
            disabled={supplier === "" || creation.isPending}
            onClick={() => creation.mutate(supplier)}
          >
            <Plus className="h-4 w-4" />
            {t("qrCodes.new")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
