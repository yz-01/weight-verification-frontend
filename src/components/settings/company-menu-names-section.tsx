"use client";

/**
 * 公司设置 › 菜单名称 (JB251, 客户 11-24 事项 2): 「让每家客户公司的授权登录用户自行
 * 修改菜单显示名称？例如：「设备管理」可以改成「设备租赁管理」。修改只影响该公司的
 * 菜单显示，不影响其他公司，也不改变原有功能、数据及权限。」
 *
 * Shown only once MSE has opened it for the company. One row per menu name of
 * the company's own menu, in menu order (main items, then the pages under
 * them): the system name, the company's name in the reader's language (the
 * other three under 【其他语言】), and 【恢复系统名称】. Whoever holds
 * 公司设置's manage right types and saves; everyone else reads. The server
 * checks the same rules (MSE's switch, the right, the menu's own names, 1–20
 * characters, no line breaks or markup) and records every save.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, PencilLine, RotateCcw, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ErrorBanner, SectionTitle } from "@/components/site-access/settings-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";
import type { Portal } from "@/interfaces/auth";
import {
  MENU_NAME_MAX_LENGTH,
  RENAMEABLE_PORTALS,
  cleanMenuNames,
  companyMenuNameRows,
  menuNameProblem,
  withMenuName,
  withoutMenuName,
  type MenuNameRow,
  type MenuNames,
} from "@/lib/menu-names";
import { cn } from "@/lib/utils";
import { getOwnMenuNames, setOwnMenuNames } from "@/services/menu-names.service";

export const MENU_NAMES_ANCHOR = "company-menu-names";
const QUERY_KEY = ["company-menu-names", "own"] as const;

/** Whether the typed names differ from the saved ones. */
export function menuNamesChanged(draft: MenuNames, saved: MenuNames): boolean {
  return JSON.stringify(sortNames(cleanMenuNames(draft))) !== JSON.stringify(sortNames(cleanMenuNames(saved)));
}

function sortNames(names: MenuNames): MenuNames {
  const out: MenuNames = {};
  for (const key of Object.keys(names).sort()) {
    const byLanguage = names[key] ?? {};
    out[key] = Object.fromEntries(Object.keys(byLanguage).sort().map((language) => [language, byLanguage[language]]));
  }
  return out;
}

/** Every typed name that the server would refuse, `key.language` → what is wrong. */
export function menuNameProblems(names: MenuNames): Record<string, "tooLong" | "lineBreak" | "markup"> {
  const out: Record<string, "tooLong" | "lineBreak" | "markup"> = {};
  for (const [key, byLanguage] of Object.entries(names)) {
    for (const [language, value] of Object.entries(byLanguage ?? {})) {
      const problem = menuNameProblem(value ?? "");
      if (problem) out[`${key}.${language}`] = problem;
    }
  }
  return out;
}

export function CompanyMenuNamesSection() {
  const { user } = useAuth();
  const portal = user?.portal;
  if (!portal || !(RENAMEABLE_PORTALS as readonly string[]).includes(portal)) return null;
  return <MenuNamesLoader portal={portal} />;
}

function MenuNamesLoader({ portal }: { portal: Portal }) {
  // query-failure: the block stays hidden, as for a company MSE has not opened it for; the menu keeps the names 「我」 sent.
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getOwnMenuNames });
  // Nothing at all until MSE opens it: the page looks as it always has.
  if (!query.data?.enabled) return null;
  return <MenuNamesBlock portal={portal} saved={query.data.names} features={query.data.features} />;
}

function MenuNamesBlock({ portal, saved, features }: { portal: Portal; saved: MenuNames; features: string[] }) {
  const t = useTranslations("jb251.company");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const { can, refresh } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("company_settings.manage");
  const rows = useMemo(() => companyMenuNameRows(portal, features), [portal, features]);
  const [draft, setDraft] = useState<MenuNames | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const names = draft ?? saved;
  const problems = menuNameProblems(names);
  const changed = draft !== null && menuNamesChanged(draft, saved);
  const hasProblem = Object.keys(problems).length > 0;
  const save = useMutation({
    mutationFn: () => setOwnMenuNames(cleanMenuNames(names)),
    onSuccess: async (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setDraft(null);
      // The menu, the page title and the search read the names from 「我」.
      await refresh();
    },
  });
  const changedCount = Object.keys(cleanMenuNames(names)).length;
  const others = LOCALES.filter((code) => code !== locale);

  const problemText = (problem: "tooLong" | "lineBreak" | "markup") =>
    t(`problem.${problem}`, { max: MENU_NAME_MAX_LENGTH });

  const field = (row: MenuNameRow, language: Locale, label: string) => {
    const value = names[row.key]?.[language] ?? "";
    const problem = problems[`${row.key}.${language}`];
    return (
      <label className="grid gap-1" key={language}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <Input
          value={value}
          disabled={!canManage}
          maxLength={MENU_NAME_MAX_LENGTH + 10}
          placeholder={t("blankHint")}
          aria-invalid={problem ? true : undefined}
          onChange={(event) => setDraft(withMenuName(names, row.key, language, event.target.value))}
          data-menu-name-input={`${row.key}.${language}`}
        />
        {problem && <span className="text-xs text-destructive">{problemText(problem)}</span>}
      </label>
    );
  };

  return (
    <section id={MENU_NAMES_ANCHOR} className="scroll-mt-20 space-y-4 rounded-xl" data-company-menu-names="">
      <SectionTitle
        icon={PencilLine}
        title={t("title")}
        description={t("subtitle")}
        action={
          canManage ? (
            <Button
              type="button"
              disabled={!changed || hasProblem || save.isPending}
              disabledReason={!changed ? t("noChange") : hasProblem ? t("fixFirst") : undefined}
              onClick={() => save.mutate()}
            >
              <Save />
              {t("save")}
            </Button>
          ) : undefined
        }
      />
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm" data-menu-names-scope="">
        {t("scope")}
      </p>
      {save.isError && <ErrorBanner text={t("saveFailed")} />}
      <div className="surface-panel overflow-hidden rounded-xl">
        <div className="hidden grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>{t("systemName")}</span>
          <span>{t("ownNameIn", { language: LOCALE_LABELS[locale] })}</span>
          <span className="sr-only">{t("restore")}</span>
        </div>
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">{t("changedCount", { count: changedCount })}</p>
        <ul className="divide-y">
          {rows.map((row) => {
            const own = names[row.key];
            const hasOwn = Boolean(own && Object.values(own).some((value) => value?.trim()));
            const expanded = open.has(row.key);
            const system = tRoot(row.key as never);
            const value = own?.[locale] ?? "";
            const problem = problems[`${row.key}.${locale}`];
            return (
              <li key={row.key} className="px-4 py-3" data-menu-name-row={row.key} data-depth={row.depth}>
                <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:gap-3">
                  <span
                    className={cn(
                      "min-w-0 break-words pt-2 text-sm",
                      row.depth === 0 ? "font-semibold" : "text-muted-foreground",
                    )}
                    style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                  >
                    {row.depth > 0 && <span aria-hidden>└ </span>}
                    {system}
                  </span>
                  <div className="grid gap-1">
                    <Input
                      value={value}
                      disabled={!canManage}
                      maxLength={MENU_NAME_MAX_LENGTH + 10}
                      placeholder={t("blankHint")}
                      aria-label={t("ownNameFor", { name: system })}
                      aria-invalid={problem ? true : undefined}
                      onChange={(event) => setDraft(withMenuName(names, row.key, locale, event.target.value))}
                      data-menu-name-input={`${row.key}.${locale}`}
                    />
                    {problem && <span className="text-xs text-destructive">{problemText(problem)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setOpen((current) => {
                          const next = new Set(current);
                          if (next.has(row.key)) next.delete(row.key);
                          else next.add(row.key);
                          return next;
                        })
                      }
                      aria-expanded={expanded}
                    >
                      <Languages className="size-4" />
                      {t("otherLanguages")}
                    </Button>
                    {canManage && hasOwn && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDraft(withoutMenuName(names, row.key))}
                        data-menu-name-restore={row.key}
                      >
                        <RotateCcw className="size-4" />
                        {t("restore")}
                      </Button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="mt-3 grid gap-3 sm:ml-[14rem] sm:grid-cols-3 sm:pl-3">
                    {others.map((language) => field(row, language, LOCALE_LABELS[language]))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
