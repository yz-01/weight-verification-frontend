"use client";

/**
 * 「核对与结算」 on an original record's own window (JB307-7, JB308).
 *
 * The client, 11-28j 第 7 点: 「总部已经上传核对凭证及结算凭证，项目经理打开原始
 * 资料包时却完全看不到这些凭证。请完善双向关联，将核对金额、结算金额、凭证编号、凭证
 * 照片或文件、操作人及日期时间全部关联回原始资料包，供有权限的人员查看、预览及打印。」
 * And 11-28k: 「设备租赁月结单同样存在结算凭证关联问题……请统一完善设备租赁、
 * Progress Claim 等业务的结算凭证关联。相关凭证必须能够从原始记录直接查看、预览、
 * 打印及导出」.
 *
 * One block for every kind of the shared 核对与结算 (材料退场 / 领用, 设备租赁
 * 月结单, 人工月结单, Progress Claim): 核对 - 编号 (opens it), 核对金额 (and why
 * it changed), 凭证编号, who and when, the voucher files; 结算 - the same. The
 * files are the check's / settlement's own vouchers, read only, each with
 * 查看 / 预览 / 打印 / 下载 (`RecordAttachmentsPanel`). Amounts only with
 * 「金额查看」; the server blanks them otherwise.
 */

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ReturnCheckWindow, SettlementWindow } from "@/components/contractor-ops/return-checks";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { Button } from "@/components/ui/button";
import { useSeesAmounts } from "@/hooks/use-sees-amounts";
import {
  isLockedReconciliation,
  type LockedReconciliation,
  type RecordReconciliation,
} from "@/interfaces/reconciliation";
import { useDateFormat } from "@/lib/dates";
import { rmText } from "@/lib/disposal-fees";

function Fact({ label, children, slot }: { label: string; children: React.ReactNode; slot?: string }) {
  return (
    <div data-slot={slot}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function ReconciliationVouchers({
  links,
  stacked = false,
}: {
  links: RecordReconciliation | LockedReconciliation | null | undefined;
  /** In a narrow side column: 核对 above 结算, never side by side. */
  stacked?: boolean;
}) {
  const t = useTranslations("jb307Vouchers");
  const df = useDateFormat();
  const money = useSeesAmounts();
  const [open, setOpen] = useState<"check" | "settlement" | null>(null);
  if (!links) return null;
  if (isLockedReconciliation(links)) {
    return (
      <p
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"
        data-slot="reconciliation-vouchers-locked"
      >
        <Lock className="size-4 shrink-0" />
        {t("locked")}
      </p>
    );
  }
  const checkVoucherNo = links.check_voucher_no ?? links.voucher_no ?? "";
  const checkedAmount = money ? links.checked_amount : null;
  const settledAmount = money ? links.settled_amount : null;
  const settled = Boolean(links.settlement_id);
  return (
    <section className="space-y-3 rounded-xl border p-4" data-slot="reconciliation-vouchers">
      <div>
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("help")}</p>
      </div>
      <div className={stacked ? "grid gap-4" : "grid gap-4 lg:grid-cols-2"}>
        {/* min-w-0 (walk 2 G6): in a narrow side column the voucher cards shrink
            and truncate their names instead of pushing past the column. */}
        <div className="min-w-0 space-y-3" data-slot="reconciliation-vouchers-check">
          <h4 className="text-sm font-semibold">{t("checkTitle")}</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Fact label={t("checkNo")}>
              <Button
                variant="link"
                className="h-auto p-0 font-semibold"
                data-slot="reconciliation-vouchers-check-link"
                onClick={() => setOpen("check")}
              >
                {links.check_no}
              </Button>
            </Fact>
            {checkedAmount ? (
              <Fact label={t("checkedAmount")} slot="reconciliation-vouchers-checked-amount">
                <span className="tabular font-semibold">{rmText(checkedAmount)}</span>
                {links.checked_reason ? (
                  <span className="block text-xs text-warning">{t("changedReason", { reason: links.checked_reason })}</span>
                ) : null}
              </Fact>
            ) : null}
            <Fact label={t("checkVoucherNo")}>{checkVoucherNo || "—"}</Fact>
            <Fact label={t("checkedBy")}>
              {links.checked_by_name || "—"} · {df.dateTime(links.checked_at)}
            </Fact>
            {links.check_note ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                <dd className="whitespace-pre-wrap text-sm">{links.check_note}</dd>
              </div>
            ) : null}
          </dl>
          <RecordAttachmentsPanel
            kind="MATERIAL_RETURN_CHECK"
            recordId={links.check_id}
            readOnly
            title={t("checkFiles")}
            hint={t("filesHint")}
          />
        </div>
        <div className="min-w-0 space-y-3" data-slot="reconciliation-vouchers-settlement">
          <h4 className="text-sm font-semibold">{t("settlementTitle")}</h4>
          {settled ? (
            <>
              <dl className="grid gap-2 sm:grid-cols-2">
                <Fact label={t("settlementNo")}>
                  <Button
                    variant="link"
                    className="h-auto p-0 font-semibold"
                    data-slot="reconciliation-vouchers-settlement-link"
                    onClick={() => setOpen("settlement")}
                  >
                    {links.settlement_no}
                  </Button>
                </Fact>
                {settledAmount ? (
                  <Fact label={t("settledAmount")} slot="reconciliation-vouchers-settled-amount">
                    <span className="tabular font-semibold">{rmText(settledAmount)}</span>
                    {(links.settlement_item_count ?? 1) > 1 ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("settledTogether", { count: links.settlement_item_count ?? 1 })}
                      </span>
                    ) : null}
                  </Fact>
                ) : null}
                <Fact label={t("settlementVoucherNo")}>{links.settlement_voucher_no || "—"}</Fact>
                <Fact label={t("settledBy")}>
                  {links.settled_by_name || "—"} · {links.settled_at ? df.dateTime(links.settled_at) : "—"}
                </Fact>
                {links.settlement_note ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{links.settlement_note}</dd>
                  </div>
                ) : null}
              </dl>
              <RecordAttachmentsPanel
                kind="MATERIAL_SETTLEMENT"
                recordId={links.settlement_id as string}
                readOnly
                title={t("settlementFiles")}
                hint={t("filesHint")}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-slot="reconciliation-vouchers-not-settled">
              {t("notSettled")}
            </p>
          )}
        </div>
      </div>
      {open === "check" ? (
        <ReturnCheckWindow id={links.check_id} kind={links.kind} onClose={() => setOpen(null)} />
      ) : null}
      {open === "settlement" && links.settlement_id ? (
        <SettlementWindow id={links.settlement_id} kind={links.kind} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
