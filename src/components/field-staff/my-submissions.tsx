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

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  CloudUpload,
  EyeOff,
  FileText,
  Loader2,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { recordStatusLabel } from "@/lib/record-status";

/**
 * The phone names a site record's status the way its own task list does
 * (已完成, 需要重拍), not the office's words - one thing, one name, on one phone.
 */
const PHONE_STATUS = { SITE_RECORD: "fieldStaffPwa.status" };

import { PhotoThumb, recordKindIcon } from "@/components/shared/photo-thumb";
import { ReturnProcessingDialog } from "@/components/contractor-ops/operations-workspaces";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  OriginalBackupBanner,
  RecordOriginalBackup,
  RowOriginalStatus,
} from "@/components/shared/original-backup";
import { useLocalOriginals } from "@/hooks/use-local-originals";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { FieldLoadFailed, FieldLoadNote } from "@/components/field-staff/field-load-note";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import {
  RecordDetailDialog,
  RecordDetailShell,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import { StatusBadge } from "@/components/shared/page-primitives";
import type { ChatRecordKind } from "@/lib/record-chat";
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
  queueErrorKey,
} from "@/services/offline-sync.service";
import { prunePhotoCache } from "@/lib/photo-cache";
import { PhoneStoragePanel } from "@/components/field-staff/phone-storage-panel";
import { ArmRow } from "@/components/shared/page-primitives";
import { useHiddenSubmissions } from "@/hooks/use-hidden-submissions";
import {
  canHideRow,
  hiddenKey,
  hideSubmission,
  pruneHiddenSubmissions,
  withoutHidden,
} from "@/lib/hidden-submissions";

/** Queue kinds that are a submission somebody is waiting on, and their label. */
const QUEUED_KINDS: Record<string, string> = {
  MATERIAL_RECEIPT: "MATERIAL_RECEIPT",
  CATEGORY_EVIDENCE: "SITE_RECORD",
  SAFETY_INCIDENT: "HAZARD",
  SITE_PROGRESS: "PROGRESS",
  WASTE_OUTGOING: "WASTE_OUTGOING",
  // 现场实际退场 sent with no signal (Q29.3): waiting under its return's number.
  MATERIAL_OUTGOING_EXIT: "MATERIAL_OUTGOING",
};

/** The three fields the hazard chat room's header needs. */
export interface HazardHandle {
  id: string;
  title: string;
  incident_no: string;
}

/** The kinds whose records carry a record conversation (the backend's CHAT_SUBJECT_KINDS). */
const CONVERSATION_KINDS = new Set<string>([
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "SUNDRY_CLAIM",
  // MR / Other Request (C05): talk to head office while it is pending.
  "MATERIAL_REQUEST",
]);

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
  // The originals this phone still holds, to show each row's state (H5 三.5).
  const originals = useLocalOriginals(user?.id);
  const [openRow, setOpenRow] = useState<MySubmissionRow | null>(null);
  // The office's 验收 / 不通过 notice for an equipment entry or exit links to
  // `/field-staff?…&movement=<id>` (Fable B4 #15): that movement opens here,
  // with its status, its evidence and the reason it was not accepted.
  const [linkedMovement, setLinkedMovement] = useUrlSelection("movement");
  const [openQueued, setOpenQueued] = useState<string | null>(null);

  // The newest page (client 2026-10-09 五.1/五.2): opening the app reads
  // twenty rows and their thumbnails, never six months of them.
  const stored = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => getMySubmissions(),
  });

  // The older pages, only once the worker asks for them (「加载更早的记录」).
  // Keyed by where the newest page ends: when a new submission pushes that
  // point, the older pages are read again from it, so none is skipped or
  // shown twice.
  const [wantOlder, setWantOlder] = useState(false);
  const firstNext = stored.data?.next_before ?? null;
  const older = useInfiniteQuery({
    queryKey: ["my-submissions", "older", firstNext],
    queryFn: ({ pageParam }) => getMySubmissions(pageParam),
    initialPageParam: firstNext,
    getNextPageParam: (last) => last.next_before ?? undefined,
    enabled: wantOlder && Boolean(firstNext),
  });
  const hasOlder = older.data ? older.hasNextPage : Boolean(firstNext);
  const loadOlder = () => {
    if (!older.data) setWantOlder(true);
    else void older.fetchNextPage();
  };

  // Thumbnails the phone keeps (`public/sw.js`) go when their records leave
  // the company's window (四.2): a picture first kept longer ago than the
  // window belongs to a record older than it.
  // The worker's own 「从我的列表移除」 entries leave with the window too.
  const windowDays = stored.data?.history_window_days;
  useEffect(() => {
    if (!windowDays) return;
    prunePhotoCache(windowDays);
    if (user?.id) pruneHiddenSubmissions(user.id, windowDays);
  }, [windowDays, user?.id]);

  // Records this worker took off their own list (四.4): this phone only.
  const hidden = useHiddenSubmissions(user?.id);
  const hiddenCount = Object.keys(hidden).length;
  // The row whose 「从我的列表移除」 is open in place (tap, then confirm).
  const [removing, setRemoving] = useState<string | null>(null);

  const queued = useQuery({
    queryKey: ["my-submissions", "queued", user?.id],
    queryFn: () => getOfflineQueueEntries(user!.id),
    enabled: Boolean(user?.id),
    // The queue changes without the server being involved, so this cannot
    // rely on an invalidation from a mutation.
    refetchInterval: 15_000,
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(stored.data?.results ?? []),
      ...(older.data?.pages.flatMap((page) => page.results) ?? []),
    ].filter((row) => {
      const key = `${row.kind}:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [stored.data, older.data]);
  const visibleRows = withoutHidden(rows, hidden);
  const linkedRow = linkedMovement
    ? rows.find((row) => row.kind === "EQUIPMENT_MOVEMENT" && row.id === linkedMovement) ?? null
    : null;
  const shownRow = openRow ?? linkedRow;
  const waiting = (queued.data ?? []).filter(
    (entry) => entry.kind in QUEUED_KINDS,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="panel-title">{t("mySubmissions.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
            if (older.data) void older.refetch();
          }}
        >
          <RefreshCw className={stored.isFetching ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* 「同步原图」 for everything waiting (H5 三.4, WP1); nothing when none waits. */}
      <OriginalBackupBanner />

      {/* Queued first: the phone is the only thing that knows these exist. */}
      {waiting.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => setOpenQueued(entry.id)}
          className={`w-full rounded-xl border p-3 text-left transition-colors active:bg-muted/60 ${entry.state === "retrying" ? "border-warning/40 bg-warning/5" : entry.lastError ? "border-destructive/40 bg-destructive/5" : "border-dashed border-panel-border"}`}
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
              {entry.state === "failed"
                ? t("offline.state.failed")
                : entry.state === "retrying"
                  ? t("offline.state.retrying")
                  : entry.lastError
                    ? t("mySubmissions.uploadFailed")
                    : t("mySubmissions.waitingToUpload")}
            </span>
          </div>
          {/* F-230: this sentence was already being stored and nothing read
              it, so a submission the server had refused was invisible to the
              only person who could correct it. */}
          {entry.lastError && (
            <p className="mt-1 text-xs text-destructive">
              {queueErrorKey(entry.lastError)
                ? t(queueErrorKey(entry.lastError) as string)
                : entry.lastError}
            </p>
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

      <FieldLoadNote query={queued} what={t("fieldStaffPwa.what.queued")} />
      {stored.isLoading ? (
        <p className="rounded-xl border border-dashed border-panel-border p-4 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : stored.isError ? (
        <FieldLoadFailed what={t("fieldStaffPwa.what.submissions")} onRetry={() => stored.refetch()} />
      ) : rows.length === 0 && waiting.length === 0 ? (
        <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
          {t("mySubmissions.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map((row) => (
            <li key={`${row.kind}:${row.id}`}>
              <div className="relative">
              {/*
                A button, not a `<li>` with a click handler (T-210). Every row
                here was an inert list item, which is the customer's complaint
                - 「确保『我提交过的』每个东西是可以点进去然后查看详细资料的」 -
                and also why a screen reader had nothing to announce.
              */}
              <button
                type="button"
                className={`surface-panel w-full rounded-xl p-3 text-left transition-colors hover:border-primary/50 active:bg-muted/60 ${canHideRow(row) ? "pr-12" : ""}`}
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
                {/* The submission's photograph on the left (E3); the card
                    itself opens it, so the picture is not a second button. */}
                <PhotoThumb
                  coverUrl={row.cover_photo_url}
                  count={row.photo_count}
                  icon={recordKindIcon(row.kind)}
                  reference={row.reference}
                  openable={false}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.reference}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`mySubmissions.kind.${row.kind}`)}
                    {row.detail ? ` · ${row.detail}` : ""}
                    {row.project_name ? ` · ${row.project_name}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatter.dateTime(row.submitted_at)} · {recordStatusLabel(t, row, PHONE_STATUS)}
                  </p>
                  <RowOriginalStatus
                    summary={row.original_backup}
                    local={originals.rows}
                    photoCount={row.photo_count}
                  />
                </div>
                {row.kind === "HAZARD" && onOpenHazard ? (
                  <MessagesSquare className="mt-1 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                )}
              </div>
              </button>
              {/*
                「从我的列表移除」 (四.4): this worker's phone only - nothing
                is deleted, the office and everyone else are unaffected.
                Two steps in place, no dialog: the first tap opens the
                sentence saying so, the second removes. Never on a queued
                row (not on the server yet) nor on one whose originals are
                still owed (四.6) - `canHideRow`.
              */}
              {canHideRow(row) && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute bottom-1.5 right-1.5 size-9 text-muted-foreground"
                  title={t("mySubmissions.removeFromList")}
                  aria-expanded={removing === hiddenKey(row)}
                  onClick={() =>
                    setRemoving((current) => (current === hiddenKey(row) ? null : hiddenKey(row)))
                  }
                  data-remove-from-list
                >
                  <EyeOff />
                </Button>
              )}
              </div>
              {removing === hiddenKey(row) && user?.id && (
                <div className="mt-1" data-remove-strip>
                <ArmRow>
                  <p className="min-w-0 flex-1 basis-full text-xs leading-5 text-muted-foreground">
                    {t("mySubmissions.removeHelp")}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      hideSubmission(user.id, row);
                      setRemoving(null);
                    }}
                    data-confirm-remove
                  >
                    <EyeOff />
                    {t("mySubmissions.removeFromList")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setRemoving(null)}>
                    {t("common.cancel")}
                  </Button>
                </ArmRow>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <p className="text-center text-xs text-muted-foreground" data-hidden-note>
          {t("mySubmissions.hiddenNote", { count: hiddenCount })}
        </p>
      )}

      {/* Said rather than implied: a list of twenty out of sixty that claims
          to be "everything I sent" is a worse answer than no list. */}
      {hasOlder && stored.data?.count != null && (
        <p className="text-center text-xs text-muted-foreground">
          {t("mySubmissions.truncated", { shown: visibleRows.length, total: stored.data.count })}
        </p>
      )}
      {older.isError ? (
        <FieldLoadFailed what={t("fieldStaffPwa.what.submissions")} onRetry={() => older.refetch()} />
      ) : hasOlder && !stored.isError ? (
        // The next twenty rows and their thumbnails, only when asked for
        // (client 2026-10-09 五.2).
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={older.isFetching}
          disabledReason={t("common.loading")}
          onClick={loadOlder}
          data-load-older
        >
          {older.isFetching ? <Loader2 className="animate-spin" /> : null}
          {t("mySubmissions.loadOlder")}
        </Button>
      ) : null}

      {/*
        Why the list stops where it does (T-330).

        Without this line a short history reads as "my records are gone", and
        the worker's response to that is to photograph the load again - the
        exact behaviour 「我提交过的」 was built to stop. The number comes from
        the server because the window is per-company and adjustable.
      */}
      {Boolean(stored.data?.history_window_days) && (
        <p className="text-center text-xs text-muted-foreground">
          {t("mySubmissions.historyWindow", {
            days: stored.data!.history_window_days,
          })}
        </p>
      )}

      <PhoneStoragePanel windowDays={windowDays} />

      {shownRow && (
        <StoredDetailSheet
          row={shownRow}
          onClose={() => {
            setOpenRow(null);
            setLinkedMovement(null);
          }}
        />
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
/**
 * The statuses that mean "this application is finished, and not approved".
 *
 * Listed rather than derived from a flag because the six record kinds spell it
 * differently in their own vocabularies, and a missing spelling here shows up
 * as a missing sentence rather than as a wrong action - the safer failure of
 * the two.
 */
const RETURNED_STATUSES = new Set([
  "REJECTED",
  "RETURNED",
  "REVISE_RESUBMIT",
  "CANCELLED",
]);

function StoredDetailSheet({
  row,
  onClose,
}: {
  row: MySubmissionRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState(false);
  const detail = useQuery({
    queryKey: ["my-submissions", "detail", row.kind, row.id],
    queryFn: () => getSubmissionDetail(row.kind, row.id),
  });

  return (
    <RecordDetailDialog
      title={row.reference}
      description={`${t(`mySubmissions.kind.${row.kind}`)} · ${formatter.dateTime(row.submitted_at)}`}
      status={<StatusBadge label={recordStatusLabel(t, row, PHONE_STATUS)} tone="neutral" />}
      onClose={onClose}
    >
      {detail.isLoading ? (
        <div className="grid min-h-32 place-items-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : detail.isLoadingError || !detail.data ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t("mySubmissions.loadFailed")}
        </p>
      ) : (
        <RecordDetailShell
          reference={row.reference}
          // The field app: even the large first photo is its thumbnail; the
          // full photo loads only when one is opened (client 2026-10-09 二.4).
          heroFromThumbnail
          // No 记录人 here: the worker is looking at their own record.
          /*
            A returned application is over (D-227).

            客户第 45 条：「被退回的申请**不需要【重新提交】按钮**。一旦退回这笔
            申请就结束，原申请、退回原因和沟通记录全部保留，不再修改原记录。
            要再申请就**新建一条、生成新的记录 ID**。」

            So this dialog offers no action at all on a returned record - and
            says why, because a screen that simply has no buttons reads as a
            screen that is broken or still loading. The worker is told the
            one thing they can do instead.
          */
          notices={
            <>
              {RETURNED_STATUSES.has(row.status) && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm leading-6">
                  {t("mySubmissions.returnedClosed")}
                </p>
              )}
              {/* This record's originals and its own 「同步原图」 (H5 三, WP1). */}
              {detail.data.photos.length > 0 && (
                <RecordOriginalBackup
                  summary={detail.data.original_backup}
                  onSynced={() => void queryClient.invalidateQueries({ queryKey: ["my-submissions"] })}
                />
              )}
            </>
          }
          facts={detail.data.fields.map((field) => ({
            label: t(`mySubmissions.field.${field.key}`),
            value: (
              <span className="whitespace-pre-wrap">
                {field.value}
                {field.unit ? ` ${t(`mySubmissions.unit.${field.unit}`)}` : ""}
              </span>
            ),
            wide: field.value.length > 60 || field.value.includes("\n"),
          }))}
          // The worker's own photographs, served from the API host.
          photos={detail.data.photos.map((shot, index) => ({
            id: shot.id ?? `${index}:${shot.url}`,
            url: shot.url,
            // The strip shows the thumbnail; the full photo is fetched when
            // one is opened (client 2026-10-09 二.4, 五.3).
            thumbnailUrl: shot.thumbnail_url,
            label: shot.caption || row.reference,
          }))}
          /*
            The one action this sheet does offer (D-211): an approved
            material-outgoing application is waiting for the site to deal
            with the material and send the photographs back. It is found
            here because this is where the worker looks for what they sent.
          */
          actions={
            row.kind === "MATERIAL_OUTGOING" && row.status === "APPROVED" && (
              <Button className="h-12 w-full" onClick={() => setReturning(true)}>
                <Camera />
                {t("contractorOps.outgoing.returnProcessing")}
              </Button>
            )
          }
          // The payment result on the applicant's own record (第 57 条):
          // 「手机端只需要把最终付款结果显示出来即可」.
          panel={
            row.kind === "SUNDRY_CLAIM" && (
              <ShellPanel title={t("mySubmissions.paymentProofs")}>
                {(detail.data.payment_proofs ?? []).length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                    {t("mySubmissions.noPaymentProofs")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(detail.data.payment_proofs ?? []).map((proof) => (
                      <a key={proof.id} href={proof.url} target="_blank" rel="noreferrer" className="block">
                        {/\.pdf$/i.test(proof.name ?? "") ? (
                          // The bank's PDF (D11): a file to open, not a photo.
                          <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border p-2 text-center text-2xs">
                            <FileText className="size-6 text-muted-foreground" />
                            <span className="line-clamp-2 break-all">{proof.name}</span>
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proof.url} alt={t("mySubmissions.paymentProofs")} className="aspect-square w-full rounded-md border object-cover" />
                        )}
                        {proof.amount ? <span className="mt-1 block text-xs tabular-nums">RM {proof.amount}</span> : null}
                      </a>
                    ))}
                  </div>
                )}
              </ShellPanel>
            )
          }
          // 【沟通】 on every record the worker sent (T-324, 第 46 条), bound
          // to that record's ID (D-233). Hazards have their own thread and
          // open it from the row instead. The conversation alone, as this
          // sheet always had it (no attachments panel added).
          chat={
            CONVERSATION_KINDS.has(row.kind) && (
              <RecordConversationPanel kind={row.kind as ChatRecordKind} recordId={row.id} />
            )
          }
        />
      )}
      {returning && (
        <ReturnProcessingDialog
          row={{ id: row.id, reference_no: row.reference }}
          onClose={() => setReturning(false)}
          onSaved={() => {
            setReturning(false);
            void queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
            onClose();
          }}
        />
      )}
    </RecordDetailDialog>
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
        ) : entry.isError ? (
          <FieldLoadFailed what={t("fieldStaffPwa.what.queuedEntry")} onRetry={() => entry.refetch()} />
        ) : !entry.data ? (
          // The common race: sync drained the job while the row was tapped.
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("mySubmissions.loadFailed")}
          </p>
        ) : (
          <div className="space-y-3">
            {entry.data.lastError && queueErrorKey(entry.data.lastError) ? (
              // No answer from the server (no signal, timed out): not a
              // refusal, nothing to correct - it goes again by itself (A9).
              <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                <p className="text-sm font-medium text-warning">
                  {t(queueErrorKey(entry.data.lastError) as string)}
                </p>
                <p className="mt-1 text-sm leading-6">{t("mySubmissions.queuedHelp")}</p>
              </div>
            ) : entry.data.lastError ? (
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
