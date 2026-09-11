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
import {
  AlertTriangle,
  ChevronRight,
  CloudUpload,
  Loader2,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  MySubmissionField,
  MySubmissionRow,
} from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import {
  getMySubmissions,
  getSubmissionDetail,
} from "@/services/contractor.service";
import {
  getOfflineQueueEntries,
  getQueuedSubmissionDetail,
} from "@/services/offline-sync.service";

/** Queue kinds that are a submission somebody is waiting on, and their label. */
const QUEUED_KINDS: Record<string, string> = {
  MATERIAL_RECEIPT: "MATERIAL_RECEIPT",
  CATEGORY_EVIDENCE: "SITE_RECORD",
  SAFETY_INCIDENT: "HAZARD",
  SITE_PROGRESS: "PROGRESS",
  WASTE_OUTGOING: "WASTE_OUTGOING",
};

/** The three fields the hazard chat room's header needs. */
export interface HazardHandle {
  id: string;
  title: string;
  incident_no: string;
}

export function MySubmissions({
  onOpenHazard,
}: {
  /**
   * Where a hazard row goes (D-109). The customer asked for 「可以直接上报然后
   * 进聊天室就好了」, so on the field app a hazard opens its conversation
   * rather than a field sheet.
   *
   * Optional because the driver app renders this same component and has no
   * hazard chat behind it - there, a hazard row opens the ordinary sheet. A
   * driver reports no hazards, so in practice the row is not there either;
   * the fallback exists so the component cannot render a dead row if that
   * ever changes.
   */
  onOpenHazard?: (hazard: HazardHandle) => void;
} = {}) {
  const t = useTranslations();
  const formatter = useDateFormat();
  const { user } = useAuth();
  const [openRow, setOpenRow] = useState<MySubmissionRow | null>(null);
  const [openQueued, setOpenQueued] = useState<string | null>(null);

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
        <button
          key={entry.id}
          type="button"
          onClick={() => setOpenQueued(entry.id)}
          className={`w-full rounded-lg border p-3 text-left transition-colors active:bg-muted/60 ${entry.lastError ? "border-destructive/40 bg-destructive/5" : "border-dashed"}`}
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
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {formatter.dateTime(entry.queuedAt)}
            {entry.attempts > 0
              ? ` · ${t("mySubmissions.attempts", { count: entry.attempts })}`
              : ""}
            <ChevronRight className="ml-auto size-4 shrink-0" />
          </p>
        </button>
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
            <li key={`${row.kind}:${row.id}`}>
              {/*
                A button, not a `<li>` with a click handler (T-210). Every row
                here was an inert list item, which is the customer's complaint
                - 「确保『我提交过的』每个东西是可以点进去然后查看详细资料的」 -
                and also why a screen reader had nothing to announce.
              */}
              <button
                type="button"
                className="w-full rounded-lg border p-3 text-left transition-colors active:bg-muted/60"
                onClick={() => {
                  if (row.kind === "HAZARD" && onOpenHazard) {
                    onOpenHazard({
                      id: row.id,
                      title: row.detail || row.reference,
                      incident_no: row.reference,
                    });
                    return;
                  }
                  setOpenRow(row);
                }}
              >
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
                {row.kind === "HAZARD" && onOpenHazard ? (
                  <MessagesSquare className="mt-1 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                )}
              </div>
              </button>
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

      {openRow && (
        <StoredDetailSheet row={openRow} onClose={() => setOpenRow(null)} />
      )}
      {openQueued && user?.id && (
        <QueuedDetailSheet
          ownerId={user.id}
          jobId={openQueued}
          onClose={() => setOpenQueued(null)}
        />
      )}
    </section>
  );
}

/** One field row of a detail sheet, label translated, unit appended. */
function FieldRows({ fields }: { fields: MySubmissionField[] }) {
  const t = useTranslations();
  return (
    <dl className="divide-y rounded-lg border">
      {fields.map((field) => (
        <div key={field.key} className="grid grid-cols-3 gap-2 px-3 py-2">
          <dt className="text-xs text-muted-foreground">
            {t(`mySubmissions.field.${field.key}`)}
          </dt>
          <dd className="col-span-2 whitespace-pre-wrap break-words text-sm">
            {field.value}
            {field.unit ? ` ${t(`mySubmissions.unit.${field.unit}`)}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A row the server holds, opened.
 *
 * Fetched on open rather than carried in the list: the list is six tables
 * merged and capped, and putting every field and every photograph of forty
 * rows into it would make the screen that answers "did it arrive" slow for the
 * sake of the one row somebody taps.
 */
function StoredDetailSheet({
  row,
  onClose,
}: {
  row: MySubmissionRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const formatter = useDateFormat();
  const detail = useQuery({
    queryKey: ["my-submissions", "detail", row.kind, row.id],
    queryFn: () => getSubmissionDetail(row.kind, row.id),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">{row.reference}</DialogTitle>
          <DialogDescription>
            {t(`mySubmissions.kind.${row.kind}`)} ·{" "}
            {formatter.dateTime(row.submitted_at)} · {row.status_label}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : detail.isError || !detail.data ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("mySubmissions.loadFailed")}
          </p>
        ) : (
          <div className="space-y-3">
            <FieldRows fields={detail.data.fields} />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("mySubmissions.photos")}
            </p>
            {detail.data.photos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("mySubmissions.noPhotos")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {detail.data.photos.map((shot) => (
                  // The worker's own photographs, served from the API host.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={shot.url}
                    src={shot.url}
                    alt={shot.caption || row.reference}
                    className="aspect-square w-full rounded-md border object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A submission still on this phone, opened.
 *
 * The reason this is a separate sheet rather than the same one: there is no
 * server record to ask about. Everything shown here is read out of the queue -
 * including the photographs, which exist only as blobs on this device until
 * the upload succeeds. For a failed upload the server's own refusal is the
 * point of opening it at all; it has been stored since F-230 with nothing
 * reading it back.
 */
function QueuedDetailSheet({
  ownerId,
  jobId,
  onClose,
}: {
  ownerId: string;
  jobId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const formatter = useDateFormat();
  const entry = useQuery({
    queryKey: ["my-submissions", "queued", ownerId, jobId],
    queryFn: () => getQueuedSubmissionDetail(ownerId, jobId),
  });

  // Object URLs, not data URIs: these blobs are full-size photographs and
  // base64 would triple them in memory. Revoked on close, or the phone leaks
  // one set per row the worker opens.
  const blobs = entry.data?.photos;
  const urls = useMemo(
    () => (blobs ?? []).map((blob) => URL.createObjectURL(blob)),
    [blobs],
  );
  useEffect(
    () => () => {
      for (const url of urls) URL.revokeObjectURL(url);
    },
    [urls],
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("mySubmissions.queuedTitle")}</DialogTitle>
          <DialogDescription>
            {entry.data
              ? `${t(`mySubmissions.kind.${QUEUED_KINDS[entry.data.kind] ?? "SITE_RECORD"}`)} · ${formatter.dateTime(entry.data.queuedAt)}`
              : t("common.loading")}
          </DialogDescription>
        </DialogHeader>

        {entry.isLoading ? (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : !entry.data ? (
          // The common race: sync drained the job while the row was tapped.
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("mySubmissions.loadFailed")}
          </p>
        ) : (
          <div className="space-y-3">
            {entry.data.lastError ? (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-sm font-medium text-destructive">
                  {t("mySubmissions.failedHelp")}
                </p>
                <p className="mt-1 text-sm text-destructive">
                  {entry.data.lastError}
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm leading-6">
                {t("mySubmissions.queuedHelp")}
              </p>
            )}

            {entry.data.fields.length > 0 && (
              <FieldRows fields={entry.data.fields} />
            )}

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("mySubmissions.photos")}
            </p>
            {urls.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("mySubmissions.noPhotos")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {urls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt={t("mySubmissions.photos")}
                    className="aspect-square w-full rounded-md border object-cover"
                  />
                ))}
              </div>
            )}

            {entry.data.attempts > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {t("mySubmissions.attempts", { count: entry.data.attempts })}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
