"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import {
  CONSULTANT_MODULES,
  ITEMS_OF_MODULE,
  ITEM_MESSAGE_KEYS,
  MODULE_MESSAGE_KEYS,
  moduleItemState,
  toggleItem,
  toggleModuleTicks,
  type ConsultantTicks,
} from "@/lib/consultant-modules";
import { cn } from "@/lib/utils";

/**
 * The 11 module ticks, with 材料管理's five items and 工程进度's four under
 * them (JB225, 客户 11-19 事项 5: 「以上各项请设置独立的勾选权限，由建筑商总部自行
 * 决定开放哪些内容给顾问」). Used by the grant dialog (总部 → 顾问管理) and by
 * 「顾问项目默认权限」 (MSE 后台 → 公司 → 锁定设定), so both read the same.
 *
 * Each item is named in the client's words with one line saying where it is.
 * A module with items is ticked when all are, shows 「已勾 N 项，共 M 项」 when
 * some are, and ticking it ticks all of them; unticking it unticks all.
 */
export function ConsultantModuleTicks({
  ticks,
  onChange,
  disabled = false,
  compact = false,
}: {
  ticks: ConsultantTicks;
  onChange: (next: ConsultantTicks) => void;
  disabled?: boolean;
  /** The company default's denser grid (no hint under a module without items). */
  compact?: boolean;
}) {
  const t = useTranslations("consultantAccess");
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-slot="consultant-module-ticks">
      {CONSULTANT_MODULES.map((key) => {
        const name = t(`module.${MODULE_MESSAGE_KEYS[key]}`);
        const items = ITEMS_OF_MODULE[key];
        if (!items) {
          return (
            <label key={key} className="flex min-h-11 items-start gap-3 rounded-lg border p-3" data-module={key}>
              <Checkbox
                checked={ticks.modules.includes(key)}
                disabled={disabled}
                aria-label={name}
                onCheckedChange={(value) => onChange(toggleModuleTicks(ticks, key, value === true))}
              />
              <span className="min-w-0 text-sm">
                <span className="block font-medium">{name}</span>
                {!compact && (
                  <span className="block text-xs text-muted-foreground">{t(`moduleHint.${MODULE_MESSAGE_KEYS[key]}`)}</span>
                )}
              </span>
            </label>
          );
        }
        const state = moduleItemState(ticks, key);
        const held = items.filter((item) => ticks.items.includes(item)).length;
        return (
          <div key={key} className="rounded-lg border p-3 sm:col-span-2" data-module={key} data-state={state}>
            <label className="flex min-h-11 items-start gap-3">
              <Checkbox
                checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                disabled={disabled}
                aria-label={name}
                onCheckedChange={() => onChange(toggleModuleTicks(ticks, key, state !== "all"))}
              />
              <span className="min-w-0 text-sm">
                <span className="block font-medium">
                  {name}
                  {state === "some" && (
                    <span className="ml-2 text-xs font-normal text-warning" data-slot="partial-count">
                      {t("grant.partialCount", { held, total: items.length })}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{t(`moduleHint.${MODULE_MESSAGE_KEYS[key]}`)}</span>
              </span>
            </label>
            <div className="mt-1 space-y-1 border-l-2 border-muted pl-3 sm:ml-7" role="group" aria-label={name}>
              {items.map((item) => {
                const itemName = t(`item.${ITEM_MESSAGE_KEYS[item]}`);
                return (
                  <label
                    key={item}
                    className={cn("flex min-h-11 items-start gap-3 rounded-md px-2 py-2", !disabled && "hover:bg-muted/50")}
                    data-item={item}
                  >
                    <Checkbox
                      checked={ticks.items.includes(item)}
                      disabled={disabled}
                      aria-label={itemName}
                      onCheckedChange={(value) => onChange(toggleItem(ticks, item, value === true))}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium">{itemName}</span>
                      <span className="block text-xs text-muted-foreground">{t(`itemHint.${ITEM_MESSAGE_KEYS[item]}`)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
