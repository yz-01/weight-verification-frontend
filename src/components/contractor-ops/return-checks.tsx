"use client";

/**
 * 退货核对 (JB188, 客户 11-13 下午) on 材料管理 › 材料出场 › 供应商退货.
 *
 * The client: 「在现有材料出场页面设置「待核对／已核对」两个页签。点击「退货核对」，
 * 可以勾选同一家供应商的一笔或多笔退货资料。」「勾选完成后：自动显示核对人姓名、
 * 日期及时间。支持上传文件、照片或PDF。备注选填。输入六位数签核密码确认。」「确认
 * 后，勾选的资料自动显示在「已核对」页面，并生成 MO-RN001、MO-RN002……编号。列表
 * 显示：核对编号｜供应商｜笔数｜日期｜核对人｜查看。点击「查看」，上方显示当次勾选
 * 的全部退货记录，每条都可以打开原始资料；下方显示共同的核对人、时间、备注及上传
 * 凭证。支持预览、打印、导出PDF，所有历史长期保留。」
 *
 * JB277 (客户 11-26 事项 18): 「凭证编号（必填）……上传凭证（必填），支持照片或PDF
 * 文件。凭证编号必须设置独立填写栏位，不要放在备注栏内。以上两项缺少任何一项，系统均
 * 不得允许确认核对。」 - both required here and on the server.
 *
 * JB278 (事项 19): the same 核对 for 材料领用 (by 所属公司, `kind="ISSUE"`), a
 * third tab 「已结算」 and the 结算 after 核对 (`SettlePicker`) for both; the
 * record shows its 核对 / 结算 under 「已归档」 (`ReconciliationPanel`), and
 * each number opens its window. JB280 (事项 21) reuses all of it for the
 * equipment rental statements (`kind="RENTAL"`). JB295: the 人工结算单
 * (`kind="LABOUR"`, by 所属公司, LB-RC / LB-ST). JB298 (客户 11-28d 事项 1): Multi
 * Engine's Progress Claims (`kind="CLAIM"`, by 分包商, CL-RC / CL-ST), each with
 * its 核对金额 (the 批准金额 unless changed, then with a reason).
 *
 * Reused, not rebuilt (「请尽量复用现有页面、文件上传、签核密码及历史记录机制」):
 * the picking list and the list inside a check are the badge's own table
 * (`SupplierReturnsTable`, 图 2) with a tick column; the files are the house's
 * `AttachmentPicker` and, once saved, the record's `RecordAttachmentsPanel`
 * (read only); the PIN is the shared dialog the API client opens; the PDF has
 * the four file buttons and the operation log of every other file.
 *
 * Windows are opened and closed by state, never by an effect (JB187).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, Eye, HandCoins, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { OutgoingDecision } from "@/components/dashboard/approval-opener";
import { RentalStatementWindow } from "@/components/equipment-hours/rental-statements";
import { LabourStatementRowsTable } from "@/components/labour/labour-statements";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { clickOpensRow } from "@/components/shared/inside-row-control";
import { DataTable } from "@/components/shared/data-table";
import { FileActionButtons } from "@/components/shared/file-actions";
import { PlainHeader } from "@/components/shared/module-records-table";
import { FieldWrapper, ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { RecordSendLog } from "@/components/shared/record-send-log";
import { RecordWindowFailure } from "@/components/shared/record-window-failure";
import { SupplierReturnsTable } from "@/components/suppliers/supplier-return-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useUnitName } from "@/hooks/use-material-units";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { ATTACHMENT_ACCEPT } from "@/lib/attachment-whitelist";
import { useDateFormat } from "@/lib/dates";
import { getSupplierReturns } from "@/services/contractor.service";
import { getLabourStatements, type LabourStatementSummary } from "@/services/labour-statement.service";
import { getRentalStatements, type RentalStatementRow } from "@/services/rental-statement.service";
import {
  createReturnCheck,
  createSettlement,
  getPendingClaims,
  getPendingIssues,
  getPendingReturnSuppliers,
  getReturnCheck,
  getReturnChecks,
  getSettleable,
  getSettlement,
  getSettlements,
  returnCheckPdfFile,
  type ClaimCheckRow,
  type IssueCheckRow,
  type PendingReturnSupplier,
  type ReconKind,
  type ReturnCheck,
  type ReturnCheckRow,
  type SettleableParty,
  type Settlement,
  type SettlementRow,
} from "@/services/return-check.service";

/** The server's limits on a check's files (`utils/attachment_files.py`). */
export const RETURN_CHECK_MAX_FILES = 10;
export const RETURN_CHECK_MAX_MB = 50;
/** 「备注选填」 - a remark, not a document (the server's `NOTE_MAX`). */
const NOTE_MAX = 2000;
/** 「CN No. 1232」 - the server's `VOUCHER_NO_MAX`. */
const VOUCHER_NO_MAX = 100;

/**
 * Who is offered 核对 / 结算: an office account holding `permission`. Never a
 * phone account - the server refuses every signed step there
 * (`sign_off_office_only`, 「请在电脑后台操作。手机端不能做这一步。」), and Lucas
 * 11-26: 「手机不应该出现审批才对」. The phone may still read the status.
 */
export function officeMay(
  user: { is_field_staff?: boolean } | null | undefined,
  can: (code: string) => boolean,
  permission: string,
): boolean {
  return !user?.is_field_staff && can(permission);
}

/** 「待核对」, 「已核对」 or 「已结算」, kept in the address as `?tab=…`. */
export type ReturnTab = "pending" | "checked" | "settled";

export function returnTabOf(value: string | null): ReturnTab {
  return value === "checked" ? "checked" : value === "settled" ? "settled" : "pending";
}

/** What a saved check or settlement changes on other screens. */
export const RETURN_CHECK_STALE_KEYS = [
  ["material-outgoing"],
  ["suppliers"],
  ["return-checks"],
  ["settlements"],
  ["receipts", "net-totals"],
  ["rental-statements"],
  ["labour-statements"],
  // JB298: Multi Engine's Progress Claim tabs, the overview card, the report.
  ["evidence-packages"],
  ["site-cost-overview"],
  ["contractor-reports"],
] as const;

/** 「待核对｜已核对｜已结算」 (JB188 做法 1, JB278 第 2 点). */
export function ReturnCheckTabs({
  value,
  onChange,
}: {
  value: ReturnTab;
  onChange: (next: ReturnTab) => void;
}) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  return (
    <div
      role="tablist"
      aria-label={t("tabsLabel")}
      className="inline-flex self-start rounded-lg border bg-muted/40 p-1"
      data-testid="return-check-tabs"
    >
      {(["pending", "checked", "settled"] as const).map((tab) => (
        <Button
          key={tab}
          role="tab"
          aria-selected={value === tab}
          variant={value === tab ? "default" : "ghost"}
          className="h-10 px-5 text-base"
          data-slot={`return-tab-${tab}`}
          onClick={() => onChange(tab)}
        >
          {tab === "pending" ? t("tabPending") : tab === "checked" ? t("tabChecked") : tj("tabSettled")}
        </Button>
      ))}
    </div>
  );
}

/**
 * 【退货核对】, above 「待核对」: only for whoever may approve 材料出场 (做法 2、9).
 * Saved, the window closes and `onSaved` takes the reader to 「已核对」.
 */
export function ReturnCheckButton({ onSaved }: { onSaved: (check: ReturnCheck) => void }) {
  const t = useTranslations("returnChecks");
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!officeMay(user, can, "material_outgoing.approve")) return null;
  return (
    <>
      <Button data-slot="return-check-button" title={t("buttonHint")} onClick={() => setOpen(true)}>
        <ClipboardCheck />
        {t("button")}
      </Button>
      {open ? (
        <ReturnCheckDialog
          onClose={() => setOpen(false)}
          onSaved={(check) => {
            setOpen(false);
            onSaved(check);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 【核对与结算】 (JB278 第 1 点, JB280 第 2 点): one button that opens either
 * step - 「核对」 the records waiting, 「结算」 the checks done. It opens on the
 * step of the tab it sits on. `permission` is who may do it.
 */
export function ReconcileSettleButton({
  kind,
  step,
  permission,
  onChecked,
  onSettled,
}: {
  kind: ReconKind;
  step: "check" | "settle";
  permission: string;
  onChecked: (check: ReturnCheck) => void;
  onSettled: (settlement: Settlement) => void;
}) {
  const tj = useTranslations("jb278");
  const t295 = useTranslations("jb295");
  const t298 = useTranslations("jb298");
  const { can, user } = useAuth();
  const [open, setOpen] = useState<"check" | "settle" | null>(null);
  if (!officeMay(user, can, permission)) return null;
  return (
    <>
      <Button data-slot="reconcile-settle-button" title={tj("issueButtonHint")} onClick={() => setOpen(step)}>
        <ClipboardCheck />
        {tj("issueButton")}
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
          <DialogContent data-slot="reconcile-settle-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
            <DialogHeader>
              <DialogTitle>
                {kind === "CLAIM"
                  ? t298("checkTitle")
                  : kind === "LABOUR"
                    ? t295("checkTitle")
                    : kind === "RENTAL"
                      ? tj("rentalTitle")
                      : tj("issueTitle")}
              </DialogTitle>
              <DialogDescription>{tj("resultOnly")}</DialogDescription>
            </DialogHeader>
            <div role="tablist" className="inline-flex self-start rounded-lg border bg-muted/40 p-1">
              {(["check", "settle"] as const).map((each) => (
                <Button
                  key={each}
                  role="tab"
                  aria-selected={open === each}
                  variant={open === each ? "default" : "ghost"}
                  className="h-10 px-5 text-base"
                  data-slot={`reconcile-step-${each}`}
                  onClick={() => setOpen(each)}
                >
                  {each === "check" ? tj("stepCheck") : tj("stepSettle")}
                </Button>
              ))}
            </div>
            {open === "check" ? (
              <CheckPicker
                kind={kind}
                onSaved={(check) => {
                  setOpen(null);
                  onChecked(check);
                }}
              />
            ) : (
              <SettlePicker
                kind={kind}
                onSaved={(settlement) => {
                  setOpen(null);
                  onSettled(settlement);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** 【结算】 on the returns' 「已核对」 (JB278): the same step as 领用's. */
export function SettleButton({
  kind,
  permission,
  onSaved,
}: {
  kind: ReconKind;
  permission: string;
  onSaved: (settlement: Settlement) => void;
}) {
  const tj = useTranslations("jb278");
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!officeMay(user, can, permission)) return null;
  return (
    <>
      <Button data-slot="settle-button" title={tj("settleHelp")} onClick={() => setOpen(true)}>
        <HandCoins />
        {tj("settleButton")}
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent data-slot="settle-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{tj("settleTitle")}</DialogTitle>
              <DialogDescription>{tj("resultOnly")}</DialogDescription>
            </DialogHeader>
            <SettlePicker
              kind={kind}
              onSaved={(settlement) => {
                setOpen(false);
                onSaved(settlement);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/**
 * The window 【退货核对】 opens: the suppliers with returns waiting (each with
 * how many; only one is chosen at once), then that supplier's returns to tick,
 * then the confirmation. Follows the top bar's project.
 */
export function ReturnCheckDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (check: ReturnCheck) => void;
}) {
  const t = useTranslations("returnChecks");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="return-check-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <CheckPicker kind="RETURN" onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

/** First the party (supplier / 所属公司 / equipment company), then its records. */
function CheckPicker({ kind, onSaved }: { kind: ReconKind; onSaved: (check: ReturnCheck) => void }) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const current = useCurrentProject();
  const project = current.active ? current.projectId : "";
  const suppliers = useQuery({
    queryKey: ["return-checks", "pending-suppliers", kind, project],
    queryFn: () => getPendingReturnSuppliers(project || undefined, kind),
  });
  const [picked, setPicked] = useState<PendingReturnSupplier | null>(null);
  const t295 = useTranslations("jb295");
  // JB295: 本公司 / 未填所属公司 come without a name; the screen words them.
  const list = (suppliers.data?.results ?? []).map((row) =>
    kind === "LABOUR" && !row.name
      ? { ...row, name: row.id === "self" ? t295("company.self") : t295("company.none") }
      : row,
  );
  // 「只有一家就直接选好」.
  const supplier = picked ?? (list.length === 1 ? list[0] : null);
  const t298 = useTranslations("jb298");
  const none =
    kind === "RETURN"
      ? t("noSuppliers")
      : kind === "ISSUE"
        ? tj("noCompanies")
        : kind === "LABOUR"
          ? t295("checkNoPending")
          : kind === "CLAIM"
            ? t298("checkNoPending")
            : tj("rentalNoPending");
  const choose =
    kind === "RETURN"
      ? t("chooseSupplier")
      : kind === "ISSUE"
        ? tj("chooseCompany")
        : kind === "LABOUR"
          ? t295("checkChooseCompany")
          : kind === "CLAIM"
            ? t298("checkChooseSub")
            : tj("chooseRentalCompany");
  return (
    <div className="space-y-4">
      {kind !== "RETURN" ? (
        <p className="text-sm text-muted-foreground">
          {kind === "ISSUE"
            ? tj("issueHelp")
            : kind === "LABOUR"
              ? t295("checkHelp")
              : kind === "CLAIM"
                ? t298("checkHelp")
                : tj("rentalHelp")}
        </p>
      ) : null}
      <QueryFailedNote query={suppliers} what={t("suppliersWhat")} />
      {suppliers.isLoading ? <Spinner /> : null}
      {suppliers.isSuccess && !list.length ? <EmptyNote>{none}</EmptyNote> : null}
      {list.length ? (
        <section className="space-y-2" data-slot="return-check-suppliers">
          <h3 className="text-sm font-semibold">{choose}</h3>
          <div className="flex flex-wrap gap-2">
            {list.map((row) => (
              <Button
                key={row.id}
                variant={supplier?.id === row.id ? "default" : "outline"}
                aria-pressed={supplier?.id === row.id}
                className="h-auto min-h-11 flex-col items-start gap-0 px-4 py-2 text-left"
                onClick={() => setPicked(row)}
              >
                <span className="text-base font-semibold">{row.name}</span>
                <span className="text-xs font-normal">{t("supplierCount", { count: row.count })}</span>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      {supplier && kind === "RETURN" ? (
        <SupplierPendingReturns key={supplier.id} supplier={supplier} project={project} onSaved={onSaved} />
      ) : null}
      {supplier && kind === "ISSUE" ? (
        <CompanyPendingIssues key={supplier.id} company={supplier} project={project} onSaved={onSaved} />
      ) : null}
      {supplier && kind === "RENTAL" ? (
        <CompanyPendingStatements key={supplier.id} company={supplier} project={project} onSaved={onSaved} />
      ) : null}
      {supplier && kind === "LABOUR" ? (
        <CompanyPendingLabourStatements key={supplier.id} company={supplier} project={project} onSaved={onSaved} />
      ) : null}
      {supplier && kind === "CLAIM" ? (
        <SubcontractorPendingClaims key={supplier.id} subcontractor={supplier} project={project} onSaved={onSaved} />
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <div className="grid min-h-24 place-items-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** One supplier's returns waiting to be checked - the badge's list (图 2). */
function SupplierPendingReturns({
  supplier,
  project,
  onSaved,
}: {
  supplier: { id: string; name: string };
  project: string;
  onSaved: (check: ReturnCheck) => void;
}) {
  const t = useTranslations("returnChecks");
  const returns = useQuery({
    queryKey: ["suppliers", "returns", supplier.id, { project }],
    queryFn: () => getSupplierReturns(supplier.id, project ? { project } : {}),
  });
  const rows = returns.data?.results ?? [];
  return (
    <section className="space-y-3" data-slot="return-check-pick">
      <div>
        <h3 className="text-base font-semibold">{t("pickTitle", { name: supplier.name })}</h3>
        <p className="text-sm text-muted-foreground">{t("pickHelp")}</p>
      </div>
      <QueryFailedNote query={returns} what={t("returnsWhat")} />
      {returns.isLoading ? <Spinner /> : null}
      {returns.isSuccess && !rows.length ? <EmptyNote>{t("noReturns")}</EmptyNote> : null}
      {rows.length ? (
        <ReturnCheckForm
          supplier={supplier}
          rows={rows}
          truncated={
            returns.data?.truncated
              ? { shown: returns.data.count, total: returns.data.total ?? returns.data.count }
              : null
          }
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

/** One 所属公司's 材料领用 waiting to be checked (JB278). */
function CompanyPendingIssues({
  company,
  project,
  onSaved,
}: {
  company: { id: string; name: string };
  project: string;
  onSaved: (check: ReturnCheck) => void;
}) {
  const tj = useTranslations("jb278");
  const issues = useQuery({
    queryKey: ["return-checks", "pending-issues", company.id, project],
    queryFn: () => getPendingIssues(company.id, project || undefined),
  });
  const rows = issues.data?.results ?? [];
  return (
    <section className="space-y-3" data-slot="issue-check-pick">
      <div>
        <h3 className="text-base font-semibold">{tj("issuesPickTitle", { name: company.name })}</h3>
        <p className="text-sm text-muted-foreground">{tj("issuesPickHelp")}</p>
      </div>
      <QueryFailedNote query={issues} what={tj("issuesWhat")} />
      {issues.isLoading ? <Spinner /> : null}
      {issues.isSuccess && !rows.length ? <EmptyNote>{tj("noIssues")}</EmptyNote> : null}
      {rows.length ? (
        <CheckConfirmForm
          kind="ISSUE"
          party={company}
          ids={rows.map((row) => row.id)}
          tickFirst={tj("tickIssuesFirst")}
          truncated={issues.data?.truncated ? { shown: issues.data.count, total: issues.data.total } : null}
          table={(selection) => <IssueRowsTable rows={rows} selection={selection} />}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

/** One equipment company's statements waiting to be checked (JB280). */
function CompanyPendingStatements({
  company,
  project,
  onSaved,
}: {
  company: { id: string; name: string };
  project: string;
  onSaved: (check: ReturnCheck) => void;
}) {
  const tj = useTranslations("jb278");
  const query = { state: "PENDING", supplier: company.id, page_size: 100, ...(project ? { project } : {}) };
  const statements = useQuery({
    queryKey: ["rental-statements", "pending", query],
    queryFn: () => getRentalStatements(query),
  });
  const rows = statements.data?.results ?? [];
  return (
    <section className="space-y-3" data-slot="rental-check-pick">
      <div>
        <h3 className="text-base font-semibold">{tj("rentalPickTitle", { name: company.name })}</h3>
        <p className="text-sm text-muted-foreground">{tj("rentalPickHelp")}</p>
      </div>
      <QueryFailedNote query={statements} what={tj("rentalWhat")} />
      {statements.isLoading ? <Spinner /> : null}
      {statements.isSuccess && !rows.length ? <EmptyNote>{tj("rentalNoPending")}</EmptyNote> : null}
      {rows.length ? (
        <CheckConfirmForm
          kind="RENTAL"
          party={company}
          ids={rows.map((row) => row.id)}
          tickFirst={tj("rentalTickFirst")}
          truncated={null}
          table={(selection) => <StatementRowsTable rows={rows} selection={selection} />}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

/** One 所属公司's 人工结算单 waiting to be checked (JB295). */
function CompanyPendingLabourStatements({
  company,
  project,
  onSaved,
}: {
  company: { id: string; name: string };
  project: string;
  onSaved: (check: ReturnCheck) => void;
}) {
  const t295 = useTranslations("jb295");
  const query = { state: "pending" as const, company: company.id, ...(project ? { project } : {}) };
  const statements = useQuery({
    queryKey: ["labour-statements", "pending", query],
    queryFn: () => getLabourStatements(query),
  });
  const rows = statements.data?.rows ?? [];
  return (
    <section className="space-y-3" data-slot="labour-check-pick">
      <div>
        <h3 className="text-base font-semibold">{t295("checkPickTitle", { name: company.name })}</h3>
        <p className="text-sm text-muted-foreground">{t295("checkPickHelp")}</p>
      </div>
      <QueryFailedNote query={statements} what={t295("checkWhat")} />
      {statements.isLoading ? <Spinner /> : null}
      {statements.isSuccess && !rows.length ? <EmptyNote>{t295("checkNoPending")}</EmptyNote> : null}
      {rows.length ? (
        <CheckConfirmForm
          kind="LABOUR"
          party={company}
          ids={rows.map((row) => row.id)}
          tickFirst={t295("checkTickFirst")}
          truncated={null}
          table={(selection) => <LabourStatementRowsTable rows={rows} selection={selection} />}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

/** A 核对金额 as typed: a number above 0 with at most two decimals, or null. */
export function claimAmountValue(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/** One claim's 核对金额 and reason while ticking (JB298). */
export interface ClaimAmountEdit {
  amount: string;
  reason: string;
}

/** Whether a typed 核对金额 differs from the 批准金额. */
export function claimAmountChanged(row: { approved_amount: string | null }, edit: ClaimAmountEdit | undefined): boolean {
  if (!edit) return false;
  const typed = claimAmountValue(edit.amount);
  return typed === null || typed !== Number(row.approved_amount ?? 0);
}

/**
 * One 分包商's Progress Claims waiting to be checked (JB298): each with its
 * 批准金额 and a 核对金额 box that starts at it; a changed amount asks why and
 * shows both. Then the shared confirmation (凭证编号 + voucher + PIN).
 */
function SubcontractorPendingClaims({
  subcontractor,
  project,
  onSaved,
}: {
  subcontractor: { id: string; name: string };
  project: string;
  onSaved: (check: ReturnCheck) => void;
}) {
  const t298 = useTranslations("jb298");
  const claims = useQuery({
    queryKey: ["evidence-packages", "claims-pending", subcontractor.id, project],
    queryFn: () => getPendingClaims(subcontractor.id, project || undefined),
  });
  const rows = claims.data?.results ?? [];
  const [edits, setEdits] = useState<Record<string, ClaimAmountEdit>>({});
  const editOf = (row: ClaimCheckRow) => edits[row.id] ?? { amount: row.approved_amount ?? "", reason: "" };
  const amounts = rows.map((row) => {
    const edit = editOf(row);
    return { id: row.id, amount: edit.amount.replace(/,/g, "").trim(), reason: edit.reason.trim() };
  });
  return (
    <section className="space-y-3" data-slot="claim-check-pick">
      <div>
        <h3 className="text-base font-semibold">{t298("checkPickTitle", { name: subcontractor.name })}</h3>
        <p className="text-sm text-muted-foreground">{t298("checkPickHelp")}</p>
      </div>
      <QueryFailedNote query={claims} what={t298("checkWhat")} />
      {claims.isLoading ? <Spinner /> : null}
      {claims.isSuccess && !rows.length ? <EmptyNote>{t298("checkNoPending")}</EmptyNote> : null}
      {rows.length ? (
        <CheckConfirmForm
          kind="CLAIM"
          party={subcontractor}
          ids={rows.map((row) => row.id)}
          tickFirst={t298("checkTickFirst")}
          truncated={null}
          amounts={amounts}
          extraRequires={(picked) =>
            rows
              .filter((row) => picked.includes(row.id))
              .flatMap((row): [unknown, string][] => {
                const edit = editOf(row);
                if (claimAmountValue(edit.amount) === null)
                  return [[false, t298("amountInvalidFor", { reference: row.package_no })]];
                if (claimAmountChanged(row, edit) && !edit.reason.trim())
                  return [[false, t298("reasonRequiredFor", { reference: row.package_no })]];
                return [];
              })
          }
          table={(selection) => (
            <ClaimRowsTable
              rows={rows}
              selection={selection}
              edits={edits}
              onEdit={(id, edit) => setEdits((previous) => ({ ...previous, [id]: edit }))}
            />
          )}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

/**
 * Progress Claims in a check or its pick list (JB298): 资料包｜期数｜申请日期｜
 * 审核归档｜批准金额｜核对金额 (and why it differs). While ticking (`onEdit`),
 * the 核对金额 is a box that starts at the 批准金额.
 */
export function ClaimRowsTable({
  rows,
  selection,
  edits,
  onEdit,
}: {
  rows: readonly ClaimCheckRow[];
  selection?: RowSelection;
  edits?: Record<string, ClaimAmountEdit>;
  onEdit?: (id: string, edit: ClaimAmountEdit) => void;
}) {
  const t298 = useTranslations("jb298");
  const df = useDateFormat();
  const month = (value: string | null) => (value ? value.slice(0, 7) : "—");
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TickHead selection={selection} rows={rows} />
            <TableHead>{t298("col.package")}</TableHead>
            <TableHead>{t298("col.period")}</TableHead>
            <TableHead>{t298("col.appliedAt")}</TableHead>
            <TableHead>{t298("col.archivedAt")}</TableHead>
            <TableHead className="text-right">{t298("col.approved")}</TableHead>
            <TableHead className="min-w-56 text-right">{t298("col.checked")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const editing = Boolean(onEdit);
            const edit = edits?.[row.id] ?? { amount: row.approved_amount ?? "", reason: "" };
            const changed = editing
              ? claimAmountChanged(row, edit)
              : row.checked_amount != null && Number(row.checked_amount) !== Number(row.approved_amount ?? 0);
            return (
              <TableRow key={row.id} data-slot="claim-check-row" className="align-top">
                <TickCell selection={selection} id={row.id} reference={row.package_no} />
                <TableCell>
                  <span className="block text-xs text-muted-foreground tabular">{row.package_no}</span>
                  <span className="font-medium">{row.name}</span>
                  {row.category_name ? (
                    <span className="block text-xs text-muted-foreground">{row.category_name}</span>
                  ) : null}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap">{month(row.claim_period)}</TableCell>
                <TableCell className="tabular whitespace-nowrap">{df.date(row.created_at)}</TableCell>
                <TableCell className="tabular whitespace-nowrap">
                  {row.completed_at ? df.date(row.completed_at) : "—"}
                </TableCell>
                <TableCell className="tabular text-right font-semibold">{row.approved_amount ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {editing ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <Input
                        inputMode="decimal"
                        className="w-40 text-right tabular"
                        aria-label={t298("checkedAmountFor", { reference: row.package_no })}
                        data-slot="claim-checked-amount"
                        value={edit.amount}
                        onChange={(event) => onEdit?.(row.id, { ...edit, amount: event.target.value })}
                      />
                      {changed ? (
                        <>
                          <span className="text-xs text-warning" data-slot="claim-amount-changed">
                            {t298("bothAmounts", { approved: row.approved_amount ?? "—", checked: edit.amount || "—" })}
                          </span>
                          <Input
                            className="w-56"
                            maxLength={2000}
                            placeholder={t298("reasonPlaceholder")}
                            aria-label={t298("reasonFor", { reference: row.package_no })}
                            data-slot="claim-checked-reason"
                            value={edit.reason}
                            onChange={(event) => onEdit?.(row.id, { ...edit, reason: event.target.value })}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="tabular font-semibold">{row.checked_amount ?? "—"}</span>
                      {changed ? (
                        <span className="text-xs text-warning">
                          {t298("bothAmounts", { approved: row.approved_amount ?? "—", checked: row.checked_amount ?? "—" })}
                          {row.checked_reason ? ` · ${row.checked_reason}` : ""}
                        </span>
                      ) : null}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Now, to the minute: 「自动显示…日期及时间」 while the window is open. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** A tick per row and 「全选」 - the picking lists' shared selection. */
export interface RowSelection {
  chosen: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

/**
 * Tick, then confirm (做法 2、3): the supplier's returns with a tick each and
 * 全选; once one is ticked, 核对人 and the date and time (not typed), 凭证编号
 * and the vouchers (both required, JB277), the remark and 【确认核对】 - which
 * the server answers with the PIN dialog. Nothing of the returns is typed
 * again, and there is no price.
 */
export function ReturnCheckForm({
  supplier,
  rows,
  truncated,
  onSaved,
}: {
  supplier: { id: string; name: string };
  rows: readonly MaterialOutgoing[];
  truncated: { shown: number; total: number } | null;
  onSaved: (check: ReturnCheck) => void;
}) {
  const t = useTranslations("returnChecks");
  return (
    <CheckConfirmForm
      kind="RETURN"
      party={supplier}
      ids={rows.map((row) => row.id)}
      tickFirst={t("tickFirst")}
      truncated={truncated}
      table={(selection) => <SupplierReturnsTable rows={rows} selection={selection} />}
      onSaved={onSaved}
    />
  );
}

/** The confirmation every kind shares (做法 3 + JB277). */
function CheckConfirmForm({
  kind,
  party,
  ids,
  tickFirst,
  truncated,
  table,
  onSaved,
  amounts,
  extraRequires,
}: {
  kind: ReconKind;
  party: { id: string; name: string };
  ids: readonly string[];
  tickFirst: string;
  truncated: { shown: number; total: number } | null;
  table: (selection: RowSelection) => React.ReactNode;
  onSaved: (check: ReturnCheck) => void;
  /** JB298: each ticked claim's 核对金额 and reason. */
  amounts?: readonly { id: string; amount: string; reason: string }[];
  /** JB298: what else must be right before 【确认核对】 (the button says it). */
  extraRequires?: (picked: readonly string[]) => [unknown, string][];
}) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [voucherNo, setVoucherNo] = useState("");
  const [note, setNote] = useState("");
  // Only what is still listed: a row checked meanwhile drops out.
  const picked = ids.filter((id) => chosen.has(id));
  const save = useMutation({
    mutationFn: () =>
      createReturnCheck({
        kind,
        supplier: party.id,
        returns: picked,
        voucherNo,
        note,
        files,
        amounts: amounts?.filter((row) => picked.includes(row.id)),
      }),
    onSuccess: (check) => {
      for (const key of RETURN_CHECK_STALE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
      onSaved(check);
    },
    // A refusal is said by the API client in the reader's words; a closed
    // PIN dialog does nothing, and the window stays as it was.
  });
  const toggle = (id: string) =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setChosen(picked.length === ids.length ? new Set() : new Set(ids));

  return (
    <div className="space-y-4" data-slot="return-check-form">
      {truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
          {t("truncated", truncated)}
        </p>
      ) : null}
      {table({ chosen: new Set(picked), onToggle: toggle, onToggleAll: toggleAll })}
      {picked.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-slot="return-check-tick-first">
          {tickFirst}
        </p>
      ) : (
        <section className="space-y-4 rounded-xl border bg-muted/20 p-4" data-slot="return-check-confirm">
          <h3 className="text-base font-semibold">
            {t("confirmTitle")} · {t("chosen", { count: picked.length })}
          </h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t("checker")}</dt>
              <dd className="text-base font-semibold" data-slot="return-check-checker">
                {user?.full_name || user?.email || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("checkedAt")}</dt>
              <dd className="tabular text-base font-semibold" data-slot="return-check-now">
                {df.dateTime(now)}
              </dd>
            </div>
          </dl>
          <VoucherFields
            voucherNo={voucherNo}
            onVoucherNo={setVoucherNo}
            files={files}
            onFiles={setFiles}
            disabled={save.isPending}
          />
          <FieldWrapper label={t("note")} optional={common("optional")}>
            <Textarea
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder={t("notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          <p className="text-xs text-muted-foreground">
            {kind === "RETURN" ? t("noPrice") : tj("resultOnly")} {t("confirmPin")}
          </p>
          <div className="flex justify-end">
            <Button
              size="lg"
              data-slot="return-check-confirm-button"
              // JB277: 「以上两项缺少任何一项，系统均不得允许确认核对」 - the
              // button says what is missing; the server refuses it too.
              requires={[
                ...(extraRequires ? extraRequires(picked) : []),
                [voucherNo.trim(), tj("voucherNo")],
                [files.length > 0, tj("vouchersRequired")],
              ]}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
              {t("confirm")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * 凭证编号 (its own box, required) and 上传凭证 (photo or PDF, required) -
 * JB277 for 核对, and the same for 结算 (JB278 / JB280 第 4 点).
 */
function VoucherFields({
  voucherNo,
  onVoucherNo,
  files,
  onFiles,
  disabled,
}: {
  voucherNo: string;
  onVoucherNo: (value: string) => void;
  files: File[];
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const tj = useTranslations("jb278");
  return (
    <>
      <FieldWrapper label={tj("voucherNo")} required hint={tj("voucherNoHint")}>
        <Input
          value={voucherNo}
          maxLength={VOUCHER_NO_MAX}
          placeholder={tj("voucherNoPlaceholder")}
          data-slot="voucher-no"
          disabled={disabled}
          onChange={(event) => onVoucherNo(event.target.value)}
        />
      </FieldWrapper>
      <FieldWrapper
        label={tj("vouchersRequired")}
        required
        hint={tj("vouchersRequiredHint", { count: RETURN_CHECK_MAX_FILES, limit: RETURN_CHECK_MAX_MB })}
      >
        <AttachmentPicker
          files={files}
          onChange={onFiles}
          showLimits={false}
          disabled={disabled}
          rule={{
            accept: ATTACHMENT_ACCEPT,
            maxFiles: RETURN_CHECK_MAX_FILES,
            maxBytes: RETURN_CHECK_MAX_MB * 1024 * 1024,
            multiple: true,
          }}
        />
      </FieldWrapper>
      <p className="text-xs text-muted-foreground" data-slot="voucher-fixed">
        {tj("voucherFixed")}
      </p>
    </>
  );
}

function TickHead({ selection, rows }: { selection?: RowSelection; rows: readonly { id: string }[] }) {
  const checks = useTranslations("returnChecks");
  if (!selection) return null;
  const all = rows.length > 0 && rows.every((row) => selection.chosen.has(row.id));
  const some = rows.some((row) => selection.chosen.has(row.id));
  return (
    <TableHead className="w-24">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold">
        <Checkbox
          data-slot="recon-select-all"
          checked={all ? true : some ? "indeterminate" : false}
          onCheckedChange={() => selection.onToggleAll()}
          aria-label={checks("selectAll")}
        />
        {checks("selectAll")}
      </label>
    </TableHead>
  );
}

function TickCell({ selection, id, reference }: { selection?: RowSelection; id: string; reference: string }) {
  const checks = useTranslations("returnChecks");
  if (!selection) return null;
  return (
    <TableCell>
      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center">
        <Checkbox
          data-slot="recon-select-row"
          checked={selection.chosen.has(id)}
          onCheckedChange={() => selection.onToggle(id)}
          aria-label={checks("selectRow", { reference })}
        />
      </label>
    </TableCell>
  );
}

/**
 * 材料领用 in a check or its pick list (JB278): 日期｜领用编号｜项目｜材料及数量｜
 * 所属公司｜设备编号｜领用人｜金额. A row opens the original record (第 4 点).
 */
export function IssueRowsTable({ rows, selection }: { rows: readonly IssueCheckRow[]; selection?: RowSelection }) {
  const tj = useTranslations("jb278");
  // QA1 walk: 吨（Ton）, never the code TONNE (中英文统一).
  const unitName = useUnitName();
  const df = useDateFormat();
  const [opened, setOpened] = useState<string | null>(null);
  const money = rows.some((row) => row.amount !== null);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TickHead selection={selection} rows={rows} />
            <TableHead>{tj("col.date")}</TableHead>
            <TableHead>{tj("col.issueNo")}</TableHead>
            <TableHead>{tj("col.project")}</TableHead>
            <TableHead>{tj("col.materials")}</TableHead>
            <TableHead>{tj("col.company")}</TableHead>
            <TableHead>{tj("col.equipmentNo")}</TableHead>
            <TableHead>{tj("col.recipient")}</TableHead>
            {money ? <TableHead className="text-right">{tj("col.amount")}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-slot="issue-check-row"
              className="cursor-pointer"
              onClick={(event) => {
                if (clickOpensRow(event)) setOpened(row.id);
              }}
            >
              <TickCell selection={selection} id={row.id} reference={row.reference_no} />
              <TableCell className="tabular whitespace-nowrap">{df.date(row.at)}</TableCell>
              <TableCell className="font-medium text-primary">{row.reference_no}</TableCell>
              <TableCell>{row.project_name}</TableCell>
              <TableCell>
                {row.materials.map((line) => `${line.material} ${line.quantity} ${unitName(line.unit)}`).join("；")}
              </TableCell>
              <TableCell>{row.equipment_company}</TableCell>
              <TableCell>{row.equipment_no || "—"}</TableCell>
              <TableCell>{row.recipient_name || "—"}</TableCell>
              {money ? <TableCell className="tabular text-right">{row.amount ?? "—"}</TableCell> : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {opened ? <OutgoingDecision id={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}

/**
 * 设备租赁月结单 in a check or its pick list (JB280): 月结单编号｜项目｜日期｜
 * 台数｜租赁总金额. A row opens the statement (第 5 点).
 */
export function StatementRowsTable({
  rows,
  selection,
}: {
  rows: readonly RentalStatementRow[];
  selection?: RowSelection;
}) {
  const tr = useTranslations("jb280");
  const df = useDateFormat();
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TickHead selection={selection} rows={rows} />
            <TableHead>{tr("col.statementNo")}</TableHead>
            <TableHead>{tr("col.project")}</TableHead>
            <TableHead>{tr("col.period")}</TableHead>
            <TableHead className="text-right">{tr("col.machines")}</TableHead>
            <TableHead className="text-right">{tr("col.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-slot="statement-check-row"
              className="cursor-pointer"
              onClick={(event) => {
                if (clickOpensRow(event)) setOpened(row.id);
              }}
            >
              <TickCell selection={selection} id={row.id} reference={row.statement_no} />
              <TableCell className="font-medium text-primary">{row.statement_no}</TableCell>
              <TableCell>{row.project_name}</TableCell>
              <TableCell className="tabular whitespace-nowrap">
                {df.date(row.date_from)} – {df.date(row.date_to)}
              </TableCell>
              <TableCell className="tabular text-right">{tr("machinesValue", { count: row.machine_count })}</TableCell>
              <TableCell className="tabular text-right font-semibold">{row.rental_total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {opened ? <RentalStatementWindow id={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}

/**
 * 「已核对」: one line per check, newest first - 核对编号｜供应商｜笔数｜日期｜
 * 核对人｜查看 (做法 1), and its 凭证编号 (JB277). Since 结算 (JB278) only the
 * checks not settled yet are here; a settled one is under 「已结算」. A row or
 * 【查看】 opens it. Follows the top bar.
 */
export function ReturnChecksList({
  title,
  above,
  onOpen,
  kind = "RETURN",
}: {
  title: string;
  above?: React.ReactNode;
  onOpen: (id: string) => void;
  kind?: ReconKind;
}) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const df = useDateFormat();
  const list = useListQuery(["project"]);
  const query = { ...list.query, settled: "0" };
  const checks = useQuery({
    queryKey: ["return-checks", "list", kind, query],
    queryFn: () => getReturnChecks(query, kind),
  });
  const total = checks.data?.count ?? 0;
  const partyLabel = kind === "RETURN" ? t("column.supplier") : tj("col.party");
  const columns = useMemo<ColumnDef<ReturnCheckRow, unknown>[]>(
    () => [
      {
        accessorKey: "check_no",
        meta: { label: t("column.number") },
        header: () => <PlainHeader label={t("column.number")} />,
        cell: ({ row }) => (
          <span className="font-semibold text-foreground" data-slot="return-check-number">
            {row.original.check_no}
          </span>
        ),
      },
      {
        accessorKey: "supplier_name",
        meta: { label: partyLabel },
        header: () => <PlainHeader label={partyLabel} />,
        cell: ({ row }) => <span className="font-medium">{row.original.supplier_name}</span>,
      },
      {
        accessorKey: "return_count",
        meta: { label: t("column.count") },
        header: () => <PlainHeader label={t("column.count")} />,
        cell: ({ row }) => (
          <span className="tabular">{t("countValue", { count: row.original.return_count })}</span>
        ),
      },
      {
        accessorKey: "checked_at",
        meta: { label: t("column.date") },
        header: () => <PlainHeader label={t("column.date")} />,
        cell: ({ row }) => <span className="tabular">{df.dateTime(row.original.checked_at)}</span>,
      },
      {
        accessorKey: "checked_by_name",
        meta: { label: t("column.checker") },
        header: () => <PlainHeader label={t("column.checker")} />,
      },
      {
        accessorKey: "voucher_no",
        meta: { label: tj("voucherNo") },
        header: () => <PlainHeader label={tj("voucherNo")} />,
        cell: ({ row }) => <span>{row.original.voucher_no || "—"}</span>,
      },
      {
        id: "view",
        enableHiding: false,
        meta: { label: t("column.view") },
        header: () => <PlainHeader label={t("column.view")} />,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            data-slot="return-check-view"
            onClick={(event) => {
              // The row opens on click too; one open, not two.
              event.stopPropagation();
              onOpen(row.original.id);
            }}
          >
            <Eye className="size-3.5" />
            {t("view")}
          </Button>
        ),
      },
    ],
    [t, tj, df, onOpen, partyLabel],
  );
  return (
    <div className="flex flex-col gap-4 max-sm:[&>*]:shrink-0 sm:h-[calc(100dvh-5rem)]" data-slot="return-checks-list">
      <ListHeader title={title} subtitle={checks.isLoading ? "—" : t("count", { count: total })} />
      {above}
      {checks.isError ? <QueryFailedNote query={checks} what={t("listWhat")} /> : null}
      <DataTable
        columns={columns}
        rows={checks.data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={checks.isLoading}
        isError={checks.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey={`return-checks.${kind.toLowerCase()}.v2`}
        onRowClick={(row) => onOpen(row.id)}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}

/**
 * 「已结算」 (JB278 第 2 点): one line per settlement, newest first - 结算编号｜
 * 供应商 / 公司｜核对次数｜金额｜凭证编号｜日期｜结算人｜查看.
 */
export function SettlementsList({
  title,
  above,
  onOpen,
  kind,
}: {
  title: string;
  above?: React.ReactNode;
  onOpen: (id: string) => void;
  kind: ReconKind;
}) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const df = useDateFormat();
  const list = useListQuery(["project"]);
  const settlements = useQuery({
    queryKey: ["settlements", "list", kind, list.query],
    queryFn: () => getSettlements(kind, list.query),
  });
  const total = settlements.data?.count ?? 0;
  const money = (settlements.data?.results ?? []).some((row) => row.amount_total !== null);
  const partyLabel = kind === "RETURN" ? t("column.supplier") : tj("col.party");
  const columns = useMemo<ColumnDef<SettlementRow, unknown>[]>(() => {
    const amount: ColumnDef<SettlementRow, unknown>[] = money
      ? [
          {
            accessorKey: "amount_total",
            meta: { label: tj("amountTotal") },
            header: () => <PlainHeader label={tj("amountTotal")} />,
            cell: ({ row }) => <span className="tabular font-semibold">{row.original.amount_total ?? "—"}</span>,
          },
        ]
      : [];
    return [
      {
        accessorKey: "settlement_no",
        meta: { label: tj("col.settlementNo") },
        header: () => <PlainHeader label={tj("col.settlementNo")} />,
        cell: ({ row }) => (
          <span className="font-semibold text-foreground" data-slot="settlement-number">
            {row.original.settlement_no}
          </span>
        ),
      },
      {
        accessorKey: "party_name",
        meta: { label: partyLabel },
        header: () => <PlainHeader label={partyLabel} />,
      },
      {
        accessorKey: "check_count",
        meta: { label: tj("col.checks") },
        header: () => <PlainHeader label={tj("col.checks")} />,
        cell: ({ row }) => <span className="tabular">{tj("checksValue", { count: row.original.check_count })}</span>,
      },
      ...amount,
      {
        accessorKey: "voucher_no",
        meta: { label: tj("voucherNo") },
        header: () => <PlainHeader label={tj("voucherNo")} />,
      },
      {
        accessorKey: "settled_at",
        meta: { label: t("column.date") },
        header: () => <PlainHeader label={t("column.date")} />,
        cell: ({ row }) => <span className="tabular">{df.dateTime(row.original.settled_at)}</span>,
      },
      {
        accessorKey: "settled_by_name",
        meta: { label: tj("col.settledBy") },
        header: () => <PlainHeader label={tj("col.settledBy")} />,
      },
      {
        id: "view",
        enableHiding: false,
        meta: { label: t("column.view") },
        header: () => <PlainHeader label={t("column.view")} />,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            data-slot="settlement-view"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(row.original.id);
            }}
          >
            <Eye className="size-3.5" />
            {t("view")}
          </Button>
        ),
      },
    ];
  }, [t, tj, df, onOpen, money, partyLabel]);
  return (
    <div className="flex flex-col gap-4 max-sm:[&>*]:shrink-0 sm:h-[calc(100dvh-5rem)]" data-slot="settlements-list">
      <ListHeader title={title} subtitle={settlements.isLoading ? "—" : tj("settlementsCount", { count: total })} />
      {above}
      {settlements.isError ? <QueryFailedNote query={settlements} what={tj("settlementsWhat")} /> : null}
      <DataTable
        columns={columns}
        rows={settlements.data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={settlements.isLoading}
        isError={settlements.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey={`settlements.${kind.toLowerCase()}.v1`}
        onRowClick={(row) => onOpen(row.id)}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </div>
  );
}

/**
 * 【结算】's body (JB278 / JB280): the parties with checks waiting, then that
 * party's checks to tick (each with its 笔数, 凭证编号 and amount), then
 * 结算人 and time (not typed), 凭证编号 + vouchers (required), remark and
 * 【确认结算】 - PIN. Only the result is recorded; nothing is paid here.
 */
function SettlePicker({ kind, onSaved }: { kind: ReconKind; onSaved: (settlement: Settlement) => void }) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const t295 = useTranslations("jb295");
  const t298 = useTranslations("jb298");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow();
  const current = useCurrentProject();
  const project = current.active ? current.projectId : "";
  const offer = useQuery({
    queryKey: ["settlements", "settleable", kind, project],
    queryFn: () => getSettleable(kind, project || undefined),
  });
  const parties = offer.data?.results ?? [];
  const [picked, setPicked] = useState<SettleableParty | null>(null);
  const party = picked
    ? parties.find((row) => row.id === picked.id) ?? null
    : parties.length === 1
      ? parties[0]
      : null;
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [voucherNo, setVoucherNo] = useState("");
  const [note, setNote] = useState("");
  const ids = party?.checks.map((check) => check.id) ?? [];
  const ticked = ids.filter((id) => chosen.has(id));
  const money = party?.checks.some((check) => check.amount !== null) ?? false;
  const save = useMutation({
    mutationFn: () => createSettlement({ kind, checks: ticked, voucherNo, note, files }),
    onSuccess: (settlement) => {
      for (const key of RETURN_CHECK_STALE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
      onSaved(settlement);
    },
  });
  const toggle = (id: string) =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selection: RowSelection = {
    chosen: new Set(ticked),
    onToggle: toggle,
    onToggleAll: () => setChosen(ticked.length === ids.length ? new Set() : new Set(ids)),
  };
  return (
    <div className="space-y-4" data-slot="settle-picker">
      <p className="text-sm text-muted-foreground">{tj("settleHelp")}</p>
      <QueryFailedNote query={offer} what={tj("settlementsWhat")} />
      {offer.isLoading ? <Spinner /> : null}
      {offer.isSuccess && !parties.length ? <EmptyNote>{tj("settleNone")}</EmptyNote> : null}
      {parties.length ? (
        <section className="space-y-2">
          {/* 人工月结单 are settled per 所属公司 (QA295). */}
          <h3 className="text-sm font-semibold">
            {kind === "LABOUR" ? t295("checkChooseCompany") : kind === "CLAIM" ? t298("checkChooseSub") : tj("chooseParty")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {parties.map((row) => (
              <Button
                key={row.id}
                variant={party?.id === row.id ? "default" : "outline"}
                aria-pressed={party?.id === row.id}
                className="h-auto min-h-11 flex-col items-start gap-0 px-4 py-2 text-left"
                onClick={() => {
                  setPicked(row);
                  setChosen(new Set());
                }}
              >
                <span className="text-base font-semibold">{row.name}</span>
                <span className="text-xs font-normal">{tj("checksValue", { count: row.checks.length })}</span>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      {party ? (
        <section className="space-y-3" data-slot="settle-checks">
          <h3 className="text-base font-semibold">{tj("settleChecksTitle", { name: party.name })}</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TickHead selection={selection} rows={party.checks} />
                  <TableHead>{t("column.number")}</TableHead>
                  <TableHead>{t("column.count")}</TableHead>
                  <TableHead>{t("column.date")}</TableHead>
                  <TableHead>{t("column.checker")}</TableHead>
                  <TableHead>{tj("voucherNo")}</TableHead>
                  {money ? <TableHead className="text-right">{tj("col.amount")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {party.checks.map((check) => (
                  <TableRow key={check.id} data-slot="settle-check-row">
                    <TickCell selection={selection} id={check.id} reference={check.check_no} />
                    <TableCell className="font-medium">{check.check_no}</TableCell>
                    <TableCell className="tabular">{t("countValue", { count: check.count })}</TableCell>
                    <TableCell className="tabular">{df.dateTime(check.checked_at)}</TableCell>
                    <TableCell>{check.checked_by_name}</TableCell>
                    <TableCell>{check.voucher_no || "—"}</TableCell>
                    {money ? <TableCell className="tabular text-right">{check.amount ?? "—"}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {ticked.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tj("settleTickFirst")}</p>
          ) : (
            <section className="space-y-4 rounded-xl border bg-muted/20 p-4" data-slot="settle-confirm">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{tj("settler")}</dt>
                  <dd className="text-base font-semibold">{user?.full_name || user?.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("checkedAt")}</dt>
                  <dd className="tabular text-base font-semibold">{df.dateTime(now)}</dd>
                </div>
              </dl>
              <VoucherFields
                voucherNo={voucherNo}
                onVoucherNo={setVoucherNo}
                files={files}
                onFiles={setFiles}
                disabled={save.isPending}
              />
              <FieldWrapper label={t("note")} optional={common("optional")}>
                <Textarea
                  value={note}
                  maxLength={NOTE_MAX}
                  rows={2}
                  placeholder={t("notePlaceholder")}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FieldWrapper>
              <p className="text-xs text-muted-foreground">
                {tj("resultOnly")} {tj("settlePin")}
              </p>
              <div className="flex justify-end">
                <Button
                  size="lg"
                  data-slot="settle-confirm-button"
                  requires={[
                    [voucherNo.trim(), tj("voucherNo")],
                    [files.length > 0, tj("vouchersRequired")],
                  ]}
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? <Loader2 className="animate-spin" /> : <HandCoins />}
                  {tj("confirmSettle")}
                </Button>
              </div>
            </section>
          )}
        </section>
      ) : null}
    </div>
  );
}

/**
 * 查看 one check (做法 6): on top every record it ticked (each opens its own
 * record, closing comes back here), below the shared 核对人, time, 凭证编号,
 * remark and vouchers, and its 结算 if any (opens it); the four file buttons
 * on 「退货核对单」 / 「材料领用核对单」. Nothing can be changed.
 */
export function ReturnCheckWindow({
  id,
  onClose,
  kind = "RETURN",
}: {
  id: string;
  onClose: () => void;
  kind?: ReconKind;
}) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const t295 = useTranslations("jb295");
  const t298 = useTranslations("jb298");
  const locale = useLocale();
  const df = useDateFormat();
  const check = useQuery({ queryKey: ["return-checks", "detail", kind, id], queryFn: () => getReturnCheck(id, kind) });
  const data = check.data;
  const shown: ReconKind = data?.kind ?? kind;
  const [settlementOpen, setSettlementOpen] = useState<string | null>(null);
  const title = data
    ? shown === "ISSUE"
      ? tj("issueWindowTitle", { number: data.check_no })
      : shown === "RENTAL"
        ? tj("rentalWindowTitle", { number: data.check_no })
        : shown === "LABOUR"
          ? t295("checkWindowTitle", { number: data.check_no })
          : shown === "CLAIM"
            ? t298("checkWindowTitle", { number: data.check_no })
            : t("windowTitle", { number: data.check_no })
    : t("title");
  // JB298: like the statements, a claim check has no PDF of its own here.
  const noPdf = shown === "RENTAL" || shown === "LABOUR" || shown === "CLAIM";
  const count = data
    ? (shown === "ISSUE"
        ? (data.issues ?? []).length
        : shown === "RENTAL" || shown === "LABOUR"
          ? (data.statements ?? []).length
          : shown === "CLAIM"
            ? (data.claims ?? []).length
            : (data.returns ?? []).length) + data.hidden_count
    : 0;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="return-check-window" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {data ? `${data.supplier_name} · ${t("countValue", { count: data.return_count })}` : t("help")}
          </DialogDescription>
        </DialogHeader>
        {check.isError ? <RecordWindowFailure query={check} what={t("what")} /> : null}
        {check.isLoading ? <Spinner /> : null}
        {data ? (
          <div className="space-y-5">
            {/* 预览 · 打印 · 导出 · 发送 - the PIN for all but 预览 (JB27). */}
            {!noPdf ? (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <FileActionButtons
                  label={shown === "ISSUE" ? tj("issuePdf") : t("pdf")}
                  source={{
                    load: () => returnCheckPdfFile(data.id, locale, data.check_no),
                    title:
                      shown === "ISSUE"
                        ? tj("issuePdfTitle", { number: data.check_no })
                        : t("pdfTitle", { number: data.check_no }),
                    // 打印 · 导出 · 发送 fetch it again with the PIN's grant, so
                    // the server sees each one; the log row names this check.
                    exportedOnServer: true,
                    recordKind: "MATERIAL_RETURN_CHECK",
                    recordId: data.id,
                    project: data.project ?? undefined,
                  }}
                />
              </div>
            ) : null}
            <section className="space-y-2" data-slot="return-check-returns">
              <div>
                <h3 className="text-base font-semibold">
                  {shown === "ISSUE"
                    ? tj("issuesTitle", { count })
                    : shown === "RENTAL"
                      ? tj("rentalStatementsTitle", { count })
                      : shown === "LABOUR"
                        ? t295("checkStatementsTitle", { count })
                        : shown === "CLAIM"
                          ? t298("checkClaimsTitle", { count })
                          : t("returnsTitle", { count })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {shown === "ISSUE"
                    ? tj("issuesHelp")
                    : shown === "RENTAL" || shown === "LABOUR"
                      ? tj("rentalStatementsHelp")
                      : shown === "CLAIM"
                        ? t298("checkClaimsHelp")
                        : t("returnsHelp")}
                </p>
              </div>
              {shown === "ISSUE" ? <IssueRowsTable rows={data.issues ?? []} /> : null}
              {shown === "RENTAL" ? <StatementRowsTable rows={data.statements ?? []} /> : null}
              {shown === "LABOUR" ? (
                <LabourStatementRowsTable rows={(data.statements ?? []) as unknown as LabourStatementSummary[]} />
              ) : null}
              {shown === "CLAIM" ? <ClaimRowsTable rows={data.claims ?? []} /> : null}
              {shown === "RETURN" ? <SupplierReturnsTable rows={data.returns} /> : null}
              {data.hidden_count ? (
                <p className="text-sm text-muted-foreground" data-slot="return-check-hidden">
                  {t("hidden", { count: data.hidden_count })}
                </p>
              ) : null}
            </section>
            <section className="space-y-3 rounded-xl border p-4" data-slot="return-check-details">
              <h3 className="text-base font-semibold">{t("detailsTitle")}</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("checker")}</dt>
                  <dd className="text-base font-semibold">{data.checked_by_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("checkedAt")}</dt>
                  <dd className="tabular text-base font-semibold">{df.dateTime(data.checked_at)}</dd>
                </div>
                {/* JB277: 凭证编号 on its own line, never in 备注. */}
                <div>
                  <dt className="text-xs text-muted-foreground">{tj("voucherNo")}</dt>
                  <dd className="text-base font-semibold" data-slot="return-check-voucher-no">
                    {data.voucher_no || tj("oldNoVoucher")}
                  </dd>
                </div>
                {data.amount_total ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{tj("amountTotal")}</dt>
                    <dd className="tabular text-base font-semibold">{data.amount_total}</dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                  <dd className="whitespace-pre-wrap">{data.note || t("noNote")}</dd>
                </div>
                {/* JB278: its 结算, which opens - or 未结算. */}
                <div className="sm:col-span-2" data-slot="return-check-settlement">
                  <dt className="text-xs text-muted-foreground">{tj("panelSettleState")}</dt>
                  <dd>
                    {data.settlement ? (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-base font-semibold"
                        onClick={() => setSettlementOpen(data.settlement?.id ?? null)}
                      >
                        {tj("stateSettled")} · {data.settlement.settlement_no} · {data.settlement.settled_by_name} ·{" "}
                        {df.dateTime(data.settlement.settled_at)}
                      </Button>
                    ) : (
                      <span>{tj("stateNotSettled")}</span>
                    )}
                  </dd>
                </div>
              </dl>
              <RecordAttachmentsPanel
                kind="MATERIAL_RETURN_CHECK"
                recordId={data.id}
                readOnly
                title={t("vouchers")}
                hint={t("vouchersHint")}
              />
            </section>
            {/* 发送记录 (JB65): every send of this check, to whom and whether it went. */}
            {!noPdf ? <RecordSendLog recordKind="MATERIAL_RETURN_CHECK" recordId={data.id} /> : null}
            {noPdf ? <p className="text-xs text-muted-foreground">{tj("resultOnly")}</p> : null}
          </div>
        ) : null}
        {settlementOpen ? (
          <SettlementWindow id={settlementOpen} kind={shown} onClose={() => setSettlementOpen(null)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 查看 one 结算 (JB278 / JB280): its checks (each opens its 核对, which opens
 * the original records), 结算人, time, 凭证编号, amount, remark and vouchers.
 * Nothing can be changed.
 */
export function SettlementWindow({ id, kind, onClose }: { id: string; kind: ReconKind; onClose: () => void }) {
  const t = useTranslations("returnChecks");
  const tj = useTranslations("jb278");
  const df = useDateFormat();
  const settlement = useQuery({
    queryKey: ["settlements", "detail", kind, id],
    queryFn: () => getSettlement(id, kind),
  });
  const data = settlement.data;
  const [checkOpen, setCheckOpen] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="settlement-window" className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {data ? tj("settlementWindowTitle", { number: data.settlement_no }) : tj("settleTitle")}
          </DialogTitle>
          <DialogDescription>{data ? data.party_name : tj("resultOnly")}</DialogDescription>
        </DialogHeader>
        {settlement.isError ? <RecordWindowFailure query={settlement} what={tj("settlementWhat")} /> : null}
        {settlement.isLoading ? <Spinner /> : null}
        {data ? (
          <div className="space-y-5">
            <section className="space-y-2">
              <div>
                <h3 className="text-base font-semibold">
                  {tj("settlementChecksTitle", { count: data.checks.length + data.hidden_count })}
                </h3>
                <p className="text-sm text-muted-foreground">{tj("settlementChecksHelp")}</p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("column.number")}</TableHead>
                      <TableHead>{t("column.count")}</TableHead>
                      <TableHead>{t("column.date")}</TableHead>
                      <TableHead>{t("column.checker")}</TableHead>
                      <TableHead>{tj("voucherNo")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.checks.map((check) => (
                      <TableRow
                        key={check.id}
                        data-slot="settlement-check-row"
                        className="cursor-pointer"
                        onClick={() => setCheckOpen(check.id)}
                      >
                        <TableCell className="font-medium text-primary">{check.check_no}</TableCell>
                        <TableCell className="tabular">{t("countValue", { count: check.return_count })}</TableCell>
                        <TableCell className="tabular">{df.dateTime(check.checked_at)}</TableCell>
                        <TableCell>{check.checked_by_name}</TableCell>
                        <TableCell>{check.voucher_no || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {data.hidden_count ? (
                <p className="text-sm text-muted-foreground">{tj("settlementHidden", { count: data.hidden_count })}</p>
              ) : null}
            </section>
            <section className="space-y-3 rounded-xl border p-4" data-slot="settlement-details">
              <h3 className="text-base font-semibold">{tj("settlementDetails")}</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{tj("settler")}</dt>
                  <dd className="text-base font-semibold">{data.settled_by_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("checkedAt")}</dt>
                  <dd className="tabular text-base font-semibold">{df.dateTime(data.settled_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{tj("voucherNo")}</dt>
                  <dd className="text-base font-semibold">{data.voucher_no}</dd>
                </div>
                {data.amount_total ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{tj("amountTotal")}</dt>
                    <dd className="tabular text-base font-semibold">{data.amount_total}</dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                  <dd className="whitespace-pre-wrap">{data.note || t("noNote")}</dd>
                </div>
              </dl>
              <RecordAttachmentsPanel
                kind="MATERIAL_SETTLEMENT"
                recordId={data.id}
                readOnly
                title={t("vouchers")}
                hint={tj("settlementVouchersHint")}
              />
              <p className="text-xs text-muted-foreground">{tj("resultOnly")}</p>
            </section>
          </div>
        ) : null}
        {checkOpen ? <ReturnCheckWindow id={checkOpen} kind={kind} onClose={() => setCheckOpen(null)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** What an original record says about its 核对 / 结算 (JB278 第 3 点). */
export interface ReconciliationLinks {
  state: "CHECKED" | "SETTLED";
  kind: ReconKind;
  check_id: string;
  check_no: string;
  checked_by_name: string;
  checked_at: string;
  settlement_id: string | null;
  settlement_no: string;
  settled_by_name: string;
  settled_at: string | null;
}

/**
 * Under 「已归档」 of a 材料退场 / 材料领用 record (JB278 第 3、4 点): 核对状态,
 * 核对编号 (opens the check), 核对人及日期, 结算状态, 结算编号 (opens the
 * settlement). Read only: it never changes the record (第 7 点).
 */
export function ReconciliationPanel({
  links,
  noCompany = false,
}: {
  links: ReconciliationLinks | null | undefined;
  /** A 材料领用 with no 所属公司: not offered for 核对 until it is filled in. */
  noCompany?: boolean;
}) {
  const tj = useTranslations("jb278");
  const df = useDateFormat();
  const [open, setOpen] = useState<"check" | "settlement" | null>(null);
  return (
    <section className="rounded-lg border bg-card p-3" data-slot="reconciliation-panel">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tj("panelTitle")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{tj("panelState")}</dt>
        <dd className="font-medium" data-slot="reconciliation-state">
          {links ? tj("stateChecked") : noCompany ? tj("stateNoCompany") : tj("statePending")}
        </dd>
        <dt className="text-muted-foreground">{tj("panelCheckNo")}</dt>
        <dd>
          {links ? (
            <Button
              variant="link"
              className="h-auto p-0 font-semibold"
              data-slot="reconciliation-check-link"
              onClick={() => setOpen("check")}
            >
              {links.check_no}
            </Button>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-muted-foreground">{tj("panelChecker")}</dt>
        <dd className="font-medium">{links ? `${links.checked_by_name} · ${df.dateTime(links.checked_at)}` : "—"}</dd>
        <dt className="text-muted-foreground">{tj("panelSettleState")}</dt>
        <dd className="font-medium" data-slot="reconciliation-settle-state">
          {links?.state === "SETTLED" ? tj("stateSettled") : tj("stateNotSettled")}
        </dd>
        <dt className="text-muted-foreground">{tj("panelSettlementNo")}</dt>
        <dd>
          {links?.settlement_id ? (
            <Button
              variant="link"
              className="h-auto p-0 font-semibold"
              data-slot="reconciliation-settlement-link"
              onClick={() => setOpen("settlement")}
            >
              {links.settlement_no}
            </Button>
          ) : (
            "—"
          )}
        </dd>
      </dl>
      {!links && noCompany ? (
        <p
          role="status"
          className="mt-2 rounded-md bg-warning/10 px-2 py-1.5 text-sm font-medium text-warning"
          data-slot="reconciliation-no-company"
        >
          {tj("noCompanyHelp")}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{tj("panelUnchanged")}</p>
      {open === "check" && links ? (
        <ReturnCheckWindow id={links.check_id} kind={links.kind} onClose={() => setOpen(null)} />
      ) : null}
      {open === "settlement" && links?.settlement_id ? (
        <SettlementWindow id={links.settlement_id} kind={links.kind} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
