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
import { ClipboardCheck, Eye, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { AttachmentPicker } from "@/components/shared/attachment-picker";
import { DataTable } from "@/components/shared/data-table";
import { FileActionButtons } from "@/components/shared/file-actions";
import { PlainHeader } from "@/components/shared/module-records-table";
import { FieldWrapper, ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { RecordSendLog } from "@/components/shared/record-send-log";
import { RecordWindowFailure } from "@/components/shared/record-window-failure";
import { SupplierReturnsTable } from "@/components/suppliers/supplier-return-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { ATTACHMENT_ACCEPT } from "@/lib/attachment-whitelist";
import { useDateFormat } from "@/lib/dates";
import { getSupplierReturns } from "@/services/contractor.service";
import {
  createReturnCheck,
  getPendingReturnSuppliers,
  getReturnCheck,
  getReturnChecks,
  returnCheckPdfFile,
  type PendingReturnSupplier,
  type ReturnCheck,
  type ReturnCheckRow,
} from "@/services/return-check.service";

/** The server's limits on a check's files (`utils/attachment_files.py`). */
export const RETURN_CHECK_MAX_FILES = 10;
export const RETURN_CHECK_MAX_MB = 50;
/** 「备注选填」 - a remark, not a document (the server's `NOTE_MAX`). */
const NOTE_MAX = 2000;

/** 「待核对」 or 「已核对」, kept in the address as `?tab=checked`. */
export type ReturnTab = "pending" | "checked";

export function returnTabOf(value: string | null): ReturnTab {
  return value === "checked" ? "checked" : "pending";
}

/** What a saved check changes on other screens: every count of 「有退货资料」. */
export const RETURN_CHECK_STALE_KEYS = [
  ["material-outgoing"],
  ["suppliers"],
  ["return-checks"],
  ["receipts", "net-totals"],
] as const;

/** 「待核对｜已核对」: only on the 供应商退货 side (做法 1). */
export function ReturnCheckTabs({
  value,
  onChange,
}: {
  value: ReturnTab;
  onChange: (next: ReturnTab) => void;
}) {
  const t = useTranslations("returnChecks");
  return (
    <div
      role="tablist"
      aria-label={t("tabsLabel")}
      className="inline-flex self-start rounded-lg border bg-muted/40 p-1"
      data-testid="return-check-tabs"
    >
      {(["pending", "checked"] as const).map((tab) => (
        <Button
          key={tab}
          role="tab"
          aria-selected={value === tab}
          variant={value === tab ? "default" : "ghost"}
          className="h-10 px-5 text-base"
          data-slot={`return-tab-${tab}`}
          onClick={() => onChange(tab)}
        >
          {tab === "pending" ? t("tabPending") : t("tabChecked")}
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
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!can("material_outgoing.approve")) return null;
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
  const current = useCurrentProject();
  const project = current.active ? current.projectId : "";
  const suppliers = useQuery({
    queryKey: ["return-checks", "pending-suppliers", project],
    queryFn: () => getPendingReturnSuppliers(project || undefined),
  });
  const [picked, setPicked] = useState<PendingReturnSupplier | null>(null);
  const list = suppliers.data?.results ?? [];
  // 「只有一家就直接选好」.
  const supplier = picked ?? (list.length === 1 ? list[0] : null);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="return-check-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={suppliers} what={t("suppliersWhat")} />
        {suppliers.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : null}
        {suppliers.isSuccess && !list.length ? (
          <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
            {t("noSuppliers")}
          </p>
        ) : null}
        {list.length ? (
          <section className="space-y-2" data-slot="return-check-suppliers">
            <h3 className="text-sm font-semibold">{t("chooseSupplier")}</h3>
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
        {supplier ? (
          <SupplierPendingReturns key={supplier.id} supplier={supplier} project={project} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
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
      {returns.isLoading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : null}
      {returns.isSuccess && !rows.length ? (
        <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
          {t("noReturns")}
        </p>
      ) : null}
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

/** Now, to the minute: 「自动显示…日期及时间」 while the window is open. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Tick, then confirm (做法 2、3): the supplier's returns with a tick each and
 * 全选; once one is ticked, 核对人 and the date and time (not typed), the
 * files, the remark and 【确认核对】 - which the server answers with the PIN
 * dialog. Nothing of the returns is typed again, and there is no price.
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
  const common = useTranslations("common");
  const df = useDateFormat();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  // Only what is still listed: a row checked meanwhile drops out.
  const picked = rows.map((row) => row.id).filter((id) => chosen.has(id));
  const save = useMutation({
    mutationFn: () => createReturnCheck({ supplier: supplier.id, returns: picked, note, files }),
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
  const toggleAll = () =>
    setChosen(picked.length === rows.length ? new Set() : new Set(rows.map((row) => row.id)));

  return (
    <div className="space-y-4" data-slot="return-check-form">
      {truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
          {t("truncated", truncated)}
        </p>
      ) : null}
      <SupplierReturnsTable
        rows={rows}
        selection={{ chosen: new Set(picked), onToggle: toggle, onToggleAll: toggleAll }}
      />
      {picked.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-slot="return-check-tick-first">
          {t("tickFirst")}
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
          <FieldWrapper
            label={t("files")}
            optional={common("optional")}
            hint={t("filesHint", { count: RETURN_CHECK_MAX_FILES, limit: RETURN_CHECK_MAX_MB })}
          >
            <AttachmentPicker
              files={files}
              onChange={setFiles}
              showLimits={false}
              disabled={save.isPending}
              rule={{
                accept: ATTACHMENT_ACCEPT,
                maxFiles: RETURN_CHECK_MAX_FILES,
                maxBytes: RETURN_CHECK_MAX_MB * 1024 * 1024,
                multiple: true,
              }}
            />
          </FieldWrapper>
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
            {t("noPrice")} {t("confirmPin")}
          </p>
          <div className="flex justify-end">
            <Button
              size="lg"
              data-slot="return-check-confirm-button"
              // Shown only once a return is ticked (做法 3); off while it saves.
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
 * 「已核对」: one line per check, newest first - 核对编号｜供应商｜笔数｜日期｜
 * 核对人｜查看 (做法 1). A row or 【查看】 opens it. Follows the top bar.
 */
export function ReturnChecksList({
  title,
  above,
  onOpen,
}: {
  title: string;
  above?: React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("returnChecks");
  const df = useDateFormat();
  const list = useListQuery(["project"]);
  const checks = useQuery({
    queryKey: ["return-checks", "list", list.query],
    queryFn: () => getReturnChecks(list.query),
  });
  const total = checks.data?.count ?? 0;
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
        meta: { label: t("column.supplier") },
        header: () => <PlainHeader label={t("column.supplier")} />,
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
    [t, df, onOpen],
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
        storageKey="return-checks.v1"
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
 * 查看 one check (做法 6): on top every return it ticked (each opens its own
 * record, closing comes back here), below the shared 核对人, time, remark and
 * vouchers; the four file buttons on 「退货核对单」. Nothing can be changed.
 */
export function ReturnCheckWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("returnChecks");
  const locale = useLocale();
  const df = useDateFormat();
  const check = useQuery({ queryKey: ["return-checks", "detail", id], queryFn: () => getReturnCheck(id) });
  const data = check.data;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="return-check-window" className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{data ? t("windowTitle", { number: data.check_no }) : t("title")}</DialogTitle>
          <DialogDescription>
            {data ? `${data.supplier_name} · ${t("countValue", { count: data.return_count })}` : t("help")}
          </DialogDescription>
        </DialogHeader>
        {check.isError ? <RecordWindowFailure query={check} what={t("what")} /> : null}
        {check.isLoading ? (
          <div className="grid min-h-24 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : null}
        {data ? (
          <div className="space-y-5">
            {/* 预览 · 打印 · 导出 · 发送 - the PIN for all but 预览 (JB27). */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <FileActionButtons
                label={t("pdf")}
                source={{
                  load: () => returnCheckPdfFile(data.id, locale, data.check_no),
                  title: t("pdfTitle", { number: data.check_no }),
                  // 打印 · 导出 · 发送 fetch it again with the PIN's grant, so
                  // the server sees each one; the log row names this check.
                  exportedOnServer: true,
                  recordKind: "MATERIAL_RETURN_CHECK",
                  recordId: data.id,
                  project: data.project ?? undefined,
                }}
              />
            </div>
            <section className="space-y-2" data-slot="return-check-returns">
              <div>
                <h3 className="text-base font-semibold">
                  {t("returnsTitle", { count: data.returns.length + data.hidden_count })}
                </h3>
                <p className="text-sm text-muted-foreground">{t("returnsHelp")}</p>
              </div>
              <SupplierReturnsTable rows={data.returns} />
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
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{t("note")}</dt>
                  <dd className="whitespace-pre-wrap">{data.note || t("noNote")}</dd>
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
            <RecordSendLog recordKind="MATERIAL_RETURN_CHECK" recordId={data.id} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
