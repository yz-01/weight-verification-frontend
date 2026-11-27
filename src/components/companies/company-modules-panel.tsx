"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_NOTES } from "@/lib/company-modules";
import { getCompanyModules, setCompanyModules } from "@/services/companies.service";

/** The modules switched off once a tick changes `key`. */
export function toggleModule(disabled: readonly string[], key: string, on: boolean, choices: readonly string[]): string[] {
  const off = new Set(disabled);
  if (on) off.delete(key);
  else off.add(key);
  return choices.filter((choice) => off.has(choice));
}

/**
 * 业务模块 (JB250, 客户 11-24 事项 1): 「由 MSE Admin 根据每家客户公司的业务需求，
 * 独立控制各个业务模块的开启或关闭」.
 *
 * One tick per module of the company's portal: ticked is on. Unticking one
 * takes it off this company's office menu and phone, and the server refuses
 * it from then on - a direct link or API call included. The menus every
 * company keeps (仪表板, 通知中心, 用户…) are not listed; a module the package
 * leaves out shows unticked and grey, since the package decides that one.
 * Records stay; switching a module on again brings them back.
 */
export function CompanyModulesPanel({ companyId }: { companyId: string }) {
  const t = useTranslations();
  const words = useTranslations("jb250");
  const notes = useTranslations("jb250fix");
  const { can } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["companies", "modules", companyId];
  const modules = useQuery({ queryKey, queryFn: () => getCompanyModules(companyId) });
  const [draft, setDraft] = useState<string[] | null>(null);
  const save = useMutation({
    mutationFn: (disabled: string[]) => setCompanyModules(companyId, disabled),
    onSuccess: (row) => {
      setDraft(null);
      qc.setQueryData(queryKey, row);
    },
  });
  const canManage = can("company.update");
  const label = (key: string) =>
    t.has(`subscriptions.featureName.${key}`)
      ? t(`subscriptions.featureName.${key}`)
      : t.has(`nav.${key}`)
        ? t(`nav.${key}`)
        : key;

  if (!modules.data) {
    return (
      <section id="company-modules" className="scroll-mt-20 space-y-3 border-t p-4 sm:p-6">
        <h2 className="text-base font-semibold">{words("title")}</h2>
        <QueryFailedNote query={modules} what={words("title")} />
      </section>
    );
  }
  const data = modules.data;
  const disabled = draft ?? data.disabled;
  const notInPlan = new Set(data.not_in_plan);
  const off = new Set(disabled);
  const onCount = data.choices.filter((key) => !off.has(key) && !notInPlan.has(key)).length;
  const changed = draft !== null && draft.join(",") !== data.disabled.join(",");

  return (
    <section id="company-modules" className="scroll-mt-20 space-y-3 border-t p-4 sm:p-6" data-company-modules="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold">{words("title")}</h2>
          <p className="text-sm text-muted-foreground">{words("help")}</p>
          <p className="text-xs text-muted-foreground">{words("alwaysOn")}</p>
        </div>
        {canManage && (
          <Button
            type="button"
            disabled={!changed || save.isPending}
            disabledReason={!changed ? words("noChange") : undefined}
            onClick={() => save.mutate(disabled)}
          >
            <Save className="size-4" />
            {words("save")}
          </Button>
        )}
      </div>
      <p className="text-xs font-medium">{words("count", { on: onCount, total: data.choices.length })}</p>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.choices.map((key) => {
          const outOfPlan = notInPlan.has(key);
          return (
            <label key={key} className="flex items-start gap-2 text-sm" data-module={key} data-off={off.has(key) || undefined}>
              <Checkbox
                checked={!outOfPlan && !off.has(key)}
                disabled={!canManage || outOfPlan}
                onCheckedChange={(next) => setDraft(toggleModule(disabled, key, next === true, data.choices))}
              />
              <span className={outOfPlan ? "text-muted-foreground" : undefined}>
                {label(key)}
                {outOfPlan && <span className="ml-1 text-xs">{words("notInPlan")}</span>}
                {/* JB250: what the tick alone does not say - two modules that
                    share the gate phone, a report fed by 材料进场, one switch
                    for 隐患整改 and 施工准证. */}
                {MODULE_NOTES[key] ? (
                  <span className="block text-xs text-muted-foreground" data-module-note={MODULE_NOTES[key]}>
                    {notes(MODULE_NOTES[key])}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {save.isError && <p className="text-sm text-destructive">{words("saveFailed")}</p>}
    </section>
  );
}
