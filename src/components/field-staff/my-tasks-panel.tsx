"use client";

/**
 * 我的任务 / My Tasks on the phone (I1, ID13, ID14).
 *
 * The client's rule: 「统一接收普通现场任务及 EHS 指派事项。查看任务 → 拍照/
 * 备注/沟通 → 提交完成。My Tasks 不能建立、指派或转派任务」. So this is one
 * list - the field tasks assigned to me and the EHS items I am fixing that
 * are still 待处理 - read from the server (`my-tasks/get_tasks`), and each row
 * opens its own record and is handed in through that record's own flow:
 *
 * - a field task here: photos, a note, its conversation and 提交完成 - no
 *   开始 any more (ID13); the GPS is taken when it is handed in, and the
 *   note goes with it (IB6);
 * - an EHS item in its own hazard room (`FieldHazardsPanel`), where 提交整改
 *   is.
 *
 * There is no button here to set, assign or pass on work: the server refuses
 * those from a phone anyway.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  ClipboardList,
  Clock3,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { FieldTask, MyTaskRow } from "@/interfaces/contractor-ops";
import type { SafetyIncident } from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import { LocationRefused, requestLocation as locate } from "@/lib/field-location";
import { fieldTaskStageKey, STAGE_TONE } from "@/lib/task-stages";
import { getFieldTask, getMyTasks } from "@/services/contractor-ops.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import {
  submitFieldTaskPhotoOfflineAware,
  submitFieldTaskTransitionOfflineAware,
} from "@/services/offline-sync.service";

export type HazardHandleForTasks = Pick<SafetyIncident, "id" | "title" | "incident_no">;

/**
 * A task that hands its result in through another form (材料、设备、进度…):
 * `has` says whether it does, `open` goes there.
 */
export type TaskWorkflow = {
  has: (task: FieldTask) => boolean;
  open: (task: FieldTask) => void;
};

export function MyTasksPanel({
  requestedTaskId,
  onOpenHazard,
  workflow,
}: {
  requestedTaskId?: string;
  onOpenHazard: (hazard: HazardHandleForTasks) => void;
  workflow: TaskWorkflow;
}) {
  const t = useTranslations("taskFlow.myTasks");
  const [opened, setOpened] = useState(requestedTaskId ?? "");
  const [seenRequest, setSeenRequest] = useState(requestedTaskId ?? "");
  // A notice tapped while this screen is open names another task.
  if ((requestedTaskId ?? "") !== seenRequest) {
    setSeenRequest(requestedTaskId ?? "");
    setOpened(requestedTaskId ?? "");
  }
  const tasks = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => getMyTasks(),
    refetchInterval: 30_000,
  });

  if (opened) {
    return (
      <FieldTaskWork
        taskId={opened}
        onBack={() => setOpened("")}
        workflow={workflow}
      />
    );
  }

  const rows = tasks.data?.results ?? [];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {tasks.isSuccess ? t("count", { count: rows.length }) : t("loading")}
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          title={t("refresh")}
          disabled={tasks.isFetching}
          disabledReason={t("loading")}
          onClick={() => void tasks.refetch()}
        >
          <RefreshCw />
        </Button>
      </div>
      <FieldLoadNote query={tasks} what={t("title")} />
      {tasks.isLoading && (
        <div className="grid min-h-40 place-items-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      )}
      {tasks.isSuccess && rows.length === 0 && (
        <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-panel-border p-6 text-center">
          <div>
            <Check className="mx-auto size-10 text-success" />
            <p className="mt-3 font-medium">{t("empty")}</p>
          </div>
        </div>
      )}
      {rows.map((row) => (
        <MyTaskCard
          key={`${row.kind}:${row.id}`}
          row={row}
          onOpen={() =>
            row.kind === "HAZARD"
              ? onOpenHazard({ id: row.id, title: row.title, incident_no: row.no })
              : setOpened(row.id)
          }
        />
      ))}
    </section>
  );
}

function MyTaskCard({ row, onOpen }: { row: MyTaskRow; onOpen: () => void }) {
  const t = useTranslations("taskFlow.myTasks");
  const df = useDateFormat();
  const hazard = row.kind === "HAZARD";
  const Icon = hazard ? ShieldAlert : ClipboardList;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-start gap-3 rounded-xl surface-panel p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${row.needs_more_work ? "border-destructive/40" : ""}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge label={t(hazard ? "kind.HAZARD" : "kind.FIELD_TASK")} tone={hazard ? "warning" : "info"} />
          {row.needs_more_work && <StatusBadge label={t("moreWork")} tone="danger" />}
        </span>
        <span className="mt-2 block font-semibold leading-snug">{row.title}</span>
        <span className="block text-sm text-muted-foreground">
          {[row.no, row.project_name].filter(Boolean).join(" · ")}
        </span>
        {row.due_at && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("due", { value: df.dateTime(row.due_at) })}
          </span>
        )}
        {row.needs_more_work && row.note && (
          <span className="mt-2 block rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {row.note}
          </span>
        )}
        {row.last_message && (
          <span className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <MessageSquare className="size-3.5 shrink-0" />
            <span className="truncate">
              {row.last_message.author_name}:{" "}
              {row.last_message.body || t(`said.${row.last_message.kind}`)}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

/** One field task, opened: 查看 → 拍照 / 备注 / 沟通 → 提交完成. */
function FieldTaskWork({
  taskId,
  onBack,
  workflow,
}: {
  taskId: string;
  onBack: () => void;
  workflow: TaskWorkflow;
}) {
  const t = useTranslations("taskFlow.work");
  const df = useDateFormat();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const task = useQuery({
    queryKey: ["field-tasks", "detail", taskId],
    queryFn: () => getFieldTask(taskId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["field-tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
  };
  const failed = (reason: unknown) =>
    setError(
      reason instanceof ApiError
        ? reason.message
        : reason instanceof LocationRefused
          ? t("locationFailed")
          : t("failed"),
    );
  const photo = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("session");
      const fix = await locate();
      return submitFieldTaskPhotoOfflineAware(user.id, {
        taskId,
        file,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        deviceId: getOrCreateFieldDeviceId(),
      });
    },
    onSuccess: () => {
      setError("");
      refresh();
    },
    onError: failed,
  });
  const submit = useMutation({
    // 提交完成 with the GPS taken now (ID13) and the note with it (IB6).
    mutationFn: async () => {
      if (!user) throw new Error("session");
      const fix = await locate();
      return submitFieldTaskTransitionOfflineAware(
        user.id,
        taskId,
        "SUBMITTED",
        { latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracy },
        note.trim(),
      );
    },
    onSuccess: () => {
      setError("");
      setNote("");
      refresh();
      onBack();
    },
    onError: failed,
  });

  const row = task.data;
  const back = (
    <Button size="icon" variant="outline" className="shrink-0" title={t("back")} onClick={onBack}>
      <ArrowLeft />
    </Button>
  );
  if (!row) {
    return (
      <section className="space-y-3">
        {back}
        <FieldLoadNote query={task} what={t("what")} />
        {task.isLoading && (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        )}
      </section>
    );
  }

  const open = ["OPEN", "IN_PROGRESS", "RETURNED"].includes(row.status);
  const headOffice = row.origin === "HQ";
  const photos = row.photos.length;
  // At least one photo, or as many as the office asked for (I1); a
  // head-office task can be words alone.
  const needed = headOffice ? 0 : Math.max(row.evidence_required, 1);
  const busy = photo.isPending || submit.isPending;
  const stageKey = fieldTaskStageKey(row.status);
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        {back}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{row.title}</h2>
          <p className="truncate text-sm text-muted-foreground">{row.project_name}</p>
        </div>
      </div>

      <div className="surface-panel space-y-3 rounded-xl p-4">
        <StatusBadge
          label={t(`stage.${stageKey}`)}
          tone={stageKey === "CANCELLED" ? "neutral" : STAGE_TONE[stageKey]}
        />
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>{t("assignedBy", { name: row.created_by_name || "—" })}</p>
          {row.due_at && <p>{t("due", { value: df.dateTime(row.due_at) })}</p>}
          {row.work_location && <p>{t("where", { value: row.work_location })}</p>}
        </div>
        {row.instructions && (
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-6">
            {row.instructions}
          </p>
        )}
        {row.status === "RETURNED" && row.review_note && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-semibold">{t("moreWork")}</p>
            <p className="mt-1 whitespace-pre-wrap">{row.review_note}</p>
          </div>
        )}
        {row.references.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {row.references.map((reference) =>
              reference.kind === "PHOTO" ? (
                <a key={reference.id} href={reference.file} target="_blank" rel="noreferrer">
                  <Image
                    src={reference.file}
                    alt={reference.label || reference.original_filename}
                    width={320}
                    height={240}
                    unoptimized
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                </a>
              ) : (
                <a
                  key={reference.id}
                  href={reference.file}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 flex min-h-12 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-primary"
                >
                  <FileText className="size-5 shrink-0" />
                  <span className="truncate">{reference.label || reference.original_filename}</span>
                </a>
              ),
            )}
          </div>
        )}
      </div>

      {open && !workflow.has(row) ? (
        <div className="surface-panel space-y-3 rounded-xl p-4">
          <FieldWrapper
            label={t("photos")}
            required={needed > 0 ? "quiet" : undefined}
            hint={needed > 0 ? t("photosHint", { count: needed }) : undefined}
          >
            {photos > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {row.photos.map((item) => (
                  <a
                    key={item.id}
                    href={item.watermarked || item.image}
                    target="_blank"
                    rel="noreferrer"
                    className="w-20 shrink-0"
                  >
                    <Image
                      src={item.watermarked || item.image}
                      alt=""
                      width={160}
                      height={160}
                      unoptimized
                      className="aspect-square w-full rounded-lg border object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            <FieldCamera
              label={t("takePhoto")}
              fileCount={photos}
              disabled={busy}
              onCapture={(file) => photo.mutate(file)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("note")}
            required={headOffice && photos === 0 ? "quiet" : undefined}
            hint={headOffice && photos === 0 ? t("noteHint") : undefined}
            optional={headOffice && photos === 0 ? undefined : t("optional")}
          >
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
            />
          </FieldWrapper>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            className="h-12 w-full text-sm"
            requires={[
              [photos >= needed, t("photos")],
              ...(headOffice && photos === 0 ? ([[note.trim(), t("note")]] as Array<[unknown, string]>) : []),
            ]}
            disabled={busy}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("submit")}
          </Button>
        </div>
      ) : open ? (
        <div className="surface-panel space-y-2 rounded-xl p-4">
          <p className="text-sm text-muted-foreground">{t("workflowHint")}</p>
          <Button className="h-12 w-full text-sm" onClick={() => workflow.open(row)}>
            <Camera />
            {t("openWorkflow")}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-panel-border p-4 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          {row.status === "SUBMITTED" ? t("waiting") : t("finished")}
        </p>
      )}

      <div className="surface-panel rounded-xl p-4">
        <RecordConversationPanel kind="FIELD_TASK" recordId={row.id} />
      </div>
    </section>
  );
}
