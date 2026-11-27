"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";

/** A module's name as the menu and MSE's 业务模块 panel say it. */
export function useModuleName(): (key: string) => string {
  const t = useTranslations();
  return (key: string) =>
    t.has(`subscriptions.featureName.${key}`)
      ? t(`subscriptions.featureName.${key}`)
      : t.has(`nav.${key}`)
        ? t(`nav.${key}`)
        : key;
}

/**
 * 「材料进场 没有开通，这个报表没有资料。」 (JB250): a report whose source module
 * the company does not have says so, instead of listing that module's records
 * or failing with a refusal the reader cannot read.
 */
export function ModuleOffNotice({ modules, title }: { modules: readonly string[]; title?: string }) {
  const t = useTranslations("jb250fix");
  const name = useModuleName();
  return (
    <section className="surface-panel space-y-2 rounded-2xl p-6 text-center" data-module-off={modules.join(",")}>
      {title ? <h1 className="text-lg font-semibold">{title}</h1> : null}
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Ban className="size-4 shrink-0" aria-hidden />
        {t("reportModuleOff", { modules: modules.map(name).join("、") })}
      </p>
    </section>
  );
}
