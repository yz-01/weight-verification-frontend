"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { ChatPhotoThumbnail, useChatPhotoViewer } from "@/components/shared/conversation";
import { FieldCamera } from "@/components/shared/field-camera";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  IncidentReportMessage,
  IncidentReportRecipient,
} from "@/interfaces/incident-report";
import {
  getIncidentThread,
  resolveIncidentThread,
  sendIncidentMessage,
} from "@/services/site-operations.service";
import { toast } from "sonner";

/**
 * One incident report in the record-detail popup (E8, Q31), over the list in
 * the office (`/incident-reports`) and on the phone (`/field-staff/incidents`).
 *
 * The report's own message thread is its 事项沟通: it sits in the shell's
 * conversation place, with the composer under it. Who is in the group is the
 * left column's panel; 标记为已解决 is the decision button.
 */
export function IncidentThreadDetail({
  threadId,
  onClose,
}: {
  threadId: string;
  onClose: () => void;
}) {
  const t = useTranslations("incidentReporting");
  const pathname = usePathname();
  const fieldMode = pathname.startsWith("/field-staff");
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const thread = useQuery({
    queryKey: ["incident-thread", threadId],
    queryFn: () => getIncidentThread(threadId),
  });

  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data]);
  // F2: photos are small in the thread and open full size in the shared
  // viewer, the same as every other chat.
  const chatPhotos = useMemo(
    () =>
      messages.flatMap((message) =>
        message.watermarked_photo
          ? [{ id: message.id, url: message.watermarked_photo, author: message.author_name, sentAt: message.sent_at }]
          : [],
      ),
    [messages],
  );
  const photoViewer = useChatPhotoViewer(chatPhotos, thread.data?.thread.thread_no ?? "");

  const sendMessage = useMutation({
    mutationFn: (payload: {
      body: string;
      photo?: File;
      latitude?: string;
      longitude?: string;
      accuracy_m?: string;
      client_event_id?: string;
    }) => sendIncidentMessage(threadId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["incident-thread", threadId] });
      void qc.invalidateQueries({ queryKey: ["incident-threads"] });
      setBody("");
      setPhoto(null);
      setPhotoPreview(null);
    },
    onError: (error: ApiError) => {
      toast.error(error.message || t("submitError"));
    },
  });

  const resolve = useMutation({
    mutationFn: () => resolveIncidentThread(threadId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["incident-thread", threadId] });
      void qc.invalidateQueries({ queryKey: ["incident-threads"] });
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    },
  });

  const handleSend = () => {
    if (!body.trim() && !photo) {
      toast.error(t("fillRequired"));
      return;
    }

    const clientEventId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    sendMessage.mutate({
      body: body.trim(),
      photo: photo ?? undefined,
      client_event_id: clientEventId,
    });
  };

  const handlePhotoCapture = (file: File) => {
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setShowCamera(false);
  };

  const severityTone =
    thread.data?.thread.severity === "CRITICAL"
      ? "danger"
      : thread.data?.thread.severity === "HIGH"
        ? "warning"
        : thread.data?.thread.severity === "MEDIUM"
          ? "info"
          : "neutral";

  const record = thread.data?.thread;
  // The popup's header: the report's number with its severity and, once
  // solved, 已解决; its title under it; when it was filed.
  const header = {
    title: record?.thread_no ?? t("title"),
    description: record?.title,
    status: record ? (
      <>
        <StatusBadge label={t(`severity.${record.severity}`)} tone={severityTone} />
        {record.is_resolved && (
          <StatusBadge label={t("status.resolved")} tone="positive" />
        )}
      </>
    ) : undefined,
    caption: record ? new Date(record.created_at).toLocaleString() : undefined,
  };

  if (showCamera) {
    return (
      <RecordDetailDialog {...header} onClose={onClose}>
        <FieldCamera
          label={t("photoLabel")}
          onCapture={handlePhotoCapture}
        />
      </RecordDetailDialog>
    );
  }

  // Loading, or failed before anything arrived: the same popup, saying so.
  if (!record) {
    return (
      <RecordDetailDialog {...header} onClose={onClose}>
        {thread.isError ? (
          <LoadFailed what={t("what.thread")} onRetry={() => thread.refetch()} />
        ) : (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}
      </RecordDetailDialog>
    );
  }

  const participants = thread.data?.participants ?? [];
  const canResolve = !thread.isError && !record.is_resolved && can("safety.verify");

  return (
    <RecordDetailDialog {...header} onClose={onClose}>
      <RecordDetailShell
        reference={record.thread_no}
        facts={[
          { label: t("field.project"), value: record.project_name },
          { label: t("field.reportedBy"), value: record.reported_by_name },
        ]}
        recorder={<RecordRecorder record={record} />}
        panel={
          participants.length ? (
            <ShellPanel
              title={t("field.participants")}
              aside={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {participants.length}
                </span>
              }
            >
              <div className="flex flex-wrap gap-2">
                {participants.map((participant) => (
                  <ParticipantChip key={participant.id} participant={participant} />
                ))}
              </div>
            </ShellPanel>
          ) : undefined
        }
        actions={
          canResolve ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => resolve.mutate()}
              disabled={resolve.isPending}
            >
              {resolve.isPending && <Loader2 className="animate-spin" />}
              {t("action.resolve")}
            </Button>
          ) : undefined
        }
        chat={
          <div className="flex min-w-0 flex-col gap-3" data-incident-thread>
            <div
              className={
                fieldMode
                  ? "min-w-0 space-y-4 rounded-lg bg-muted/25 p-3"
                  : "max-h-[60dvh] min-w-0 space-y-4 overflow-y-auto rounded-lg bg-muted/25 p-3"
              }
            >
              {/* A refresh that failed after the report had loaded. */}
              {thread.isError && (
                <LoadFailed what={t("what.thread")} onRetry={() => thread.refetch()} />
              )}

              {messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  participant={thread.data?.participants.find(
                    (participant) => participant.id === message.author,
                  )}
                  own={message.author === user?.id}
                  onOpenPhoto={photoViewer.openPhoto}
                />
              ))}
            </div>

            {!thread.isError && !record.is_resolved && (
              <div className="border-t border-panel-border pt-3">
                {photoPreview && (
                  <div className="relative mb-3 size-24">
                    <Image
                      src={photoPreview}
                      alt=""
                      fill
                      className="rounded-lg object-cover"
                      unoptimized
                    />
                    <button
                      onClick={() => {
                        setPhoto(null);
                        setPhotoPreview(null);
                      }}
                      className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}

                <FieldWrapper label={t("field.messagePlaceholder")} required>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-11 shrink-0"
                    title={t("photoLabel")}
                    onClick={() => setShowCamera(true)}
                  >
                    <Camera className="size-5" />
                  </Button>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    aria-label={t("field.messagePlaceholder")}
                    rows={1}
                    className="min-h-11 min-w-0 flex-1 resize-none py-3"
                  />
                  <Button
                    size="icon"
                    className="size-11 shrink-0"
                    title={t("action.create")}
                    requires={[[body || photo, t("field.messagePlaceholder")]]}
                    disabled={sendMessage.isPending}
                    onClick={handleSend}
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Send className="size-5" />
                    )}
                  </Button>
                </div>
                </FieldWrapper>
              </div>
            )}
            {photoViewer.viewer}
          </div>
        }
      />
    </RecordDetailDialog>
  );
}

function ParticipantChip({
  participant,
}: {
  participant: IncidentReportRecipient;
}) {
  const t = useTranslations("incidentReporting");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-2.5 py-1.5">
      <Avatar name={participant.full_name} />
      <span className="max-w-40 min-w-0">
        <span className="block truncate text-xs font-semibold">
          {participant.full_name}
        </span>
        <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          {participant.is_supervisor ? <ShieldCheck className="size-3 shrink-0" /> : null}
          <span className="truncate">
            {[participant.role_name, participant.is_reporter
              ? t("reporter")
              : participant.is_supervisor
                ? t("supervisor")
                : ""].filter(Boolean).join(" / ")}
          </span>
        </span>
      </span>
    </div>
  );
}

function MessageCard({
  message,
  participant,
  own,
  onOpenPhoto,
}: {
  message: IncidentReportMessage;
  participant?: IncidentReportRecipient;
  own: boolean;
  onOpenPhoto: (id: string) => void;
}) {
  const tPhoto = useTranslations("hazard");
  return (
    <article className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}>
      {!own ? <Avatar name={message.author_name} /> : null}
      <div className={`flex min-w-0 max-w-[82%] flex-col ${own ? "items-end" : "items-start"}`}>
        <div className={`mb-1 flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-muted-foreground ${own ? "justify-end" : "justify-start"}`}>
          <span className="font-semibold text-foreground">{message.author_name}</span>
          {participant?.role_name ? <span>{participant.role_name}</span> : null}
          <span>{new Date(message.sent_at).toLocaleString()}</span>
        </div>
        <div
          className={`overflow-hidden rounded-2xl border shadow-sm ${
            own
              ? "rounded-br-md border-primary bg-primary text-primary-foreground"
              : "rounded-bl-md bg-card"
          }`}
        >
          {message.body && (
            <p className="whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-6">
              {message.body}
            </p>
          )}
          {message.watermarked_photo && (
            <div className="p-1.5">
              <ChatPhotoThumbnail
                url={message.watermarked_photo}
                alt={tPhoto("photo")}
                onOpen={() => onOpenPhoto(message.id)}
              />
            </div>
          )}
          {message.latitude && message.longitude ? (
            <a
              href={`https://www.google.com/maps?q=${message.latitude},${message.longitude}`}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-1.5 border-t px-3 py-2 text-xs font-medium ${
                own ? "border-primary-foreground/20" : "text-primary"
              }`}
            >
              <MapPin className="size-3.5" />
              {message.latitude}, {message.longitude}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
      {initials || "?"}
    </span>
  );
}
