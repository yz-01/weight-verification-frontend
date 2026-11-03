"use client";

/**
 * 「设备名称」 on 登记设备 and on the phone's 「新设备」 (JB96, 客户 11-03 第 1、2 点):
 * 「取消目前的『设备大类』和『设备小类』，统一只保留『设备名称』」「设备名称可以选择
 * 已有名称，也可以直接新增，例如挖土机、塔吊、发电机等。新增名称自动保存，以后登记
 * 可以直接选择」.
 *
 * A dropdown of the company's names (every project of the contractor shares
 * it) with 「新增设备名称」 beside it, the way 施工工种 is picked (JB91): the
 * name typed joins the list and is chosen at once. A name already on the list,
 * in another case or spacing, is that name - the server hands it back.
 *
 * On the phone with no signal the new name is simply used: the server adds it
 * to the list when the entry is sent (`record_entry`), so nothing is lost.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import { createEquipmentName, getEquipmentNames } from "@/services/contractor-ops.service";

/** The company's 「设备名称」, for the form and the list's filter. */
export function useEquipmentNames(project?: string) {
  // query-failure: EquipmentNameSelect shows the QueryFailedNote for this query
  return useQuery({
    queryKey: ["equipment-names", project || "mine"],
    queryFn: () => getEquipmentNames(project || undefined),
    staleTime: 60_000,
  });
}

/** Names compared the way the server compares them: case and spaces do not count. */
export function sameEquipmentName(a: string, b: string): boolean {
  const key = (value: string) => value.split(/\s+/).filter(Boolean).join(" ").toLocaleLowerCase();
  return key(a) === key(b);
}

/**
 * The names the dropdown offers: the list, with the chosen name added when it
 * is not on it (an old machine's name, or one added offline), each once.
 */
export function equipmentNameChoices(listed: readonly string[], value: string): string[] {
  const rows: string[] = [];
  for (const name of listed) {
    if (!rows.some((row) => sameEquipmentName(row, name))) rows.push(name);
  }
  const chosen = value.trim();
  if (chosen && !rows.some((row) => sameEquipmentName(row, chosen))) rows.unshift(chosen);
  return rows;
}

export function EquipmentNameSelect({
  project,
  value,
  canAdd = true,
  onChange,
  triggerClassName = "w-full",
}: {
  /** Whose list: the project's company. */
  project?: string;
  value: string;
  canAdd?: boolean;
  onChange: (name: string) => void;
  triggerClassName?: string;
}) {
  const t = useTranslations("contractorOps.equipmentName");
  const queryClient = useQueryClient();
  const names = useEquipmentNames(project);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");

  const finish = (name: string) => {
    setAdding(false);
    setTyped("");
    onChange(name);
  };
  const create = useMutation({
    mutationFn: () => createEquipmentName(typed.trim(), project || undefined),
    onMutate: () => setError(""),
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ["equipment-names"] });
      finish(row.name);
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status > 0) {
        setError(failure.message || t("addFailed"));
        return;
      }
      // No signal: used as typed; the server adds it when the record is sent.
      finish(typed.trim().split(/\s+/).join(" "));
    },
  });

  const choices = equipmentNameChoices(
    (names.data ?? []).map((row) => row.name),
    value,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger className={triggerClassName} aria-label={t("label")} data-testid="equipment-name-select">
            <SelectValue placeholder={t("placeholder")} />
          </SelectTrigger>
          <SelectContent position="popper">
            {choices.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canAdd && !adding && (
          <Button type="button" variant="outline" className="shrink-0" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
        )}
      </div>
      {adding && (
        <div className="flex items-end gap-2" data-testid="equipment-name-creator">
          <FieldWrapper label={t("newName")} required error={error || undefined} className="min-w-0 flex-1">
            <Input
              autoFocus
              placeholder={t("newNamePlaceholder")}
              value={typed}
              maxLength={200}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && typed.trim()) {
                  event.preventDefault();
                  create.mutate();
                }
              }}
            />
          </FieldWrapper>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            requires={[[typed.trim(), t("newName")]]}
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("addConfirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("addCancel")}
            onClick={() => {
              setAdding(false);
              setTyped("");
              setError("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <QueryFailedNote query={names} what={t("what")} />
    </div>
  );
}

const ALL_NAMES = "__all__";

/**
 * The equipment lists' filter since JB96: by 「设备名称」, where they filtered
 * by 大类 / 小类 before (客户 11-03 第 1 点). Reads and writes `equipment_name`.
 */
export function EquipmentNameFilter({
  list,
}: {
  list: ReturnType<typeof useListQuery>;
}) {
  const t = useTranslations("contractorOps.equipmentName");
  const names = useEquipmentNames(list.filters.project || undefined);
  const value = list.filters.equipment_name ?? "";
  const choices = equipmentNameChoices(
    (names.data ?? []).map((row) => row.name),
    value,
  );
  return (
    <>
      <Select
        value={value || ALL_NAMES}
        onValueChange={(next) =>
          list.setFilters({
            equipment_name: next === ALL_NAMES ? undefined : next,
            // A link from before JB96 may still carry a class.
            category: undefined,
            uncategorised: undefined,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-45" aria-label={t("all")} data-testid="equipment-name-filter">
          <SelectValue placeholder={t("all")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_NAMES}>{t("all")}</SelectItem>
          {choices.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QueryFailedNote query={names} what={t("what")} />
    </>
  );
}
