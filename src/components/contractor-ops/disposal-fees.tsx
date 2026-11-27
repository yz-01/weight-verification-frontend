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
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, History, Loader2, Lock, Save, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
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
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const fees = useQuery({ queryKey: ["disposal-fees", "list"], queryFn: getDisposalFees });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="disposal-fee-dialog" className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5" />
            {t("fee.title")}
          </DialogTitle>
          <DialogDescription>{t("fee.help")}</DialogDescription>
        </DialogHeader>
        {mode.kind === "set" ? (
          <SetFeeForm row={mode.row} onDone={() => setMode({ kind: "list" })} />
        ) : mode.kind === "history" ? (
          <FeeHistory row={mode.row} onBack={() => setMode({ kind: "list" })} />
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
            <p className="text-xs text-muted-foreground">{t("fee.keepsOld")}</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t("fee.close")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
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

function SetFeeForm({ row, onDone }: { row: DisposalFeeSupplier; onDone: () => void }) {
  const t = useTranslations("jb287");
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
        {t("fee.keepsOld")}
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

function FeeHistory({ row, onBack }: { row: DisposalFeeSupplier; onBack: () => void }) {
  const t = useTranslations("jb287");
  const when = useDateFormat();
  const feeText = useFeeText();
  const history = useQuery({
    queryKey: ["disposal-fees", "history", row.supplier.id],
    queryFn: () => getDisposalFeeHistory(row.supplier.id),
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
