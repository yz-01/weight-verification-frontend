"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { companyMenuName, type MenuNames } from "@/lib/menu-names";

/**
 * A menu item's name as this company shows it (JB251, 客户 11-24 事项 2):
 * the company's own name in the reader's language when MSE has opened
 * renaming for it and one was given, else the system name.
 *
 * Takes the full message key (`nav.equipment`, `nav.submodule.siteEquipment`).
 * A key that is not a menu name (a report tab, a consultant's item) is never
 * in the company's names, so it reads the system words as before.
 */
export function navLabelOf(
  names: MenuNames | null | undefined,
  locale: string,
  key: string,
  system: (key: string) => string,
): string {
  return companyMenuName(names, locale, key) ?? system(key);
}

export function useNavLabel(): (key: string) => string {
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuth();
  const names = user?.company_preferences?.menu_names;
  return useCallback(
    (key: string) => navLabelOf(names, locale, key, (system) => t(system as never)),
    [names, locale, t],
  );
}
