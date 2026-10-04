"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Images, Loader2, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import {
  FieldWrapper,
  ListHeader,
  LoadFailed,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  getFieldTasks,
  transitionFieldTask,
} from "@/services/contractor-ops.service";
import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";

/**
 * Every photo submission waiting on a reviewer, on one page.
 *
 * Before this the only way to find them was to open each project's task list
 * in turn, so a submission on a site nobody happened to look at sat there.
 *
 * Accepting is what files the photos into their category — the category was
 * chosen when the site submitted, so there is nothing to move by hand, and a
 * returned submission never reaches the category at all.
 *
 * Since Phase 6 this sits inside MR / Other Request (D02), and the decided
 * ones are listed too: the same PHOTO site tasks, with their photos, who
 * decided and why, read-only. Nothing about them was moved or rewritten.
 */
/** Rows per request; more come with 【Load more】. */
const PAGE_SIZE = 50;

export function PhotoApprovals() {
  return <FieldDraft scope="photo-approvals"><PhotoApprovalsContent /></FieldDraft>;
}

function PhotoApprovalsContent() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [returningId, setReturningId] = useDraftState("returningId", "");
  const [note, setNote] = useDraftState("note", "");
  const [shown, setShown] = useState<"SUBMITTED" | "ACCEPTED" | "RETURNED">("SUBMITTED");
  const clearDraft = useClearDraft();
  const pending = shown === "SUBMITTED";

  // Page by page, so the history is all reachable (D02): an approved or
  // returned photo submission from two years ago is still one 【Load more】
  // away, not cut off at the newest fifty.
  const waiting = useInfiniteQuery({
    queryKey: ["field-tasks", "photo-approvals", shown],
    queryFn: ({ pageParam }) =>
      getFieldTasks({ task_type: "PHOTO", status: shown, page: pageParam, page_size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const total = waiting.data?.pages[0]?.count ?? 0;

  const decide = useMutation({
    mutationFn: ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: FieldTask["status"];
      reason?: string;
    }) => transitionFieldTask(id, status, reason ?? ""),
    onSuccess: () => {
      setReturningId("");
      setNote("");
      clearDraft();
      // The category browse changes too: accepting is what puts the photos
      // there, so a stale evidence list would show the old answer.
      void queryClient.invalidateQueries({ queryKey: ["field-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["evidence"] });
    },
  });

  const rows = waiting.data?.pages.flatMap((page) => page.results) ?? [];
  const returning = rows.find((task) => task.id === returningId) ?? null;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <ListHeader
        title={t("photoApprovals.title")}
        subtitle={
          waiting.isError
            ? t("common.emptyValue")
            : pending
              ? t("photoApprovals.subtitle", { count: total })
              : t("photoApprovals.historyCount", { count: total })
        }
        action={
          <div className="flex gap-1 rounded-lg border p-1" role="tablist" aria-label={t("photoApprovals.show")}>
            {(["SUBMITTED", "ACCEPTED", "RETURNED"] as const).map((status) => (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={shown === status}
                onClick={() => setShown(status)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${shown === status ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {t(`photoApprovals.filter.${status}`)}
              </button>
            ))}
          </div>
        }
      />

      {waiting.isError ? (
        <LoadFailed what={t("photoApprovals.what")} onRetry={() => void waiting.refetch()} />
      ) : waiting.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {pending ? t("photoApprovals.empty") : t("photoApprovals.historyEmpty")}
        </p>
      ) : (
        <div className="grid gap-4">
          {rows.map((task) => (
            <article
              key={task.id}
              className="rounded-xl border bg-card p-4 shadow-sm"
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{task.title}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {/* Where accepting will file it, said before the decision
                        rather than discovered afterwards. */}
                    {task.category_name ?? t("photoApprovals.noCategory")} ·{" "}
                    {task.project_name} · {task.assigned_to_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.submitted_at ? df.dateTime(task.submitted_at) : "—"}
                  </p>
                </div>
                {pending ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => setReturningId(task.id)}
                  >
                    <X className="size-4" />
                    {t("photoApprovals.return")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ id: task.id, status: "ACCEPTED" })
                    }
                  >
                    {decide.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {t("photoApprovals.accept")}
                  </Button>
                </div>
                ) : (
                  // Decided: who, when and why, read-only (D02).
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{t(`photoApprovals.filter.${task.status === "RETURNED" ? "RETURNED" : "ACCEPTED"}`)}</p>
                    <p>{task.reviewed_by_name ?? "—"}</p>
                    <p>{task.reviewed_at ? df.dateTime(task.reviewed_at) : "—"}</p>
                  </div>
                )}
              </header>

              {!pending && task.review_note && (
                <p className="mt-3 rounded-lg border px-3 py-2 text-sm">
                  <span className="mr-1 text-xs text-muted-foreground">{t("photoApprovals.reviewNote")}</span>
                  {task.review_note}
                </p>
              )}

              {task.instructions && (
                <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
                  {task.instructions}
                </p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {task.photos.map((photo) => (
                  <figure key={photo.id} className="overflow-hidden rounded-lg border">
                    <div className="relative aspect-square bg-muted">
                      <Image
                        src={photo.watermarked || photo.image}
                        alt={photo.caption || task.title}
                        fill
                        sizes="(max-width: 640px) 50vw, 200px"
                        className="object-cover"
                      />
                    </div>
                    <figcaption className="p-2 text-xs text-muted-foreground">
                      <span className="block truncate">
                        {photo.caption || t("photoApprovals.noCaption")}
                      </span>
                      {photo.latitude && photo.longitude ? (
                        <span className="mt-0.5 flex items-center gap-1">
                          <MapPin className="size-3" />
                          {Number(photo.latitude).toFixed(4)},{" "}
                          {Number(photo.longitude).toFixed(4)}
                        </span>
                      ) : (
                        // Said, not hidden: a photo with no fix is weaker
                        // evidence and the reviewer should know before deciding.
                        <span className="mt-0.5 block text-warning">
                          {t("photoApprovals.noLocation")}
                        </span>
                      )}
                    </figcaption>
                  </figure>
                ))}
                {task.photos.length === 0 && (
                  <p className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
                    <Images className="size-4" />
                    {t("photoApprovals.noPhotos")}
                  </p>
                )}
              </div>
            </article>
          ))}
          {waiting.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={waiting.isFetchingNextPage}
              disabledReason={waiting.isFetchingNextPage ? t("common.loading") : undefined}
              onClick={() => void waiting.fetchNextPage()}
            >
              {waiting.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
              {t("photoApprovals.loadMore", { shown: rows.length, total })}
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={returning !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReturningId("");
            setNote("");
            clearDraft();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("photoApprovals.returnTitle")}</DialogTitle>
            <DialogDescription>
              {t("photoApprovals.returnHelp")}
            </DialogDescription>
          </DialogHeader>
          <FieldWrapper label={t("photoApprovals.returnReason")} required>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("photoApprovals.returnPlaceholder")}
            />
          </FieldWrapper>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReturningId(""); setNote(""); clearDraft(); }}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              // A return with no reason sends somebody back to site without
              // telling them what to reshoot.
              requires={[[note.trim(), t("photoApprovals.returnReason")]]}
              disabled={decide.isPending}
              onClick={() =>
                returning &&
                decide.mutate({
                  id: returning.id,
                  status: "RETURNED",
                  reason: note.trim(),
                })
              }
            >
              {decide.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              {t("photoApprovals.return")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
