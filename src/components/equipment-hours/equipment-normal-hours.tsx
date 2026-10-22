"use client";

/**
 * 每日正常工时 (J31, Q27-1): set in the office, per project. A change counts
 * for sessions that end after it; what ended before keeps its settlement.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
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
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { getEquipmentNormalHours, setEquipmentNormalHours } from "@/services/equipment-hours.service";

export function EquipmentNormalHoursButton({ project }: { project: string }) {
  const t = useTranslations("equipmentHours");
  const [open, setOpen] = useState(false);
  const current = useQuery({
    queryKey: ["equipment-hours", "normal-hours", project],
    queryFn: () => getEquipmentNormalHours(project),
    enabled: Boolean(project),
  });
  if (!project) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Clock />
        {t("normal.open", { hours: current.data?.daily_hours ?? "8.00" })}
      </Button>
      <QueryFailedNote query={current} what={t("normal.title")} />
      {open && current.data ? (
        <NormalHoursDialog
          project={project}
          hours={current.data.daily_hours}
          setAt={current.data.set_at}
          setBy={current.data.set_by_name ?? ""}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function NormalHoursDialog({
  project,
  hours,
  setAt,
  setBy,
  onClose,
}: {
  project: string;
  hours: string;
  setAt: string | null;
  setBy: string;
  onClose: () => void;
}) {
  const t = useTranslations("equipmentHours");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(Number(hours)));
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => setEquipmentNormalHours(project, value.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
      onClose();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("normal.failed")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("normal.title")}</DialogTitle>
          <DialogDescription>{t("normal.help")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("normal.label")} required error={error}>
          <Input
            type="number"
            inputMode="decimal"
            min="0.5"
            max="24"
            step="0.5"
            value={value}
            onChange={(event) => {
              setError("");
              setValue(event.target.value);
            }}
          />
        </FieldWrapper>
        {setAt ? (
          <p className="text-xs text-muted-foreground">{t("normal.current", { at: df.dateTime(setAt), name: setBy })}</p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={save.isPending}
            requires={[[value.trim(), t("normal.label")]]}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("normal.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
