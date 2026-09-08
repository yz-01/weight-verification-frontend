"use client";

import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { PORTAL_NAVIGATION, type PortalFeatureKey } from "@/lib/navigation";

export function RecyclerModuleLanding({ feature }: { feature: PortalFeatureKey }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const item = PORTAL_NAVIGATION.MSE_SCRAP.find((entry) => entry.feature === feature);
  const children = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (item?.children ?? []).filter((child) =>
      (!child.feature || user?.features.includes(child.feature)) &&
      (!term || t(child.labelKey).toLocaleLowerCase().includes(term)),
    );
  }, [item, query, t, user?.features]);
  if (!item) return null;
  const Icon = item.icon;
  return <div className="mx-auto w-full max-w-[90rem] space-y-6">
    <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><div><p className="text-xs text-muted-foreground">{t("contractorModuleLanding.chooseAction")}</p><h1 className="text-2xl font-semibold">{t(`nav.${item.labelKey}`)}</h1></div></div>
      <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("contractorModuleLanding.searchPlaceholder")} placeholder={t("contractorModuleLanding.searchPlaceholder")} className="pl-9" /></div>
    </header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children.map((child) => <Link key={child.href} href={child.href} className="group flex min-h-32 flex-col justify-between rounded-xl border bg-card p-5 shadow-sm hover:border-primary/30"><span className="flex justify-between"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><SlidersHorizontal className="size-4" /></span><ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" /></span><span className="font-semibold">{t(child.labelKey)}</span></Link>)}</section>
  </div>;
}
