"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  addFieldTaskPhoto,
  getFieldTask,
  transitionFieldTask,
} from "@/services/contractor-ops.service";

const OPEN_FOR_RESULT: FieldTask["status"][] = ["OPEN", "IN_PROGRESS", "RETURNED"];

/**
 * One task, opened (C16, C17): what was asked, by when, of whom, the result,
 * its photos and files, and the conversation - with the two actions B18 has:
 * the assignee's 【提交结果】 (words, photos, files - from the desk, for a
 * head-office task) and the confirmer's 【确认完成】 / 【退回】 (with a reason).
 *
 * Who may confirm is the server's rule: the publisher of a head-office task
 * (or whoever takes over an inactive one), any task manager for a site task -
 * never the assignee. The buttons follow it; the server enforces it.
 */
export function FieldTaskSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("headquarters.tasks");
  const ops = useTranslations("contractorOps");
  const df = useDateFormat();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const task = useQuery({ queryKey: ["field-tasks", "detail", id], queryFn: () => getFieldTask(id) });
  const [result, setResult] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["field-tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["contractor-dashboard"] });
  };
  const submit = useMutation({
    mutationFn: async (row: FieldTask) => {
      for (const file of photos) {
        await addFieldTaskPhoto(row.id, file, {
          captured_at: new Date().toISOString(),
          client_event_id: crypto.randomUUID(),
        });
      }
      return transitionFieldTask(row.id, "SUBMITTED", result.trim());
    },
    onSuccess: () => {
      setResult("");
      setPhotos([]);
      refresh();
    },
  });
  const decide = useMutation({
    mutationFn: ({ row, status }: { row: FieldTask; status: "ACCEPTED" | "RETURNED" }) =>
      transitionFieldTask(row.id, status, status === "RETURNED" ? reason.trim() : ""),
    onSuccess: () => {
      setReturning(false);
      setReason("");
      refresh();
    },
  });

  const row = task.data;
  const mine = row?.assigned_to === user?.id;
  const headOffice = row?.origin === "HQ";
  const maySubmit = !!row && mine && headOffice && OPEN_FOR_RESULT.includes(row.status);
  const mayDecide =
    !!row &&
    row.status === "SUBMITTED" &&
    !mine &&
    (headOffice
      ? row.created_by === user?.id || (can("field_task.manage") && can("project.view_all"))
      : can("field_task.manage"));
  const overdue = !!row?.is_overdue;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{row?.title ?? t("loading")}</DialogTitle>
          {row && (
            <DialogDescription>
              {[row.project_name, headOffice ? t("fromHeadOffice") : t("fromSite")].join(" · ")}
            </DialogDescription>
          )}
        </DialogHeader>
        {task.isError ? (
          <LoadFailed onRetry={() => void task.refetch()} />
        ) : !row ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-4" data-field-task-sheet={row.origin}>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
              <Fact label={t("status")}>
                <StatusBadge
                  label={ops(`taskStatus.${row.status}`)}
                  tone={row.status === "ACCEPTED" ? "positive" : row.status === "RETURNED" ? "warning" : "info"}
                />
                {overdue && <StatusBadge label={t("overdue")} tone="danger" />}
              </Fact>
              <Fact label={t("assignee")}>{row.assigned_to_name}</Fact>
              <Fact label={t("publisher")}>
                {row.created_by_name || "—"} · {df.dateTime(row.created_at)}
              </Fact>
              <Fact label={t("due")}>{row.due_at ? df.dateTime(row.due_at) : "—"}</Fact>
              <Fact label={t("content")} wide>
                <span className="whitespace-pre-wrap">{row.instructions || "—"}</span>
              </Fact>
              {(row.result_note || row.submitted_at) && (
                <Fact label={t("result")} wide>
                  <span className="whitespace-pre-wrap">{row.result_note || "—"}</span>
                  {row.submitted_at && (
                    <span className="block text-xs text-muted-foreground">
                      {t("submittedAt", { at: df.dateTime(row.submitted_at) })}
                    </span>
                  )}
                </Fact>
              )}
              {row.reviewed_at && (
                <Fact label={row.status === "RETURNED" ? t("returnedBy") : t("confirmedBy")} wide>
                  {row.reviewed_by_name || "—"} · {df.dateTime(row.reviewed_at)}
                  {row.review_note && (
                    <span className="block whitespace-pre-wrap text-muted-foreground">{row.review_note}</span>
                  )}
                </Fact>
              )}
            </dl>

            {row.photos.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {row.photos.map((photo) => (
                  <li key={photo.id}>
                    <img
                      src={photo.watermarked || photo.image}
                      alt={photo.caption || row.title}
                      className="aspect-square w-full rounded-md border object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}

            {maySubmit && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" data-task-submit>
                <FieldWrapper label={t("resultLabel")} required>
                  <Textarea rows={4} value={result} onChange={(event) => setResult(event.target.value)} />
                </FieldWrapper>
                <FieldWrapper label={t("photosLabel")} optional={t("optional")}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
                    className="block w-full text-sm"
                  />
                  {photos.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {photos.map((file) => (
                        <li key={`${file.name}-${file.size}`}>
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="size-16 rounded-md border object-cover"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </FieldWrapper>
                <p className="text-xs text-muted-foreground">{t("filesHelp")}</p>
                <div className="flex justify-end">
                  <Button
                    requires={[[result.trim(), t("resultLabel")]]}
                    disabled={submit.isPending}
                    onClick={() => submit.mutate(row)}
                  >
                    {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                    {t("submit")}
                  </Button>
                </div>
              </div>
            )}

            {mayDecide && (
              <div className="space-y-2 rounded-lg border p-3" data-task-decide>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setReturning((open) => !open)}>
                    <RotateCcw />
                    {t("return")}
                  </Button>
                  <Button disabled={decide.isPending} onClick={() => decide.mutate({ row, status: "ACCEPTED" })}>
                    <Check />
                    {t("confirm")}
                  </Button>
                </div>
                {returning && (
                  <div className="space-y-2">
                    <FieldWrapper label={t("returnReason")} required>
                      <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
                    </FieldWrapper>
                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        requires={[[reason.trim(), t("returnReason")]]}
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ row, status: "RETURNED" })}
                      >
                        {t("returnConfirm")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <RecordAttachmentsPanel kind="FIELD_TASK" recordId={row.id} />
            <RecordConversationPanel kind="FIELD_TASK" recordId={row.id} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-1.5">{children}</dd>
    </div>
  );
}
