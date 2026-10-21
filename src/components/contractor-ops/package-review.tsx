"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { ThreadView } from "@/components/contractor-ops/package-exchange";
import { Shell } from "@/components/contractor-ops/package-shell";
import { PackageItemPictures } from "@/components/contractor-ops/package-item-pictures";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import {
  ArmRow,
  EmptyState,
  FieldWrapper,
  ListHeader,
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useClearSearchParam } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import type { EvidencePackageRow } from "@/interfaces/contractor-ops";
import {
  exportPackagesToReview,
  getPackagesToReview,
  getPackageToReview,
  getReviewMessages,
  packageAttachmentFile,
  reviewPackageFile,
  reviewPackageItemFile,
  reviewPackageItem,
  sendReviewMessage,
  signReviewedPackage,
} from "@/services/contractor-ops.service";

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

  const query = useQuery({
    queryKey: ["package-reviews"],
    queryFn: () => getPackagesToReview({ page: 1, page_size: PAGE_SIZE }),
  });
  const rows = query.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("reviewTitle")}
        subtitle={t("reviewSubtitle")}
        action={
          /* The queue as a file (H16): this consultant's own state and returns. */
          <ExportButton
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
        }
      />

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <LoadFailed what={t("what.packagesToReview")} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("reviewEmpty")} />
      ) : (
        <ul className="surface-panel divide-y divide-panel-border overflow-hidden rounded-xl">
          {rows.map((row: EvidencePackageRow) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
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
              <StatusBadge
                label={t(`reviewMine.${row.review_state}`)}
                tone={row.review_state === "REVIEWED" ? "positive" : "warning"}
              />
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
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  // The first load is the open the office sees (H17 四 5); a refetch is not.
  const opened = useRef(false);

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
  const decide = useMutation({
    mutationFn: (input: { item: string; decision: "ACCEPTED" | "RETURNED"; reason: string }) =>
      reviewPackageItem(id, input.item, input.decision, input.reason),
    onSuccess: () => {
      refresh();
      setReturning(null);
      setChanging(null);
      setReason("");
    },
  });
  const sign = useMutation({
    mutationFn: () => signReviewedPackage(id),
    onSuccess: () => {
      setArmed(false);
      refresh();
    },
  });

  const data = detail.data;
  const mine = data?.recipient;
  const open = Boolean(data?.can_return);

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
                allowSave
                source={{
                  load: () => reviewPackageFile(id, data.package_no || data.name, true),
                  loadToSend: () => reviewPackageFile(id, data.package_no || data.name),
                  title: data.package_no || data.name,
                }}
              />
            </div>
            {mine?.signed_at ? (
              <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                {t("exchange.signedBy", { name: mine.signed_name, when: formatter.dateTime(mine.signed_at) })}
              </p>
            ) : !open ? (
              /* D-148 / HD18: the package left the platform; reading and
                 the chat still work, an answer does not. */
              <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs">
                {t("exportedNoReturn")}
              </p>
            ) : null}
            <ul className="space-y-2">
              {data.items.map((item) => {
                const answered = item.review_state !== "PENDING" && changing !== item.id;
                return (
                  <li key={item.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.reference || t(`kind.${item.record_kind}`)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`kind.${item.record_kind}`)} ·{" "}
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
                        allowSave
                        source={{
                          load: () => reviewPackageItemFile(id, item.id, item.reference, true),
                          title: item.reference || t(`kind.${item.record_kind}`),
                        }}
                      />
                    </div>
                    {answered ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {item.review_state === "RETURNED" ? (
                          <p className="min-w-0 flex-1 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            {t("returnedWithReason", { reason: item.returned_reason })}
                          </p>
                        ) : (
                          <p className="min-w-0 flex-1 text-xs text-primary">{t("itemAccepted")}</p>
                        )}
                        {open && (
                          <Button size="sm" variant="ghost" onClick={() => setChanging(item.id)}>
                            <PenLine className="size-4" />
                            {t("exchange.changeAnswer")}
                          </Button>
                        )}
                      </div>
                    ) : returning === item.id ? (
                      <div className="space-y-2">
                        <FieldWrapper label={t("field.returnReason")} required hint={t("returnReasonHelp")}>
                          <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
                        </FieldWrapper>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setReturning(null)}>
                            {t("cancelReturn")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            requires={[[reason.trim(), t("field.returnReason")]]}
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ item: item.id, decision: "RETURNED", reason })}
                          >
                            {t("returnItem")}
                          </Button>
                        </div>
                      </div>
                    ) : open ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ item: item.id, decision: "ACCEPTED", reason: "" })}
                        >
                          {t("acceptItem")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReturning(item.id);
                            setReason("");
                          }}
                        >
                          {t("returnItem")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {data.can_sign && (
              /* 「签收」 is final: the switch first (规矩 8), then the button. */
              <ArmRow className="border-primary/25 bg-primary/5">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <Switch className="mt-0.5" checked={armed} onCheckedChange={setArmed} aria-label={t("exchange.sign")} />
                  <span className="text-xs leading-5 text-muted-foreground">{t("exchange.signHelp")}</span>
                </label>
                <Button
                  size="sm"
                  disabled={!armed || sign.isPending}
                  disabledReason={t("exchange.armFirst")}
                  onClick={() => sign.mutate()}
                >
                  {t("exchange.sign")}
                </Button>
              </ArmRow>
            )}
            {open && !data.can_sign && !mine?.signed_at && (
              <p className="text-xs text-muted-foreground">{t("exchange.signAfterResubmit")}</p>
            )}

            <section className="space-y-2">
              <h3 className="panel-title">{t("exchange.tab.chat")}</h3>
              {thread.isError ? (
                <LoadFailed what={t("exchange.tab.chat")} onRetry={() => void thread.refetch()} />
              ) : (
                <ThreadView
                  messages={thread.data ?? []}
                  loading={thread.isLoading}
                  items={data.items.map((item) => ({ id: item.id, label: item.reference || t(`kind.${item.record_kind}`) }))}
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
    </Shell>
  );
}
