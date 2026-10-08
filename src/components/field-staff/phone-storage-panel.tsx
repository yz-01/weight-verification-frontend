"use client";

/**
 * 「本机存储与清理」 under the worker's own list (client 2026-10-09 四.3, 四.5,
 * 四.6, 五.6, 五.7; Lucas's decisions 3 and 4).
 *
 * Shows what the phone keeps as a cache (photos, roughly how many megabytes)
 * and what it holds that is not safe anywhere else yet - those are named as
 * kept, with their counts. 「清理本地记录」 clears the cached photos only.
 *
 * Anti-mistap is a switch, not a dialog (spec rule 8, decision 3): the
 * switch's own words say exactly what goes and what stays; the button is
 * live only while it is on, and clears at once.
 *
 * Read only when opened: counting the cache walks every kept thumbnail, which
 * the home screen should not pay for on every visit.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, HardDrive, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
import { ArmRow } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useHiddenSubmissions } from "@/hooks/use-hidden-submissions";
import { unhideAllSubmissions } from "@/lib/hidden-submissions";
import {
  clearPhotoCaches,
  megabytes,
  photoCacheSummary,
  protectedOnPhone,
  readPhoneHoldings,
  storageUsage,
  type PhotoCacheSummary,
  type ProtectedOnPhone,
} from "@/lib/local-cleanup";

export interface PhoneStorageSummary {
  photos: PhotoCacheSummary;
  kept: ProtectedOnPhone;
  /** The browser's figure for everything the app stores; null when it will not say. */
  usage: number | null;
}

async function readSummary(userId: string): Promise<PhoneStorageSummary> {
  const [photos, holdings, usage] = await Promise.all([
    photoCacheSummary().catch(() => ({ count: 0, bytes: 0 })),
    readPhoneHoldings(userId),
    storageUsage(),
  ]);
  return { photos, kept: protectedOnPhone(holdings, userId), usage: usage?.usage ?? null };
}

export function PhoneStoragePanel({ windowDays }: { windowDays?: number }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const hidden = useHiddenSubmissions(user?.id);
  const userId = user?.id ?? "";

  // Every read inside falls back to "none here", so this cannot fail.
  // query-failure: cannot fail (each read falls back to zero); loading is shown.
  const summary = useQuery({
    queryKey: ["phone-storage", userId],
    queryFn: () => readSummary(userId),
    enabled: open && Boolean(userId),
    staleTime: 0,
  });

  const clean = useMutation({
    mutationFn: () => clearPhotoCaches(),
    onSuccess: (cleared) => {
      setArmed(false);
      toast.success(
        t("phoneStorage.cleaned", { count: cleared.count, mb: megabytes(cleared.bytes) }),
      );
      void summary.refetch();
    },
    onError: () => toast.error(t("phoneStorage.cleanFailed")),
  });

  if (!userId) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full text-muted-foreground"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setArmed(false);
        }}
        data-phone-storage-toggle
      >
        <HardDrive />
        {t("phoneStorage.open")}
        <ChevronDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </Button>
      {open &&
        (summary.data ? (
          <PhoneStorageView
            summary={summary.data}
            hiddenCount={Object.keys(hidden).length}
            windowDays={windowDays}
            armed={armed}
            onArmedChange={setArmed}
            cleaning={clean.isPending}
            onClean={() => clean.mutate()}
            onShowHidden={() => unhideAllSubmissions(userId)}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-panel-border p-4 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ))}
    </div>
  );
}

/** The panel itself, from its numbers - rendered alone in tests. */
export function PhoneStorageView({
  summary,
  hiddenCount,
  windowDays,
  armed,
  onArmedChange,
  cleaning,
  onClean,
  onShowHidden,
}: {
  summary: PhoneStorageSummary;
  hiddenCount: number;
  windowDays?: number;
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  cleaning: boolean;
  onClean: () => void;
  onShowHidden: () => void;
}) {
  const t = useTranslations();
  const { photos, kept, usage } = summary;
  const nothing = photos.count === 0;
  return (
    <section className="surface-panel space-y-3 rounded-xl p-3" data-phone-storage>
      <div>
        <h3 className="text-sm font-semibold">{t("phoneStorage.title")}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("phoneStorage.intro")}</p>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium" data-cached-photos>
          {t("phoneStorage.cachedPhotos", { count: photos.count, mb: megabytes(photos.bytes) })}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("phoneStorage.cachedHelp")}
          {windowDays ? ` ${t("phoneStorage.autoNote", { days: windowDays })}` : ""}
        </p>
        {usage != null && usage > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("phoneStorage.appUsage", { mb: megabytes(usage) })}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-success/30 bg-success/5 p-2.5" data-phone-kept>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <ShieldCheck className="size-3.5" />
          {t("phoneStorage.keptTitle")}
        </p>
        <ul className="mt-1 space-y-0.5 text-sm">
          <li>{t("phoneStorage.unsent", { count: kept.unsent })}</li>
          <li>{t("phoneStorage.drafts", { count: kept.drafts })}</li>
          <li>
            {t("phoneStorage.originals", {
              count: kept.originals,
              mb: megabytes(kept.originalBytes),
            })}
          </li>
        </ul>
      </div>

      {hiddenCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{t("phoneStorage.hidden", { count: hiddenCount })}</p>
          <Button type="button" size="sm" variant="outline" onClick={onShowHidden} data-show-hidden>
            {t("phoneStorage.showHidden")}
          </Button>
        </div>
      )}

      <ArmRow>
        <label className="flex min-w-0 flex-1 items-start gap-3">
          <Switch
            tone="danger"
            className="mt-0.5"
            checked={armed}
            onCheckedChange={onArmedChange}
            aria-label={t("phoneStorage.clean")}
            data-arm-clean
          />
          <span className="text-xs leading-5 text-muted-foreground">
            {t("phoneStorage.armClean", {
              photos: photos.count,
              mb: megabytes(photos.bytes),
              unsent: kept.unsent,
              drafts: kept.drafts,
              originals: kept.originals,
            })}
          </span>
        </label>
      </ArmRow>
      <Button
        type="button"
        variant="destructive"
        className="h-11 w-full"
        disabled={!armed || nothing || cleaning}
        disabledReason={
          nothing ? t("phoneStorage.nothingToClean") : !armed ? t("phoneStorage.armFirst") : t("common.loading")
        }
        onClick={onClean}
        data-clean-local
      >
        {cleaning ? <Loader2 className="animate-spin" /> : <Trash2 />}
        {t("phoneStorage.clean")}
      </Button>
    </section>
  );
}
