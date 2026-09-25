"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { FieldCamera } from "@/components/shared/field-camera";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
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

export function IncidentThreadDetail({
  threadId,
  onBack,
}: {
  threadId: string;
  onBack: () => void;
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

  const messages = thread.data?.messages ?? [];

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

  if (showCamera) {
    return (
      <FieldCamera
        label={t("photoLabel")}
        onCapture={handlePhotoCapture}
      />
    );
  }

  return (
    <div
      className={
        fieldMode
          ? "flex min-w-0 flex-col rounded-xl border bg-card shadow-sm"
          : "flex min-h-[70dvh] flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
      }
    >
      <header className="border-b bg-card px-4 py-4">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            title={t("action.back")}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          {thread.data ? (
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={t(`severity.${thread.data.thread.severity}`)}
                  tone={severityTone}
                />
                {thread.data.thread.is_resolved && (
                  <StatusBadge label={t("status.resolved")} tone="positive" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {thread.data.thread.thread_no}
                </span>
              </div>
              <h2 className="mt-2 break-words text-lg font-semibold leading-6">
                {thread.data.thread.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{thread.data.thread.project_name}</span>
                <span>
                  {t("field.reportedBy")}: {thread.data.thread.reported_by_name}
                </span>
                <span>{new Date(thread.data.thread.created_at).toLocaleString()}</span>
              </div>
            </div>
          ) : null}
        </div>

        {thread.data?.participants.length ? (
          <div className="mt-4 border-t pt-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Users className="size-4" />
              <span>{t("field.participants")}</span>
              <span className="tabular-nums">{thread.data.participants.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {thread.data.participants.map((participant) => (
                <ParticipantChip key={participant.id} participant={participant} />
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <div
        className={
          fieldMode
            ? "min-w-0 space-y-4 bg-muted/25 p-3 sm:p-4"
            : "flex-1 space-y-4 overflow-y-auto bg-muted/25 p-4"
        }
      >
        {thread.isLoading && (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

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
          />
        ))}
      </div>

      {!thread.isError && !thread.data?.thread.is_resolved && (
        <div className="border-t bg-card p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:p-4">
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
              className="min-h-11 flex-1 resize-none py-3"
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

          {thread.data &&
            !thread.data.thread.is_resolved &&
            can("safety.verify") && (
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => resolve.mutate()}
              disabled={resolve.isPending}
            >
              {resolve.isPending && <Loader2 className="animate-spin" />}
              {t("action.resolve")}
            </Button>
          )}
        </div>
      )}
    </div>
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
}: {
  message: IncidentReportMessage;
  participant?: IncidentReportRecipient;
  own: boolean;
}) {
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
            <a
              href={message.watermarked_photo}
              target="_blank"
              rel="noreferrer"
              className="relative block aspect-[4/3] w-64 max-w-full overflow-hidden bg-black/5"
            >
              <Image src={message.watermarked_photo} alt="" fill className="object-cover" unoptimized />
            </a>
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
