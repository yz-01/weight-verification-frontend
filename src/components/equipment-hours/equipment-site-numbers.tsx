"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
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
import type { EquipmentHoursMachine } from "@/interfaces/equipment-hours";
import { getEquipmentSiteNumbers } from "@/services/equipment-hours.service";

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
 * The machines' numbers, one line each (2026-10-10; read-only since JB96).
 *
 * It used to be 「设备编号管理」, where the office typed each machine's number.
 * Since JB96 (客户 11-03 第 3 点 「设备编号由系统自动生成，不需要人工填写，也
 * 不允许人工修改」) the system gives every machine its project's next EQ
 * number when it is registered, and the server refuses a change
 * (`set_site_no`). The list stays as the place to look a number up: supplier,
 * name, plate and the number.
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

/** One machine and its number - shown, not edited (JB96). */
function SiteNumberLine({
  machine,
  showProject,
}: {
  machine: EquipmentHoursMachine;
  showProject: boolean;
}) {
  const details = [
    machine.code && machine.code !== machine.site_no ? machine.code : "",
    machine.plate,
    machine.supplier_name,
    showProject ? machine.project_name : "",
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{machine.name}</p>
        {details.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
        )}
      </div>
      <span className="tabular shrink-0 font-semibold" data-testid="site-number">
        {machine.site_no || "—"}
      </span>
    </li>
  );
}
