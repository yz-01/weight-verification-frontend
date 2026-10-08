"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, MapPin, RotateCcw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import { consultantTaskTitle } from "@/lib/consultant-task-title";
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
 *
 * Since E8 (Q31) it is the record-detail popup every module uses, and the one
 * detail of every task: the 现场任务 list opens it for a site task too, in
 * place of the strip that used to unfold under the row, so it carries what
 * that strip showed - the phone's 「这次要顾问看什么」, the work location,
 * the reference material, the photo count with its GPS link, and the
 * consultant application a request was sent on as.
 */
export function FieldTaskSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("headquarters.tasks");
  const ops = useTranslations("contractorOps");
  // The four 「这次要顾问看什么」 answers by name, not by code (2026-10 F4).
  const askFor = useTranslations("fieldStaffPwa.consultantCapture");
  const askOption = (code: string) =>
    askFor.has(`askOption.${code}`) ? askFor(`askOption.${code}` as never) : null;
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

  if (task.isError || !row) {
    return (
      <RecordDetailDialog title={t("loading")} onClose={onClose}>
        {task.isError ? (
          <LoadFailed onRetry={() => void task.refetch()} />
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </RecordDetailDialog>
    );
  }

  const gpsPhoto = row.photos.find((photo) => photo.latitude && photo.longitude);
  const sentOn = row.consultant_application ?? null;
  const category = row.submission_category
    ? askOption(row.submission_category) ?? row.submission_category
    : null;

  return (
    <RecordDetailDialog
      title={consultantTaskTitle(row, askOption)}
      description={[row.project_name, headOffice ? t("fromHeadOffice") : t("fromSite")].join(" · ")}
      status={
        <>
          <StatusBadge
            label={ops(`taskStatus.${row.status}`)}
            tone={row.status === "ACCEPTED" ? "positive" : row.status === "RETURNED" ? "warning" : "info"}
          />
          {overdue && <StatusBadge label={t("overdue")} tone="danger" />}
        </>
      }
      onClose={onClose}
    >
      <div data-field-task-sheet={row.origin}>
        <RecordDetailShell
          reference={row.title}
          facts={[
            { label: t("assignee"), value: row.assigned_to_name },
            {
              label: t("publisher"),
              value: `${row.created_by_name || "—"} · ${df.dateTime(row.created_at)}`,
            },
            { label: t("due"), value: row.due_at ? df.dateTime(row.due_at) : "—" },
            ...(category ? [{ label: askFor("askFor"), value: category }] : []),
            ...(row.work_location
              ? [{ label: askFor("workLocation"), value: row.work_location }]
              : []),
            {
              label: t("content"),
              value: <span className="whitespace-pre-wrap">{row.instructions || "—"}</span>,
              wide: true,
            },
          ]}
          photos={row.photos.map((photo) => ({
            id: photo.id,
            url: photo.watermarked || photo.image,
            label: photo.caption || row.title,
            takenAt: photo.captured_at,
            latitude: photo.latitude,
            longitude: photo.longitude,
          }))}
          photoActions={
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {ops("tasks.photos", {
                  current: row.photos.length,
                  required: row.evidence_required,
                })}
              </span>
              {gpsPhoto ? (
                <a
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  href={`https://www.google.com/maps?q=${gpsPhoto.latitude},${gpsPhoto.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="size-3.5" />
                  {ops("tasks.openGps")}
                </a>
              ) : null}
            </div>
          }
          panel={
            row.references.length ? (
              <ShellPanel title={ops("tasks.references", { count: row.references.length })}>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {row.references.map((reference) =>
                    reference.kind === "PHOTO" ? (
                      <a key={reference.id} href={reference.file} target="_blank" rel="noreferrer">
                        <Image
                          src={reference.file}
                          alt={reference.label || reference.original_filename}
                          width={180}
                          height={180}
                          unoptimized
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                      </a>
                    ) : (
                      <a
                        key={reference.id}
                        href={reference.file}
                        target="_blank"
                        rel="noreferrer"
                        className="col-span-3 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-primary hover:underline"
                      >
                        <FileText className="size-4" />
                        <span className="truncate">
                          {reference.label || reference.original_filename}
                        </span>
                      </a>
                    ),
                  )}
                </div>
              </ShellPanel>
            ) : undefined
          }
          recorder={<RecordRecorder record={row} />}
          actions={
            maySubmit || mayDecide ? (
              <>
                {maySubmit && (
                  <div className="space-y-2" data-task-submit>
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
                  <div className="space-y-2" data-task-decide>
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
              </>
            ) : undefined
          }
          aside={
            row.result_note || row.submitted_at || row.reviewed_at || sentOn ? (
              <>
                {(row.result_note || row.submitted_at || row.reviewed_at) && (
                  <ShellPanel data-task-result>
                    <dl className="grid gap-y-3 text-sm">
                      {(row.result_note || row.submitted_at) && (
                        <Fact label={t("result")}>
                          <span className="whitespace-pre-wrap">{row.result_note || "—"}</span>
                          {row.submitted_at && (
                            <span className="block text-xs text-muted-foreground">
                              {t("submittedAt", { at: df.dateTime(row.submitted_at) })}
                            </span>
                          )}
                        </Fact>
                      )}
                      {row.reviewed_at && (
                        <Fact label={row.status === "RETURNED" ? t("returnedBy") : t("confirmedBy")}>
                          {row.reviewed_by_name || "—"} · {df.dateTime(row.reviewed_at)}
                          {row.review_note && (
                            <span className="block whitespace-pre-wrap text-muted-foreground">{row.review_note}</span>
                          )}
                        </Fact>
                      )}
                    </dl>
                  </ShellPanel>
                )}
                {/* B15: a site request the manager sent on to the consultant. */}
                {sentOn && (
                  <ShellPanel className="text-sm">
                    <Link
                      href={`/consultant-applications/${sentOn.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {ops(sentOn.forwarded_at ? "tasks.forwardedAs" : "tasks.draftedAs", {
                        reference: sentOn.application_no,
                      })}
                    </Link>
                  </ShellPanel>
                )}
              </>
            ) : undefined
          }
          conversation={{ kind: "FIELD_TASK", recordId: row.id }}
        />
      </div>
    </RecordDetailDialog>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-1.5">{children}</dd>
    </div>
  );
}
