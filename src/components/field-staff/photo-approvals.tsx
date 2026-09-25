"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Images, Loader2, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

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
 */
export function PhotoApprovals() {
  return <FieldDraft scope="photo-approvals"><PhotoApprovalsContent /></FieldDraft>;
}

function PhotoApprovalsContent() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [returningId, setReturningId] = useDraftState("returningId", "");
  const [note, setNote] = useDraftState("note", "");
  const clearDraft = useClearDraft();

  const waiting = useQuery({
    queryKey: ["field-tasks", "photo-approvals"],
    queryFn: () =>
      getFieldTasks({ task_type: "PHOTO", status: "SUBMITTED", page_size: 50 }),
  });

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

  const rows = waiting.data?.results ?? [];
  const returning = rows.find((task) => task.id === returningId) ?? null;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <ListHeader
        title={t("photoApprovals.title")}
        subtitle={waiting.isError ? t("common.emptyValue") : t("photoApprovals.subtitle", { count: waiting.data?.count ?? 0 })}
      />

      {waiting.isError ? (
        <LoadFailed what={t("photoApprovals.what")} onRetry={() => void waiting.refetch()} />
      ) : waiting.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t("photoApprovals.empty")}
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
              </header>

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
