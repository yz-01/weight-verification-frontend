"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ShellPanel } from "@/components/shared/record-detail-shell";
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
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type {
  EquipmentHoursSession,
  EquipmentSessionOperatorPayload,
  RegisteredOperator,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import { listRegisteredOperators, setEquipmentSessionOperator } from "@/services/equipment-hours.service";

/**
 * What the office's operator form sends: words trimmed, one session or its
 * day, and - picked from 「选择已登记的操作人员」 (JB233) - the operator's papers.
 */
export function operatorPayload(
  session: Pick<EquipmentHoursSession, "key">,
  name: string,
  cidb: string,
  wholeDay: boolean,
  profile: string | null = null,
): EquipmentSessionOperatorPayload {
  return {
    session: session.key,
    operator_name: name.trim(),
    cidb_no: cidb.trim(),
    apply_to_day: wholeDay,
    ...(profile ? { profile } : {}),
  };
}

/** 「不在名单里，手动填写」 in the picker. */
const TYPED = "typed";

/** One line of the picker: name, CIDB, and a red 「证件过期」 when one ran out. */
export function registeredOperatorLabel(
  row: Pick<RegisteredOperator, "name" | "cidb_no" | "company_name">,
): string {
  return [row.name, row.cidb_no ? `CIDB ${row.cidb_no}` : "", row.company_name].filter(Boolean).join(" · ");
}

/**
 * 操作人员 and CIDB 卡号 of one session, written by the office (2026-10 I4,
 * ID19): 「由电脑后台填写及管理操作人员姓名、CIDB卡号码，按当天实际人员记录，允许
 * 每天更换，不固定绑定设备」. The phone never asks. 「套用到当天这部设备的全部
 * 工时」 writes the same on every session of that machine that day. A change
 * keeps the earlier one in the history.
 *
 * JB233 (客户 11-20 事项 5: 「资料直接关联现有操作人员记录，不需要每次重复填写」):
 * 「选择已登记的操作人员」 lists the project's driver links and operator
 * accounts; picking one fills in his name and CIDB 卡号 and links his papers.
 * A name typed by hand is still taken, for somebody not registered.
 */
export function OperatorDialog({
  session,
  onClose,
  onSaved,
}: {
  session: EquipmentHoursSession;
  onClose: () => void;
  onSaved?: (rows: EquipmentHoursSession[]) => void;
}) {
  const t = useTranslations("equipmentHours");
  const queryClient = useQueryClient();
  const [name, setName] = useState(session.operator_name ?? "");
  const [cidb, setCidb] = useState(session.cidb_no ?? "");
  const [picked, setPicked] = useState<string>(session.operator_profile_id || TYPED);
  const [wholeDay, setWholeDay] = useState(false);
  const [error, setError] = useState("");
  const operators = useQuery({
    queryKey: ["equipment-operators", "list", session.project],
    queryFn: () => listRegisteredOperators(session.project),
  });
  const rows = operators.data ?? [];
  const chosen = rows.find((row) => row.id === picked) ?? null;

  const save = useMutation({
    mutationFn: () =>
      setEquipmentSessionOperator(operatorPayload(session, name, cidb, wholeDay, chosen ? chosen.id : null)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
      onSaved?.(saved);
      onClose();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("operator.failed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("operator.title")}</DialogTitle>
          <DialogDescription>
            {t("operator.help", {
              machine: session.site_no || session.equipment_code || session.equipment_name,
              date: session.work_date,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !save.isPending) save.mutate();
          }}
        >
          <FieldWrapper label={t("papers.pick")} hint={t("papers.pickHelp")}>
            <Select
              value={picked}
              onValueChange={(value) => {
                setPicked(value);
                const row = rows.find((item) => item.id === value);
                if (row) {
                  setName(row.name);
                  setCidb(row.cidb_no);
                }
              }}
            >
              <SelectTrigger aria-label={t("papers.pick")} data-testid="operator-picker">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TYPED}>{t("papers.pickTyped")}</SelectItem>
                {rows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    <span className="inline-flex items-center gap-2">
                      {registeredOperatorLabel(row)}
                      {row.expiry === "expired" ? <StatusBadge label={t("papers.tagExpired")} tone="danger" /> : null}
                      {row.expiry === "expiring" ? (
                        <StatusBadge label={t("papers.tagExpiring")} tone="warning" />
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <QueryFailedNote query={operators} what={t("papers.pickWhat")} />
          {chosen ? (
            <p className="text-xs text-muted-foreground">{t("papers.linked", { name: chosen.name })}</p>
          ) : null}
          <FieldWrapper label={t("operator.name")} required>
            <Input
              value={name}
              maxLength={150}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                // Typed by hand: somebody else than the one picked.
                setPicked(TYPED);
              }}
            />
          </FieldWrapper>
          <FieldWrapper label={t("operator.cidb")}>
            <Input
              value={cidb}
              maxLength={50}
              autoComplete="off"
              onChange={(event) => {
                setCidb(event.target.value);
                setPicked(TYPED);
              }}
            />
          </FieldWrapper>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>{t("operator.wholeDay")}</span>
            <Switch checked={wholeDay} onCheckedChange={setWholeDay} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("operator.cancel")}
            </Button>
            <Button
              type="submit"
              requires={[[name.trim(), t("operator.name")]]}
              disabled={save.isPending}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
              {t("operator.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Every operator the office has written for the session, newest first. */
export function OperatorHistory({ session }: { session: EquipmentHoursSession }) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const history = session.operator_history ?? [];
  return (
    <ShellPanel title={t("operator.history")} className="space-y-2">
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operator.none")}</p>
      ) : (
        <ol className="space-y-2">
          {history.map((entry, index) => (
            <li key={entry.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {entry.operator_name}
                {entry.cidb_no ? ` · CIDB ${entry.cidb_no}` : ""}
                {index === 0 && (
                  <span className="ml-2">
                    <StatusBadge label={t("history.current")} tone="positive" />
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("history.by", { name: entry.created_by_name, at: df.dateTime(entry.created_at) })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </ShellPanel>
  );
}
