"use client";

/**
 * "Did what I sent actually arrive?"
 *
 * The customer reported the gap as 「现场工作人员和司机手机端上传资料的时候，手机
 * 上没有，不能够存记录没有历史记录」 - the phone keeps no record of what was
 * uploaded.
 *
 * **This is an evidence-chain problem, not a convenience one.** With nothing on
 * screen proving a submission landed, somebody on site either photographs the
 * same delivery again, so the load exists twice, or assumes it failed and
 * stops sending, so the evidence is missing entirely (F-228).
 *
 * Three states share one list, deliberately:
 *
 * - **待上传** - still in the offline queue. Shown first, because the phone is
 *   the only place that knows about it.
 * - **上传失败** - the queue tried and the server refused. F-230 found that the
 *   refusal was already being stored in `lastError` with nothing anywhere
 *   reading it, so a rejected submission was invisible to the one person who
 *   could fix it.
 * - everything the server has.
 *
 * A queued row and a stored row look alike on purpose: the worker's question is
 * "is my work recorded", and splitting the answer across two screens is how
 * they end up re-photographing.
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CloudUpload, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useDateFormat } from "@/lib/dates";
import { getMySubmissions } from "@/services/contractor.service";
import { getOfflineQueueEntries } from "@/services/offline-sync.service";

/** Queue kinds that are a submission somebody is waiting on, and their label. */
const QUEUED_KINDS: Record<string, string> = {
  MATERIAL_RECEIPT: "MATERIAL_RECEIPT",
  CATEGORY_EVIDENCE: "SITE_RECORD",
  SAFETY_INCIDENT: "HAZARD",
  SITE_PROGRESS: "PROGRESS",
  WASTE_OUTGOING: "WASTE_OUTGOING",
};

export function MySubmissions() {
  const t = useTranslations();
  const formatter = useDateFormat();
  const { user } = useAuth();

  const stored = useQuery({
    queryKey: ["my-submissions"],
    queryFn: getMySubmissions,
  });

  const queued = useQuery({
    queryKey: ["my-submissions", "queued", user?.id],
    queryFn: () => getOfflineQueueEntries(user!.id),
    enabled: Boolean(user?.id),
    // The queue changes without the server being involved, so this cannot
    // rely on an invalidation from a mutation.
    refetchInterval: 15_000,
  });

  const rows = stored.data?.results ?? [];
  const waiting = (queued.data ?? []).filter(
    (entry) => entry.kind in QUEUED_KINDS,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("mySubmissions.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("mySubmissions.subtitle")}
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          title={t("mySubmissions.refresh")}
          disabled={stored.isFetching}
          disabledReason={t("common.loading")}
          onClick={() => {
            void stored.refetch();
            void queued.refetch();
          }}
        >
          <RefreshCw className={stored.isFetching ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Queued first: the phone is the only thing that knows these exist. */}
      {waiting.map((entry) => (
        <div
          key={entry.id}
          className={`rounded-lg border p-3 ${entry.lastError ? "border-destructive/40 bg-destructive/5" : "border-dashed"}`}
        >
          <div className="flex items-center gap-2">
            {entry.lastError ? (
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
            ) : (
              <CloudUpload className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {entry.reference || t(`mySubmissions.kind.${QUEUED_KINDS[entry.kind]}`)}
            </span>
            <span className={`shrink-0 text-xs ${entry.lastError ? "text-destructive" : "text-muted-foreground"}`}>
              {entry.lastError
                ? t("mySubmissions.uploadFailed")
                : t("mySubmissions.waitingToUpload")}
            </span>
          </div>
          {/* F-230: this sentence was already being stored and nothing read
              it, so a submission the server had refused was invisible to the
              only person who could correct it. */}
          {entry.lastError && (
            <p className="mt-1 text-xs text-destructive">{entry.lastError}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatter.dateTime(entry.queuedAt)}
            {entry.attempts > 0
              ? ` · ${t("mySubmissions.attempts", { count: entry.attempts })}`
              : ""}
          </p>
        </div>
      ))}

      {stored.isLoading ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : rows.length === 0 && waiting.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("mySubmissions.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.id}`} className="rounded-lg border p-3">
              <div className="flex items-start gap-3">
                {row.photo ? (
                  // A plain <img>: these are the worker's own photographs
                  // served from the API host, not build-time assets.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photo}
                    alt={row.reference}
                    className="size-14 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-md border bg-muted/40 text-[10px] text-muted-foreground">
                    {t(`mySubmissions.kind.${row.kind}`)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.reference}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`mySubmissions.kind.${row.kind}`)}
                    {row.detail ? ` · ${row.detail}` : ""}
                    {row.project_name ? ` · ${row.project_name}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatter.dateTime(row.submitted_at)} · {row.status_label}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Said rather than implied: a list of forty out of sixty that claims to
          be "everything I sent" is a worse answer than no list. */}
      {stored.data?.truncated && (
        <p className="text-center text-xs text-muted-foreground">
          {t("mySubmissions.truncated", { shown: rows.length, total: stored.data.count })}
        </p>
      )}
    </section>
  );
}
