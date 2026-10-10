"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { QueryFailedNote } from "@/components/shared/page-primitives";
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
import type { EquipmentHoursMachine } from "@/interfaces/equipment-hours";
import { getEquipmentSiteNumbers, setEquipmentSiteNo } from "@/services/equipment-hours.service";

/** Whether a machine answers the dialog's search box. */
export function machineMatchesSearch(machine: EquipmentHoursMachine, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return [
    machine.site_no,
    machine.name,
    machine.code,
    machine.plate,
    machine.supplier_name,
    machine.project_name,
  ].some((value) => (value ?? "").toLowerCase().includes(needle));
}

/**
 * 「设备编号管理」 (2026-10-10): the office gives each machine on the site a
 * short 现场编号 - 「后台人员给设备起一个名字号码 {12}，现场设备会有很多的」 -
 * painted or stuck on the machine, so the operator can type it on the phone.
 *
 * One line per machine in use: supplier, name, plate and the number, edited
 * where it stands. A number already on another machine of the project is
 * refused by the server and said under the line; a blank number clears it.
 */
export function EquipmentSiteNumbersDialog({
  project,
  onClose,
}: {
  /** The page's project; empty is every project the reader sees. */
  project: string;
  onClose: () => void;
}) {
  const t = useTranslations("equipmentHours");
  const [search, setSearch] = useState("");
  const machines = useQuery({
    queryKey: ["equipment-hours", "site-numbers", project],
    queryFn: () => getEquipmentSiteNumbers(project || undefined),
  });
  const rows = machines.data ?? [];
  const shown = rows.filter((row) => machineMatchesSearch(row, search));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("siteNo.title")}</DialogTitle>
          <DialogDescription>{t("siteNo.help")}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("siteNo.search")}
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="w-full pl-8"
              value={search}
              placeholder={t("siteNo.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <QueryFailedNote query={machines} what={t("what.siteNumbers")} />
        {machines.isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : machines.isSuccess && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("siteNo.empty")}</p>
        ) : machines.isSuccess && shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("siteNo.noMatch")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {shown.map((machine) => (
              <SiteNumberLine key={machine.id} machine={machine} showProject={!project} />
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("siteNo.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One machine and its number, saved on its own. */
function SiteNumberLine({
  machine,
  showProject,
}: {
  machine: EquipmentHoursMachine;
  showProject: boolean;
}) {
  const t = useTranslations("equipmentHours");
  const queryClient = useQueryClient();
  // What the server holds, as of this line's last save.
  const [stored, setStored] = useState(machine.site_no ?? "");
  const [value, setValue] = useState(stored);
  const [error, setError] = useState("");
  const changed = value.trim() !== stored;

  const save = useMutation({
    mutationFn: () => setEquipmentSiteNo(machine.id, value.trim()),
    onSuccess: (row) => {
      setStored(row.site_no ?? "");
      setValue(row.site_no ?? "");
      setError("");
      // The table, the filters, this list and the phone's machine list.
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("siteNo.failed")),
  });

  const details = [
    machine.code,
    machine.plate,
    machine.supplier_name,
    showProject ? machine.project_name : "",
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{machine.name}</p>
        {details.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
        )}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && !save.isPending) save.mutate();
        }}
      >
        <Input
          className="w-full sm:w-28"
          value={value}
          maxLength={20}
          autoComplete="off"
          aria-label={t("siteNo.inputLabel", { machine: machine.name })}
          placeholder={t("siteNo.placeholder")}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
        />
        {changed && (
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("siteNo.save")}
          </Button>
        )}
      </form>
    </li>
  );
}
