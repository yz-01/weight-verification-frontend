"use client";

/**
 * JB309 (客户 11-28l 第 2、3 点): the 施工明细 ledger of subcontractor Progress
 * Claims on screen - 「根据项目、分包商、施工分类及日期范围，筛选」 and
 * 「已经用于工程款申请的施工明细，必须显示所属 Claim 编号及当前审批、结算状态」.
 * The server refuses a claimed record at every step; these only say so first.
 */
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import type { ClaimedBy, PackageClaimScope } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";

/** 「已用于 PKG-… · Claim No. … · 已结算」. */
export function claimedByText(
  t: (key: string, values?: Record<string, string>) => string,
  claimed: ClaimedBy,
): string {
  const used = claimed.claim_ref_no
    ? t("claimLedger.usedWithNo", { package: claimed.package_no, claimNo: claimed.claim_ref_no })
    : t("claimLedger.used", { package: claimed.package_no });
  return `${used} · ${t(`claimLedger.stage.${claimed.stage}`)}`;
}

/** One claimed record's line in the picker. */
export function ClaimedByLine({ claimed }: { claimed: ClaimedBy }) {
  const t = useTranslations("multiEngine");
  return (
    <p className="text-xs font-medium text-tone-amber-fg" data-slot="claimed-by">
      {claimedByText(t, claimed)}
    </p>
  );
}

/** 「只看本申请的施工分类及实际施工日期」, on by default. */
export function ClaimScopeToggle({
  scope,
  checked,
  onChange,
}: {
  scope: PackageClaimScope;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const notSet = t("claimLedger.notSet");
  return (
    <label className="flex items-start gap-2 text-sm" data-claim-only>
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <span>
        {t("claimLedger.scopeOnly")}
        <span className="block text-xs text-muted-foreground">
          {t("claimLedger.scopeDetail", {
            phase: scope.phase_name || notSet,
            from: scope.work_from ? formatter.date(scope.work_from) : notSet,
            to: scope.work_to ? formatter.date(scope.work_to) : notSet,
          })}
        </span>
      </span>
    </label>
  );
}
