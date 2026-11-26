"use client";

/**
 * 菜单名称 on MSE's company page (JB251, 客户 11-24 事项 2): 「能否由 MSE Admin
 * 开放菜单名称自定义权限，让每家客户公司的授权登录用户自行修改菜单显示名称？」
 *
 * Next to 业务模块 (JB250). One switch, 「允许这家公司自己改菜单名称」, and the
 * names this company changed - so MSE can tell what a customer means on the
 * phone. Off keeps the names and stops showing them; on again shows them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Toggle } from "@/components/site-access/settings-fields";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import type { MenuNames } from "@/lib/menu-names";
import { getCompanyMenuNames, setCompanyMenuNamesEnabled } from "@/services/menu-names.service";

/** The changed names in menu order, each with its languages in the app's order. */
export function changedMenuNames(
  names: MenuNames,
  keys: readonly string[],
): { key: string; names: { language: string; name: string }[] }[] {
  return keys
    .filter((key) => names[key])
    .map((key) => ({
      key,
      names: LOCALES.flatMap((language) => {
        const name = names[key]?.[language];
        return name ? [{ language, name }] : [];
      }),
    }))
    .filter((row) => row.names.length > 0);
}

export function CompanyMenuNamesPanel({ companyId }: { companyId: string }) {
  const t = useTranslations();
  const words = useTranslations("jb251.mse");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["companies", "menu-names", companyId];
  const query = useQuery({ queryKey, queryFn: () => getCompanyMenuNames(companyId) });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setCompanyMenuNamesEnabled(companyId, enabled),
    onSuccess: (row) => queryClient.setQueryData(queryKey, row),
  });

  if (!query.data) {
    return (
      <section id="company-menu-names" className="scroll-mt-20 space-y-3 border-t p-4 sm:p-6">
        <h2 className="text-base font-semibold">{words("title")}</h2>
        <QueryFailedNote query={query} what={words("title")} />
      </section>
    );
  }
  const data = query.data;
  // Only a builder's and a recycler's menus can be renamed.
  if (!data.keys.length) return null;
  const changed = changedMenuNames(data.names, data.keys);

  return (
    <section id="company-menu-names" className="scroll-mt-20 space-y-3 border-t p-4 sm:p-6" data-company-menu-names-mse="">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{words("title")}</h2>
        <p className="text-sm text-muted-foreground">{words("help")}</p>
      </div>
      <Toggle
        label={words("switch")}
        checked={data.enabled}
        disabled={!can("company.update") || toggle.isPending}
        onChange={(next) => toggle.mutate(next)}
      />
      {toggle.isError && <p className="text-sm text-destructive">{words("saveFailed")}</p>}
      <div className="space-y-2" data-menu-names-changed={changed.length}>
        <p className="text-xs font-medium">{words("changed", { count: changed.length })}</p>
        {changed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{words("none")}</p>
        ) : (
          <>
            {!data.enabled && <p className="text-xs text-muted-foreground">{words("hiddenNow")}</p>}
            <ul className="divide-y rounded-lg border text-sm">
              {changed.map((row) => (
                <li key={row.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-3">
                  <span className="text-muted-foreground">{t(row.key as never)}</span>
                  <span className="min-w-0 break-words">
                    {row.names.map((entry, index) => (
                      <span key={entry.language}>
                        {index > 0 && " · "}
                        <span className="text-xs text-muted-foreground">{LOCALE_LABELS[entry.language as keyof typeof LOCALE_LABELS]}：</span>
                        {entry.name}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
