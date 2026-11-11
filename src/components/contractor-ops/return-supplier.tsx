"use client";

/**
 * 「待补供应商」 and 「补供应商」 on a return to the supplier (JB169, 客户 11-11:
 * 「供应商应该属于必填项目，未选择供应商不能确认归档」).
 *
 * The tag has the look of 「待补规格」; 「补供应商」 opens the record's own
 * 改正 on the supplier alone, so an archived return still asks for the PIN and
 * keeps the change in 修改记录 (「已归档的退货记录如需更正，必须通过六位数密码验
 * 证，同时保留完整修改历史」). The reason the confirm will not press is written
 * out beside it, never only in a tooltip.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { RecordCorrectionDialog, useCanCorrect } from "@/components/shared/record-correction";
import { Button } from "@/components/ui/button";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { returnNeedsSupplier } from "@/lib/return-supplier";

export function SupplierPendingTag() {
  const t = useTranslations("contractorOps.outgoing");
  return (
    <span
      data-slot="supplier-pending-tag"
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-tone-amber/35 bg-tone-amber/12 px-1.5 py-0 text-2xs font-medium leading-5 text-tone-amber-fg"
      title={t("supplierPendingHint")}
    >
      {t("supplierPending")}
    </span>
  );
}

/** A return's supplier on a list or a detail: its name, 「待补供应商」, or a dash. */
export function ReturnSupplierCell({
  row,
}: {
  row: Pick<MaterialOutgoing, "supplier" | "supplier_name" | "status" | "needs_supplier"> & {
    kind?: string | null;
  };
}) {
  if (row.supplier_name) {
    return (
      <span className="block max-w-45 truncate" title={row.supplier_name}>
        {row.supplier_name}
      </span>
    );
  }
  if (returnNeedsSupplier(row)) return <SupplierPendingTag />;
  return <span className="text-muted-foreground">—</span>;
}

/** 「补供应商」: the record's 改正 on the supplier alone. Office only. */
export function FillReturnSupplierButton({
  row,
  onFilled,
}: {
  row: Pick<MaterialOutgoing, "id">;
  onFilled?: () => void;
}) {
  const t = useTranslations("contractorOps.outgoing");
  const allowed = useCanCorrect("MATERIAL_OUTGOING");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <>
      <Button size="sm" variant="outline" data-fill-return-supplier onClick={() => setOpen(true)}>
        <Truck />
        {t("fillSupplier")}
      </Button>
      {open && (
        <RecordCorrectionDialog
          kind="MATERIAL_OUTGOING"
          recordId={row.id}
          only={["supplier"]}
          title={t("fillSupplier")}
          onClose={() => setOpen(false)}
          onCorrected={() => {
            void queryClient.invalidateQueries({ queryKey: ["material-outgoing"] });
            void queryClient.invalidateQueries({ queryKey: ["record-closure"] });
            onFilled?.();
          }}
        />
      )}
    </>
  );
}

/** Why 确认 / 确认归档 will not press yet, said plainly, with 「补供应商」 beside it. */
export function ReturnSupplierNeeded({ row }: { row: Pick<MaterialOutgoing, "id"> }) {
  const t = useTranslations("contractorOps.outgoing");
  return (
    <div className="space-y-2" data-return-needs-supplier>
      <p role="status" className="rounded-md bg-warning/10 px-2 py-1.5 text-sm font-medium text-warning">
        {t("needSupplierFirst")}
      </p>
      <FillReturnSupplierButton row={row} />
    </div>
  );
}
