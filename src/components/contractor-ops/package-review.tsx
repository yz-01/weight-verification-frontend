"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, MessagesSquare, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { ThreadView } from "@/components/contractor-ops/package-exchange";
import {
  MoneyBlock,
  ProgressBadge,
  ReviewDialog,
  SignaturesBlock,
  type ReviewRecord,
} from "@/components/contractor-ops/package-review-loop";
import { Shell } from "@/components/contractor-ops/package-shell";
import { PackageItemPictures } from "@/components/contractor-ops/package-item-pictures";
import { PackageSentFiles } from "@/components/contractor-ops/package-sent-files";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import {
  NeedsActionChip,
  NeedsActionMarker,
  useNeedsActionParam,
} from "@/components/shared/needs-action";
import {
  EmptyState,
  ListHeader,
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { useClearSearchParam } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { packageKindName } from "@/lib/package-items";
import type { EvidencePackageRow } from "@/interfaces/contractor-ops";
import {
  exportPackagesToReview,
  getPackagesToReview,
  getPackageToReview,
  getReviewMessages,
  packageAttachmentFile,
  reviewPackageFile,
  reviewPackageItemFile,
  reviewPackageSentFile,
  sendReviewMessage,
  submitPackageReview,
} from "@/services/contractor-ops.service";
import { clickOpensRow } from "@/components/shared/inside-row-control";

/**
 * Packages a consultant has been sent, and their own answer on each record
 * (D-147; batch H, H17 五 2).
 *
 * A consultant finds a package by being one of its recipients, and sees only
 * their own answers and their own thread with the office - never an owner's,
 * a supplier's or another consultant's (H17 六 2). Per record, not per
 * package: 客户「如果顾问或业主不接受其中某一项，可以点击退回给申请者」.
 */

const PAGE_SIZE = 20;

export function PackageReviewWorkspace() {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  // A notice's 「打开」 (?package=) lands on that package.
  const linked = useSearchParams().get("package");
  const clearLinked = useClearSearchParam("package");
  const [chosen, setOpenId] = useState<string | null>(null);
  const openId = chosen ?? linked;
  // 「待处理 N」 (JB226 audit F1): the packages his 仪表板's 「待审阅资料包」
  // counts - a record left to answer, or his signature due. Its link opens
  // this page with `needs_action=1`: only those.
  const [waitingOnly, setWaitingOnly] = useNeedsActionParam();

  const query = useQuery({
    queryKey: ["package-reviews", "list", waitingOnly],
    queryFn: () =>
      getPackagesToReview({ page: 1, page_size: PAGE_SIZE, needs_action: waitingOnly ? "1" : undefined }),
  });
  const rows = query.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("reviewTitle")}
        subtitle={t("reviewSubtitle")}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <NeedsActionChip count={query.data?.needs_action_count} active={waitingOnly} onToggle={setWaitingOnly} />
            {/* The queue as a file (H16): this consultant's own state and returns. */}
            <ExportButton
              // His own 顾问申请 / 资料包 work: as before, 「导出」 or not (JB210).
              ownWork
              disabled={rows.length === 0}
              disabledReason={t("reviewEmpty")}
              title={t("reviewTitle")}
              onExport={(format) =>
                exportPackagesToReview({
                  format,
                  title: t("reviewTitle"),
                  query: {},
                  columns: [
                    { key: "package_no", label: t("export.number") },
                    { key: "name", label: t("column.name") },
                    { key: "project_name", label: t("column.project") },
                    { key: "item_count", label: t("column.items") },
                    { key: "current_round", label: t("export.round") },
                    {
                      key: "review_state",
                      label: t("column.review"),
                      values: {
                        NOT_SENT: t("reviewMine.NOT_SENT"),
                        SENT: t("reviewMine.SENT"),
                        REVIEWED: t("reviewMine.REVIEWED"),
                      },
                    },
                    { key: "returned_count", label: t("export.returned") },
                    { key: "confirmed_at", label: t("export.confirmedAt") },
                  ],
                })
              }
            />
          </div>
        }
      />

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <LoadFailed what={t("what.packagesToReview")} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        // With 「待处理」 on, the empty list is "nothing waits for you", not "nothing sent".
        <EmptyState icon={Inbox} title={t(waitingOnly ? "reviewNothingWaiting" : "reviewEmpty")} />
      ) : (
        <ul className="surface-panel divide-y divide-panel-border overflow-hidden rounded-xl">
          {rows.map((row: EvidencePackageRow) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6 cursor-pointer"
              onClick={(event) => {
                if (clickOpensRow(event)) setOpenId(row.id);
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {row.package_no ? `${row.package_no} · ` : ""}
                  {row.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.project_name} · {t("itemCount", { count: row.item_count })}
                  {(row.current_round ?? 1) > 1 && <> · {t("exchange.round", { n: row.current_round ?? 1 })}</>}
                  {" · "}
                  {formatter.dateTime(row.sent_at ?? row.created_at)}
                </p>
              </div>
              <NeedsActionMarker show={row.needs_action} />
              {/* JB252: his own 「审阅」 in the client's words. */}
              {row.review_progress ? (
                <ProgressBadge progress={row.review_progress} />
              ) : (
                <StatusBadge
                  label={t(`reviewMine.${row.review_state}`)}
                  tone={row.review_state === "REVIEWED" ? "positive" : "warning"}
                />
              )}
              <Button size="sm" variant="outline" onClick={() => setOpenId(row.id)}>
                {t("open")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <ReviewSheet
          id={openId}
          onClose={() => {
            setOpenId(null);
            clearLinked();
          }}
        />
      )}
    </div>
  );
}

function ReviewSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("multiEngine");
  const loop = useTranslations("jb252");
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  // JB252: confirm / approve / return in one signed review (opinion, signature, PIN).
  const [reviewing, setReviewing] = useState(false);
  // The first load is the open the office sees (H17 四 5); a refetch is not.
  const opened = useRef(false);
  // JB189 「沟通」: this consultant's own thread with the office, below.
  const chat = useRef<HTMLElement | null>(null);

  const detail = useQuery({
    queryKey: ["package-reviews", "detail", id],
    queryFn: () => {
      const first = !opened.current;
      opened.current = true;
      return getPackageToReview(id, first);
    },
  });
  const thread = useQuery({
    queryKey: ["package-reviews", "messages", id],
    queryFn: () => getReviewMessages(id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["package-reviews"] });

  const data = detail.data;
  const mine = data?.recipient;
  const open = Boolean(data?.can_return);
  const records: ReviewRecord[] = (data?.items ?? []).map((item) => ({
    id: item.id,
    label: item.reference || packageKindName(t, item),
    detail: packageKindName(t, item),
    mine: item.review_state,
    reason: item.returned_reason,
  }));

  return (
    <Shell title={data ? `${data.package_no ? `${data.package_no} · ` : ""}${data.name}` : t("reviewTitle")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : detail.isLoadingError || !data ? (
          <LoadFailed what={t("what.package")} onRetry={() => void detail.refetch()} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {data.project_name}
              {(data.current_round ?? 1) > 1 && <> · {t("exchange.round", { n: data.current_round ?? 1 })}</>}
              {" · "}
              {t("packedBy", { name: data.created_by_name || "—", when: formatter.dateTime(data.created_at) })}
            </p>
            {data.remarks && <p className="text-sm">{data.remarks}</p>}
            <div className="flex flex-wrap gap-2">
              <FileActionButtons
                // His own 顾问申请 / 资料包 work: as before, 「导出」 or not (JB210).
                ownWork
                allowSave
                source={{
                  load: () => reviewPackageFile(id, data.package_no || data.name, true),
                  loadToSend: () => reviewPackageFile(id, data.package_no || data.name),
                  title: data.package_no || data.name,
                  project: data.project,
                  recordKind: "EVIDENCE_PACKAGE",
                  recordId: id,
                }}
              />
              {/* JB189 (客户 11-13: 「顾问及业主点击后…进入该资料包对应的沟通事项」;
                  Lucas chose A): a consultant has no 「沟通记录」 page - this
                  goes to their own thread on this package, the one below. */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => chat.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                data-package-talk
              >
                <MessagesSquare className="size-4" />
                {t("exchange.talk")}
              </Button>
            </div>
            {/* JB252: where his own review stands, in the list's words; 资料传阅
                is read only. */}
            <div className="flex flex-wrap items-center gap-2">
              <ProgressBadge progress={data.review_progress} />
              {data.purpose === "CIRCULATION" && (
                <StatusBadge label={loop("purpose.CIRCULATION")} tone="neutral" />
              )}
            </div>
            <MoneyBlock pkg={data} />
            {data.can_review && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
                data-consultant-review
              >
                <p className="min-w-0 flex-1 text-sm">
                  {loop("review.waiting", { count: records.filter((row) => row.mine === "PENDING").length })}
                </p>
                <Button size="sm" onClick={() => setReviewing(true)}>
                  <PenLine className="size-4" />
                  {loop("review.button")}
                </Button>
              </div>
            )}
            {mine?.signed_at ? (
              <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                {t("exchange.signedBy", { name: mine.signed_name, when: formatter.dateTime(mine.signed_at) })}
              </p>
            ) : !open && data.purpose !== "CIRCULATION" && !data.completed_at ? (
              /* D-148 / HD18: the package left the platform; reading and
                 the chat still work, an answer does not. */
              <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs">
                {t("exportedNoReturn")}
              </p>
            ) : null}
            {/* JB307-1: the files the project manager uploaded, each to open. */}
            <PackageSentFiles
              files={data.files ?? []}
              load={(file, inline) => reviewPackageSentFile(id, file.id, file.name, inline)}
              ownWork
              project={data.project}
              recordId={id}
            />
            <ul className="space-y-2">
              {data.items.map((item) => {
                return (
                  <li key={item.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.reference || packageKindName(t, item)}</p>
                        <p className="text-xs text-muted-foreground">
                          {packageKindName(t, item)} ·{" "}
                          {t("partsSummary", {
                            fields: item.fields.length,
                            photos: item.photos.length,
                            documents: item.documents.length,
                            files: (item.files ?? []).length,
                          })}
                          {(item.round_no ?? 1) > 1 && <> · {t("exchange.newInRound", { n: item.round_no ?? 1 })}</>}
                        </p>
                        <PackageItemPictures
                          reference={item.reference}
                          photos={item.photos}
                          documents={item.documents}
                        />
                      </div>
                      <FileActionButtons
                        // His own 顾问申请 / 资料包 work: as before, 「导出」 or not (JB210).
                        ownWork
                        allowSave
                        source={{
                          load: () => reviewPackageItemFile(id, item.id, item.reference, true),
                          title: item.reference || packageKindName(t, item),
                          project: data.project,
                          recordKind: item.record_kind,
                          recordId: item.record_id,
                        }}
                      />
                    </div>
                    {item.review_state === "RETURNED" ? (
                      <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {t("returnedWithReason", { reason: item.returned_reason })}
                      </p>
                    ) : item.review_state === "ACCEPTED" ? (
                      <p className="text-xs text-primary">{t("itemAccepted")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <SignaturesBlock signatures={data.signatures} />

            <section ref={chat} className="scroll-mt-4 space-y-2" data-package-chat>
              <h3 className="panel-title">{t("exchange.tab.chat")}</h3>
              {thread.isError ? (
                <LoadFailed what={t("exchange.tab.chat")} onRetry={() => void thread.refetch()} />
              ) : (
                <ThreadView
                  record={{ recordKind: "EVIDENCE_PACKAGE", recordId: id, project: data.project }}
                  messages={thread.data ?? []}
                  loading={thread.isLoading}
                  items={data.items.map((item) => ({ id: item.id, label: item.reference || packageKindName(t, item) }))}
                  ownSide="RECIPIENT"
                  otherName={t("exchange.office")}
                  canWrite
                  onSend={async (payload) => {
                    await sendReviewMessage(id, payload);
                    await queryClient.invalidateQueries({ queryKey: ["package-reviews", "messages", id] });
                  }}
                  openAttachment={(message) => packageAttachmentFile(message.attachment_url, message.attachment_name)}
                />
              )}
            </section>
          </>
        )}
      </div>
      {reviewing && data && (
        <ReviewDialog
          pkg={data}
          records={records}
          onClose={() => setReviewing(false)}
          submit={(payload) => submitPackageReview(id, payload)}
          onDone={() => void refresh()}
        />
      )}
    </Shell>
  );
}
