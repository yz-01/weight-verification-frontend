"use client";

/**
 * 「顾问审批记录」 on a delivery (JB270, 客户 11-26 事项 11, 图 13–14): 「在材料
 * 进场详情页面右侧「验收」与「签名」之间，设置「顾问审批记录」栏目，自动显示关联的申请
 * 编号、最新版本、审批状态及审批时间，点击即可查看完整审批报告及材料证书。无须重复手动
 * 关联，原有材料收货验收状态保持独立，不受顾问审批结果自动改变。」
 *
 * The server works it out from 关联现场证据 (``consultant_approvals``): every
 * consultant application that linked a photo of this delivery, at its latest
 * version, only those the reader may see. A row opens the application, where
 * its approval report and its certificates are. Nothing here changes the
 * delivery's own 验收.
 */

import { useQuery } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { QueryFailedNote } from "@/components/shared/page-primitives";
import { ShellPanel } from "@/components/shared/record-detail-shell";
import type { ReceiptConsultantApproval } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import { getReceiptConsultantApprovals } from "@/services/contractor.service";

export function ConsultantApprovalsPanel({ receiptId }: { receiptId: string }) {
  const query = useQuery({
    queryKey: ["receipt-consultant-approvals", receiptId],
    queryFn: () => getReceiptConsultantApprovals(receiptId),
  });
  return <ConsultantApprovalsList rows={query.data ?? []} loading={query.isLoading} query={query} />;
}

export function ConsultantApprovalsList({
  rows,
  loading = false,
  query,
}: {
  rows: readonly ReceiptConsultantApproval[];
  loading?: boolean;
  query?: { isError: boolean; refetch?: () => unknown };
}) {
  const t = useTranslations("jb270");
  const cw = useTranslations("consultantWorkflow");
  const df = useDateFormat();
  return (
    <ShellPanel title={t("title")} data-receipt-consultant-approvals>
      {query ? <QueryFailedNote query={query} what={t("title")} /> : null}
      {loading ? null : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const body = (
              <>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {row.application_no} · {cw("detail.revision", { revision: row.revision })}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-xs" data-slot="approval-status">
                    {cw(`status.${row.status}`)}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {row.decided_at
                    ? t("decidedAt", { when: df.dateTime(row.decided_at) })
                    : t("notDecided")}
                </span>
                {row.can_open ? (
                  <span className="mt-1 flex items-center gap-1 text-xs text-primary">
                    <FileCheck2 className="size-3.5" aria-hidden />
                    {t("open")}
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={row.id}>
                {row.can_open ? (
                  <Link
                    href={`/consultant-applications/${row.id}`}
                    className="block rounded-lg border border-panel-border p-2.5 text-sm hover:bg-muted"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-lg border border-panel-border p-2.5 text-sm">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-2xs text-muted-foreground">{t("independent")}</p>
    </ShellPanel>
  );
}
