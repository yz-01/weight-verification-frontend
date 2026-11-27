"use client";

/**
 * Multi Engine › Progress Claim 核对与结算 (JB298, 客户 11-28d 事项 1).
 *
 * 「开发团队需要完善应该在 Multi Engine → Progress Claim 页面完善核对与结算流程，
 * 而不是在报表中心操作。参考现有设备租赁月结单的设计：待核对 / 已核对 / 已结算 /
 * 全部 Claim。资料包审批完成并归档后，进入待核对，核对金额及上传凭证后再进行结算。」
 *
 * The four tabs over the Progress Claim list (`ClaimSettleTabs`), the list of
 * the first three (`ClaimSettleTable`: 资料包｜分包商｜申请日期｜审核归档｜批准金额｜
 * 核对金额｜核对编号｜结算编号｜结算状态), and the 结算状态 cell 全部 Claim adds to
 * today's list (`ClaimSettleCell`). 【核对与结算】 is the shared button of the
 * equipment rental statements (`ReconcileSettleButton`, kind `CLAIM`); a
 * number opens its 核对 / 结算 window.
 */

import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { useState } from "react";

import { ReturnCheckWindow, SettlementWindow } from "@/components/contractor-ops/return-checks";
import { clickOpensRow } from "@/components/shared/inside-row-control";
import { EmptyState, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSeesAmounts } from "@/hooks/use-sees-amounts";
import type { ClaimSettleState, EvidencePackageRow } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";

/** 「待核对｜已核对｜已结算｜全部 Claim」, kept in the address as `?settle=…`. */
export type ClaimSettleTab = "pending" | "checked" | "settled" | "all";

export const CLAIM_SETTLE_TABS: readonly ClaimSettleTab[] = ["pending", "checked", "settled", "all"];

/** Today's list (全部 Claim) unless the address names another tab. */
export function claimSettleTabOf(value: string | null): ClaimSettleTab {
  return value === "pending" || value === "checked" || value === "settled" ? value : "all";
}

export const CLAIM_TAB_STATE: Record<Exclude<ClaimSettleTab, "all">, "PENDING" | "CHECKED" | "SETTLED"> = {
  pending: "PENDING",
  checked: "CHECKED",
  settled: "SETTLED",
};

/** Who does 核对 / 结算: the people who review and archive the claims. */
export const CLAIM_SETTLE_PERMISSION = "package.manage";

const STATE_TONE: Record<ClaimSettleState, "warning" | "info" | "positive" | "neutral"> = {
  PENDING: "warning",
  CHECKED: "info",
  SETTLED: "positive",
  WAITING: "neutral",
  NOT_NEEDED: "neutral",
};

export function ClaimSettleTabs({ tab, onChange }: { tab: ClaimSettleTab; onChange: (next: ClaimSettleTab) => void }) {
  const t = useTranslations("jb298");
  return (
    <div className="flex flex-col gap-1">
      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="inline-flex flex-wrap self-start rounded-lg border bg-muted/40 p-1"
        data-testid="claim-settle-tabs"
      >
        {CLAIM_SETTLE_TABS.map((each) => (
          <Button
            key={each}
            role="tab"
            aria-selected={tab === each}
            variant={tab === each ? "default" : "ghost"}
            className="h-10 px-5 text-base"
            data-slot={`claim-tab-${each}`}
            onClick={() => onChange(each)}
          >
            {t(`tab.${each}`)}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t(`tabHelp.${tab}`)}</p>
    </div>
  );
}

/** 结算状态 and its numbers - the cell 全部 Claim adds (P2). */
export function ClaimSettleCell({
  row,
  onOpenCheck,
  onOpenSettlement,
}: {
  row: EvidencePackageRow;
  onOpenCheck: (id: string) => void;
  onOpenSettlement: (id: string) => void;
}) {
  const t = useTranslations("jb298");
  const info = row.claim_settlement;
  if (!info) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <StatusBadge label={t(`state.${info.state}`)} tone={STATE_TONE[info.state]} />
      {info.check_no && info.check_id ? (
        <button
          type="button"
          className="text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => onOpenCheck(info.check_id as string)}
        >
          {info.check_no}
        </button>
      ) : null}
      {info.settlement_no && info.settlement_id ? (
        <button
          type="button"
          className="text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => onOpenSettlement(info.settlement_id as string)}
        >
          {info.settlement_no}
        </button>
      ) : null}
    </div>
  );
}

/** The windows a 核对 / 结算 number opens, shared by both lists. */
export function useClaimWindows() {
  const [check, setCheck] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<string | null>(null);
  const windows = (
    <>
      {check ? <ReturnCheckWindow id={check} kind="CLAIM" onClose={() => setCheck(null)} /> : null}
      {settlement ? <SettlementWindow id={settlement} kind="CLAIM" onClose={() => setSettlement(null)} /> : null}
    </>
  );
  return { openCheck: setCheck, openSettlement: setSettlement, windows };
}

/**
 * 待核对 / 已核对 / 已结算: the claims in that state, newest first, a row
 * opens the package. An empty tab says plainly why it is empty.
 */
export function ClaimSettleTable({
  tab,
  rows,
  onOpen,
  onOpenCheck,
  onOpenSettlement,
}: {
  tab: Exclude<ClaimSettleTab, "all">;
  rows: readonly EvidencePackageRow[];
  onOpen: (id: string) => void;
  onOpenCheck: (id: string) => void;
  onOpenSettlement: (id: string) => void;
}) {
  const t = useTranslations("jb298");
  const df = useDateFormat();
  const money = useSeesAmounts();
  if (!rows.length) {
    return (
      <div data-slot="claim-settle-empty">
        <EmptyState icon={Inbox} title={t(`empty.${tab}`)} />
      </div>
    );
  }
  return (
    <div className="surface-panel overflow-x-auto rounded-xl" data-slot="claim-settle-table">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.package")}</TableHead>
            <TableHead>{t("col.subcontractor")}</TableHead>
            <TableHead>{t("col.period")}</TableHead>
            <TableHead>{t("col.appliedAt")}</TableHead>
            <TableHead>{t("col.archivedAt")}</TableHead>
            {money ? <TableHead className="text-right">{t("col.approved")}</TableHead> : null}
            {money && tab !== "pending" ? <TableHead className="text-right">{t("col.checked")}</TableHead> : null}
            <TableHead>{t("col.state")}</TableHead>
            <TableHead className="text-right">{t("col.open")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const info = row.claim_settlement;
            const changed =
              info?.checked_amount != null && Number(info.checked_amount) !== Number(row.approved_amount ?? 0);
            return (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                data-slot="claim-settle-row"
                onClick={(event) => {
                  if (clickOpensRow(event)) onOpen(row.id);
                }}
              >
                <TableCell className="font-medium">
                  <span className="block text-xs font-normal text-muted-foreground tabular">{row.package_no}</span>
                  {row.name}
                </TableCell>
                <TableCell>{row.claim_info?.subcontractor_name || "—"}</TableCell>
                <TableCell className="tabular whitespace-nowrap">
                  {row.claim_info?.period ? row.claim_info.period.slice(0, 7) : "—"}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap">{df.date(row.created_at)}</TableCell>
                <TableCell className="tabular whitespace-nowrap">
                  {row.completed_at ? df.date(row.completed_at) : "—"}
                </TableCell>
                {money ? (
                  <TableCell className="tabular text-right font-semibold">{row.approved_amount ?? "—"}</TableCell>
                ) : null}
                {money && tab !== "pending" ? (
                  <TableCell className="text-right">
                    <span className="tabular font-semibold">{info?.checked_amount ?? "—"}</span>
                    {changed ? (
                      <span className="block text-xs text-warning">
                        {t("bothAmounts", { approved: row.approved_amount ?? "—", checked: info?.checked_amount ?? "—" })}
                        {info?.checked_reason ? ` · ${info.checked_reason}` : ""}
                      </span>
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell>
                  <ClaimSettleCell row={row} onOpenCheck={onOpenCheck} onOpenSettlement={onOpenSettlement} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(row.id)}>
                    {t("open")}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
