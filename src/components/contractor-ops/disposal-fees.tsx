"use client";

/**
 * 【清运费用设定】 (JB287, 客户 11-27).
 *
 * 「在右上方「新增申请」旁边设置一个「清运费用设定」按钮。建筑商后台按照供应商填写
 * 合同约定的每车清运费用，参照现有材料分类的价格设定方式，只需填写一次。」
 * 「原有合同价格调整后，不得影响历史费用记录。」
 *
 * The look of 材料单价 (`material-prices.tsx`): one window, a row per
 * clearance supplier with its 每车清运费用 today and its 生效日期, one button
 * to set or change it, and 【修改记录】 (old → new, who, when, 生效日期). A
 * change is a new row from its 生效日期; nothing before it moves. Office
 * only - the phone never sees the button (the server refuses it too).
 * Saving is signed with the six-digit PIN, as 材料单价 is: the API client
 * opens the shared PIN dialog on the server's `sign_off_pin_required` and
 * sends the same save again with it.
 *
 * JB301 (客户 11-28d 事项 5.3 / 5.4): 「清运费用必须按照「项目＋供应商」分别设定
 * ……修改某个项目的清运单价，不得影响其他项目的费用及已经结算归档的历史记录。」
 * The window is for one project, named plainly at the top (「这个项目：
 * PUTRA_MAS」) - the top bar's, or chosen in the window on 全部项目. Old
 * company-wide fees (before JB301) are listed apart: they price nothing until
 * each project sets its own.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, History, Loader2, Lock, Save, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { isValidFee, mayHandleDisposalFees, moneyText } from "@/lib/disposal-fees";
import { isSignOffCancelled } from "@/lib/sign-off";
import {
  getDisposalFeeHistory,
  getDisposalFees,
  getDisposalLegacyFees,
  setDisposalFee,
  type DisposalFeeSupplier,
} from "@/services/disposal-settlement.service";

/** What a saved fee changes elsewhere: the jobs' amounts and the figures. */
export const DISPOSAL_FEE_STALE_KEYS = [
  ["disposal-fees"],
  ["site-disposals"],
  ["disposal-settlements"],
  ["site-cost-overview"],
  ["contractor-reports", "report"],
] as const;

/** The address that opens the window, from a 「去设定」 link anywhere. */
export const DISPOSAL_FEES_PARAM = "fees";

/**
 * 「去设定清运费用」 where a job has no fee yet: opens the same window on the
 * page the reader is on (`?fees=1`, held by 【清运费用设定】 there), so closing
 * it lands back on the same list - in 未核对 the row is tickable at once.
 * Nothing for a reader who may not set fees.
 */
export function DisposalFeeLink({ className }: { className?: string }) {
  const t = useTranslations("jb287");
  const { can, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!mayHandleDisposalFees(user, can)) return null;
  const openHere = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(DISPOSAL_FEES_PARAM, "1");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <button type="button" data-slot="disposal-fee-link" className={className} onClick={openHere}>
      {t("settlement.noFeeLink")}
    </button>
  );
}

/** 「RM 350.00 / 车」, or 「—」 when the reader may not see amounts. */
function useFeeText() {
  const t = useTranslations("jb287");
  return (value: string | null | undefined) => (value ? t("fee.perTrip", { fee: moneyText(value) }) : "—");
}

function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 【清运费用设定】: for an office account that may handle the fees. An office
 * account without 「审核及安排垃圾清运」 sees it locked, saying why (as the
 * other 垃圾清运 steps do); the phone never sees it. `?fees=1` in the address
 * opens it (the 「去设定」 links).
 */
export function DisposalFeeButton() {
  const t = useTranslations("jb287");
  const { can, user } = useAuth();
  const [open, setOpen] = useUrlSelection(DISPOSAL_FEES_PARAM);
  if (!user || user.is_field_staff) return null;
  if (!mayHandleDisposalFees(user, can)) {
    return (
      <Button variant="outline" data-slot="disposal-fee-button-locked" disabled disabledReason={t("fee.noRight")} showReason>
        <Lock className="size-4" />
        {t("fee.button")}
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" data-slot="disposal-fee-button" title={t("fee.buttonHint")} onClick={() => setOpen("1")}>
        <BadgeDollarSign className="size-4" />
        {t("fee.button")}
      </Button>
      {open ? <DisposalFeeDialog onClose={() => setOpen(null)} /> : null}
    </>
  );
}

type Mode =
  | { kind: "list" }
  | { kind: "set"; row: DisposalFeeSupplier }
  | { kind: "history"; row: DisposalFeeSupplier };

export function DisposalFeeDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("jb287");
  const t299 = useTranslations("jb299");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const current = useCurrentProject();
  // JB301: the fee is the project's own - the top bar's project, or one
  // chosen here on 全部项目 (the page itself stays on 全部项目).
  const [chosen, setChosen] = useState("");
  const project = current.projectId || chosen;
  const projectName = current.projects.find((each) => each.id === project)?.name ?? "";
  const fees = useQuery({
    queryKey: ["disposal-fees", "list", project],
    queryFn: () => getDisposalFees(project),
    enabled: Boolean(project),
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="disposal-fee-dialog" className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5" />
            {t("fee.title")}
          </DialogTitle>
          <DialogDescription>{t299("fee.help")}</DialogDescription>
        </DialogHeader>
        <FeeProjectLine
          project={project}
          name={projectName}
          fixed={Boolean(current.projectId) || mode.kind !== "list"}
          projects={current.projects}
          onChoose={setChosen}
        />
        {!project ? null : mode.kind === "set" ? (
          <SetFeeForm row={mode.row} project={project} onDone={() => setMode({ kind: "list" })} />
        ) : mode.kind === "history" ? (
          <FeeHistory row={mode.row} project={project} onBack={() => setMode({ kind: "list" })} />
        ) : (
          <>
            <QueryFailedNote query={fees} what={t("fee.what")} />
            {fees.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("fee.loading")}</p>
            ) : fees.data ? (
              <FeeTable
                rows={fees.data}
                onSet={(row) => setMode({ kind: "set", row })}
                onHistory={(row) => setMode({ kind: "history", row })}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">{t299("fee.keepsOld")}</p>
            <LegacyFees />
          </>
        )}
        {mode.kind === "list" ? (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("fee.close")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「这个项目：PUTRA_MAS」 - which project the fees below are for. On 全部项目
 * the window asks for one first (a fee is never set for every project).
 */
export function FeeProjectLine({
  project,
  name,
  fixed,
  projects,
  onChoose,
}: {
  project: string;
  name: string;
  fixed: boolean;
  projects: readonly { id: string; name: string }[];
  onChoose: (id: string) => void;
}) {
  const t = useTranslations("jb299");
  if (fixed && project) {
    return (
      <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-base font-semibold" data-slot="disposal-fee-project">
        {t("fee.thisProject", { name: name || "—" })}
      </p>
    );
  }
  return (
    <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2" data-slot="disposal-fee-choose-project">
      <p className="text-sm font-medium">{project ? t("fee.thisProject", { name: name || "—" }) : t("fee.chooseProject")}</p>
      <Select value={project || undefined} onValueChange={onChoose}>
        <SelectTrigger className="w-full sm:w-80" aria-label={t("fee.projectLabel")}>
          <SelectValue placeholder={t("fee.projectPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {projects.map((each) => (
            <SelectItem key={each.id} value={each.id}>
              {each.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 「以前的统一价格（没有指定项目），请为每个项目重新设定」 - fees set for every
 * project before JB301 that no settlement or record tied to one project.
 * They price nothing; shown so nobody wonders where they went.
 */
function LegacyFees() {
  const t = useTranslations("jb299");
  const when = useDateFormat();
  const feeText = useFeeText();
  // query-failure: an old list for information only; the window works without it
  const legacy = useQuery({ queryKey: ["disposal-fees", "legacy"], queryFn: getDisposalLegacyFees });
  const rows = legacy.data ?? [];
  if (rows.length === 0) return null;
  return (
    <section className="space-y-1.5 rounded-lg border border-dashed p-3" data-slot="disposal-fee-legacy">
      <p className="text-sm font-medium">{t("fee.legacyTitle")}</p>
      <ul className="space-y-0.5 text-sm text-muted-foreground">
        {rows.map((row) => (
          <li key={row.id}>
            {row.supplier.name} · {feeText(row.fee_per_trip)} · {t("fee.legacyFrom", { date: when.date(row.effective_from) })}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FeeTable({
  rows,
  onSet,
  onHistory,
}: {
  rows: readonly DisposalFeeSupplier[];
  onSet: (row: DisposalFeeSupplier) => void;
  onHistory: (row: DisposalFeeSupplier) => void;
}) {
  const t = useTranslations("jb287");
  const when = useDateFormat();
  const feeText = useFeeText();
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-slot="disposal-fee-empty">
        {t("fee.empty")}
      </p>
    );
  }
  return (
    <div className="rounded-lg border">
      <Table fit>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fee.col.supplier")}</TableHead>
            <TableHead>{t("fee.col.fee")}</TableHead>
            <TableHead>{t("fee.col.effective")}</TableHead>
            <TableHead>{t("fee.col.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.supplier.id} data-slot="disposal-fee-row">
              <TableCell className="font-medium">{row.supplier.name}</TableCell>
              <TableCell>
                <p className="tabular-nums">
                  {row.current ? feeText(row.current.fee_per_trip) : (
                    <span className="text-muted-foreground">{t("fee.none")}</span>
                  )}
                </p>
                {row.upcoming ? (
                  <p className="text-xs text-warning">
                    {t("fee.upcoming", { fee: moneyText(row.upcoming.fee_per_trip) || "—", date: when.date(row.upcoming.effective_from) })}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="tabular-nums whitespace-nowrap">
                {row.current ? when.date(row.current.effective_from) : "—"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" data-slot="disposal-fee-set" onClick={() => onSet(row)}>
                    <Tag />
                    {row.current || row.upcoming ? t("fee.adjust") : t("fee.set")}
                  </Button>
                  <Button size="sm" variant="outline" data-slot="disposal-fee-history" onClick={() => onHistory(row)}>
                    <History />
                    {t("fee.history")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SetFeeForm({ row, project, onDone }: { row: DisposalFeeSupplier; project: string; onDone: () => void }) {
  const t = useTranslations("jb287");
  const t299 = useTranslations("jb299");
  const queryClient = useQueryClient();
  const [fee, setFee] = useState("");
  const [day, setDay] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // One save per press: a double click must not send it twice (the second
  // would come back 「已经设过费用」 after the first was saved).
  const sending = useRef(false);
  const feeOk = isValidFee(fee);
  const save = useMutation({
    mutationFn: () =>
      setDisposalFee({
        project,
        supplier: row.supplier.id,
        fee_per_trip: fee.replace(/,/g, "").trim(),
        effective_from: day,
        note,
      }),
    onSuccess: () => {
      for (const key of DISPOSAL_FEE_STALE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
      onDone();
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setError(reason instanceof ApiError ? reason.message : t("fee.failed"));
    },
  });
  return (
    <div className="space-y-4" data-slot="disposal-fee-form">
      <p className="text-sm font-medium">
        {row.supplier.name}
        {row.current?.fee_per_trip ? (
          <span className="ml-2 font-normal text-muted-foreground">
            {t("fee.nowIs", { fee: moneyText(row.current.fee_per_trip) })}
          </span>
        ) : null}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper
          label={t("fee.feeLabel")}
          required
          error={fee && !feeOk ? t("fee.feeRule") : undefined}
          hint={t("fee.feeHint")}
        >
          <Input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            aria-label={t("fee.feeLabel")}
            value={fee}
            onChange={(event) => {
              setFee(event.target.value);
              setError("");
            }}
          />
        </FieldWrapper>
        <FieldWrapper label={t("fee.effectiveFrom")} required hint={t("fee.effectiveHint")}>
          <Input
            type="date"
            aria-label={t("fee.effectiveFrom")}
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
              setError("");
            }}
          />
        </FieldWrapper>
      </div>
      <FieldWrapper label={t("fee.note")}>
        <Textarea
          rows={2}
          maxLength={500}
          placeholder={t("fee.notePlaceholder")}
          aria-label={t("fee.note")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </FieldWrapper>
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm" data-slot="disposal-fee-keeps-old">
        {t299("fee.keepsOld")}
      </p>
      {/* Signed like 材料单价 (「参照现有材料分类的价格设定方式」): the server asks for
          the PIN, the shared dialog takes it and the same save goes again; a
          wrong PIN is said in that dialog and this form stays as typed. */}
      <p className="text-xs text-muted-foreground" data-slot="disposal-fee-pin">{t("fee.pinHint")}</p>
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t("fee.cancel")}
        </Button>
        <Button
          requires={[
            [feeOk, t("fee.feeLabel")],
            [Boolean(day), t("fee.effectiveFrom")],
          ]}
          disabled={save.isPending}
          data-slot="disposal-fee-save"
          onClick={() => {
            if (sending.current) return;
            sending.current = true;
            save.mutate(undefined, {
              onSettled: () => {
                sending.current = false;
              },
            });
          }}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("fee.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function FeeHistory({ row, project, onBack }: { row: DisposalFeeSupplier; project: string; onBack: () => void }) {
  const t = useTranslations("jb287");
  const when = useDateFormat();
  const feeText = useFeeText();
  const history = useQuery({
    queryKey: ["disposal-fees", "history", project, row.supplier.id],
    queryFn: () => getDisposalFeeHistory(row.supplier.id, project),
  });
  const rows = history.data ?? [];
  return (
    <section className="space-y-3" data-slot="disposal-fee-history-list">
      <h3 className="text-sm font-medium">{t("fee.historyTitle", { name: row.supplier.name })}</h3>
      <QueryFailedNote query={history} what={t("fee.history")} />
      {history.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("fee.loading")}</p>
      ) : rows.length === 0 ? (
        !history.isError && <p className="text-sm text-muted-foreground">{t("fee.historyEmpty")}</p>
      ) : (
        <div className="rounded-lg border">
          <Table fit>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{t("fee.col.oldFee")}</TableHead>
                <TableHead className="text-right">{t("fee.col.newFee")}</TableHead>
                <TableHead>{t("fee.col.by")}</TableHead>
                <TableHead>{t("fee.col.at")}</TableHead>
                <TableHead>{t("fee.col.from")}</TableHead>
                <TableHead>{t("fee.col.note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {feeText(entry.previous_fee)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {feeText(entry.fee_per_trip)}
                  </TableCell>
                  <TableCell>{entry.set_by_name || "—"}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{when.dateTime(entry.set_at)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{when.date(entry.effective_from)}</TableCell>
                  <TableCell className="max-w-48 truncate" title={entry.note || undefined}>{entry.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          {t("fee.back")}
        </Button>
      </DialogFooter>
    </section>
  );
}
