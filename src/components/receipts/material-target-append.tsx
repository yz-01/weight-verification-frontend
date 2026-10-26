"use client";

/**
 * 「修改目标数量」 (JB26, 客户 10-26 事项 2).
 *
 * 「点击「修改目标数量」，可以查看全部历史修改记录。可以继续追加新目标，例如 +200
 * Ton。……修改目标时，必须输入本人六位数密码确认。……每次修改自动记录操作人完整
 * 姓名、账号、日期、时间。记录原目标、追加数量、修改后的累计目标。……修改人资料由
 * 密码对应账号自动读取，不允许手动更改。历史修改记录永久保留，不可删除。」
 *
 * The history above, read-only; the amount to add below. Confirming asks for
 * the user's own PIN (`api-client` opens the dialog on the server's refusal);
 * the operator is whoever that PIN belongs to - nothing here names a person.
 * Anyone who sees the targets may add, not only who sets them.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
import { useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type { MaterialTarget } from "@/interfaces/material-target";
import { useDateFormat } from "@/lib/dates";
import { isValidTargetQuantity, targetAfterAdding } from "@/lib/material-targets";
import { appendMaterialTarget, getMaterialTargetHistory } from "@/services/material-target.service";

export function AppendTargetDialog({
  row,
  onClose,
  onSaved,
}: {
  row: MaterialTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("materialTargets.append");
  const tt = useTranslations("materialTargets");
  const when = useDateFormat();
  const unitName = useUnitName();
  const unit = unitName(row.unit, row.unit_label);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const history = useQuery({
    queryKey: ["material-target-history", row.id],
    queryFn: () => getMaterialTargetHistory(row.id),
  });
  const lines = history.data?.results ?? [];
  const amountOk = isValidTargetQuantity(amount);
  const after = targetAfterAdding(row.target_quantity, amount);
  const save = useMutation({
    mutationFn: () => appendMaterialTarget(row.id, amount.replace(/,/g, "").trim()),
    onSuccess: onSaved,
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : tt("failed")),
  });
  const material = row.spec_name ? `${row.category_name} · ${row.spec_name}` : row.category_name;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("current", { material, total: row.target_quantity, unit })}</DialogDescription>
        </DialogHeader>
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t("history")}</h3>
          <QueryFailedNote query={history} what={t("history")} />
          {history.isLoading ? (
            <p className="text-sm text-muted-foreground">{tt("loading")}</p>
          ) : lines.length === 0 ? (
            !history.isError && <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="rounded-lg border">
              <Table fit>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("col.when")}</TableHead>
                    <TableHead>{t("col.name")}</TableHead>
                    <TableHead>{t("col.account")}</TableHead>
                    <TableHead className="text-right">{t("col.before")}</TableHead>
                    <TableHead className="text-right">{t("col.added")}</TableHead>
                    <TableHead className="text-right">{t("col.after")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="tabular-nums whitespace-nowrap">{when.dateTime(line.created_at)}</TableCell>
                      <TableCell>{line.actor_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{line.actor_account || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.kind === "ORIGINAL" ? "—" : line.target_before}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.kind === "ORIGINAL" ? (
                          <span className="text-muted-foreground">{t("original", { quantity: line.quantity })}</span>
                        ) : (
                          <span className="font-medium text-tone-purple-fg">+{line.quantity}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{line.target_after}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
        <FieldWrapper
          label={t("amount")}
          required
          error={amount && !amountOk ? tt("quantityRule") : undefined}
          hint={after ? t("after", { total: after, unit }) : tt("quantityRule")}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">+</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0.001"
              step="0.001"
              aria-label={t("amount")}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="max-w-48"
            />
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
        </FieldWrapper>
        <p className="text-xs text-muted-foreground">{t("pinNote")}</p>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tt("cancel")}
          </Button>
          <Button requires={[[amountOk, t("amount")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
