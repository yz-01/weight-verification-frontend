"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
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
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type {
  EquipmentHoursSession,
  EquipmentSessionOperatorPayload,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import { setEquipmentSessionOperator } from "@/services/equipment-hours.service";

/** What the office's operator form sends: words trimmed, one session or its day. */
export function operatorPayload(
  session: Pick<EquipmentHoursSession, "key">,
  name: string,
  cidb: string,
  wholeDay: boolean,
): EquipmentSessionOperatorPayload {
  return {
    session: session.key,
    operator_name: name.trim(),
    cidb_no: cidb.trim(),
    apply_to_day: wholeDay,
  };
}

/**
 * 操作人员 and CIDB 卡号 of one session, written by the office (2026-10 I4,
 * ID19): 「由电脑后台填写及管理操作人员姓名、CIDB卡号码，按当天实际人员记录，允许
 * 每天更换，不固定绑定设备」. The phone never asks. 「套用到当天这部设备的全部
 * 工时」 writes the same on every session of that machine that day. A change
 * keeps the earlier one in the history.
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
  const [wholeDay, setWholeDay] = useState(false);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => setEquipmentSessionOperator(operatorPayload(session, name, cidb, wholeDay)),
    onSuccess: (rows) => {
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
      onSaved?.(rows);
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
          <FieldWrapper label={t("operator.name")} required>
            <Input
              value={name}
              maxLength={150}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("operator.cidb")}>
            <Input
              value={cidb}
              maxLength={50}
              autoComplete="off"
              onChange={(event) => setCidb(event.target.value)}
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
