"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { FieldCamera } from "@/components/shared/field-camera";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  IncidentReportMessage,
  IncidentReportThread,
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

  const handlePhotoCapture = (dataUrl: string) => {
    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `incident-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        setPhoto(file);
        setPhotoPreview(dataUrl);
        setShowCamera(false);
      });
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
        onCapture={handlePhotoCapture}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card p-4">
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("action.cancel")}
        </button>

        {thread.data && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={t(`severity.${thread.data.thread.severity}`)}
                tone={severityTone}
              />
              {thread.data.thread.is_resolved && (
                <StatusBadge label={t("status.resolved")} tone="positive" />
              )}
            </div>
            <h2 className="text-lg font-semibold">{thread.data.thread.title}</h2>
            <p className="text-sm text-muted-foreground">
              {thread.data.thread.project_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("field.project")}: {thread.data.thread.reported_by_name} •{" "}
              {new Date(thread.data.thread.created_at).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {thread.isLoading && (
          <div className="grid min-h-32 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {messages.map((message) => (
          <MessageCard key={message.id} message={message} />
        ))}
      </div>

      {!thread.data?.thread.is_resolved && (
        <div className="border-t bg-card p-4">
          {photoPreview && (
            <div className="mb-3 relative w-24 h-24">
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
                ×
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted"
            >
              <Camera className="size-5 text-muted-foreground" />
            </button>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("field.messagePlaceholder")}
              rows={2}
              className="flex-1"
            />
            <Button
              size="icon"
              className="size-11 shrink-0"
              disabled={(!body.trim() && !photo) || sendMessage.isPending}
              onClick={handleSend}
            >
              {sendMessage.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Send className="size-5" />
              )}
            </Button>
          </div>

          {thread.data && !thread.data.thread.is_resolved && (
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

function MessageCard({ message }: { message: IncidentReportMessage }) {
  return (
    <article className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{message.author_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(message.sent_at).toLocaleString()}
          </p>
          {message.body && (
            <p className="mt-2 text-sm leading-relaxed">{message.body}</p>
          )}
          {message.watermarked_photo && (
            <div className="mt-3 relative aspect-video w-full max-w-sm">
              <Image
                src={message.watermarked_photo}
                alt=""
                fill
                className="rounded-lg object-cover"
                unoptimized
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
