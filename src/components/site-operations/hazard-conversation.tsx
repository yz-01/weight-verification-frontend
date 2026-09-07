"use client";

/**
 * A hazard's conversation - which is the hazard, not a panel beside it.
 *
 * The customer was explicit that these are one thing, twice: 「上报了之后就会去
 * 到聊天室进行聊天，只是指定的人员而已」 and 「截图2的聊天室其实就是隐患上报结合
 * 一起而已，拍的照片也会发去聊天室，不是分开的」. So the photograph that raised
 * the hazard arrives here as the first message, and this component renders one
 * unbroken history rather than a report with comments underneath it.
 *
 * Four ways to say something, and the fourth is the one that matters most.
 * The customer described their crew as 「不识字」, which means that for some of
 * them the 「或」 in 「文字或语音」 does not hold: without a voice note the
 * rectification conversation is unusable by exactly the people the loop needs
 * in it. Recording is offered first, not last, and the browsers that cannot do
 * it say so rather than showing a button that does nothing (D-094).
 *
 * Used unchanged by the contractor console and the field app. The customer
 * warned that 「这个系统有很多后台所以不代表改一个后台就可以完成闭环」, and one
 * component in two places is the cheapest way to make that warning moot here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Paperclip, Send, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HazardMessage } from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import {
  getHazardConversation,
  postHazardMessage,
} from "@/services/site-operations.service";

/** Matches the server's cap. Shown while recording, not discovered on send. */
const FALLBACK_AUDIO_LIMIT = 60;

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Record a voice note, stopping itself at the limit.
 *
 * Stopping on its own matters more than it looks: a worker who holds the
 * button too long would otherwise finish a recording, upload it over a poor
 * site connection, and only then be told it was too long - having lost both
 * the recording and the time.
 */
function useRecorder(limitSeconds: number) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const resolver = useRef<((file: File | null) => void) | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const finish = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    setRecording(false);
  }, []);

  useEffect(() => finish, [finish]);

  const start = useCallback(async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunks.current = [];
    media.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    media.onstop = () => {
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      resolver.current?.(
        blob.size
          ? new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" })
          : null,
      );
      resolver.current = null;
    };
    recorder.current = media;
    setSeconds(0);
    setRecording(true);
    media.start();
    ticker.current = setInterval(() => {
      setSeconds((current) => {
        // Stop at the cap rather than let it run past and be refused.
        if (current + 1 >= limitSeconds) media.stop();
        return current + 1;
      });
    }, 1000);
  }, [limitSeconds]);

  const stop = useCallback((): Promise<{ file: File | null; seconds: number }> => {
    const taken = seconds;
    return new Promise((resolve) => {
      if (!recorder.current) return resolve({ file: null, seconds: 0 });
      resolver.current = (file) => resolve({ file, seconds: taken });
      recorder.current.stop();
      finish();
    });
  }, [finish, seconds]);

  return { recording, seconds, start, stop, supported: canRecord() };
}

function MessageRow({ message }: { message: HazardMessage }) {
  const t = useTranslations();
  const formatter = useDateFormat();

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{message.author_name}</span>
        <span className="text-xs text-muted-foreground">
          {formatter.dateTime(message.sent_at)}
        </span>
      </div>
      {message.body && <p className="mt-1 whitespace-pre-wrap">{message.body}</p>}
      {message.photo && (
        <a
          href={message.watermarked_photo ?? message.photo}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block"
        >
          {/* Deliberately a plain <img>: these are user photographs served
              from the API host, not build-time assets Next can optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.watermarked_photo ?? message.photo}
            alt={t("hazard.photo")}
            className="max-h-64 rounded-md border"
          />
        </a>
      )}
      {message.audio && (
        <div className="mt-2">
          <audio controls src={message.audio} className="w-full max-w-sm">
            {t("hazard.voiceNote")}
          </audio>
        </div>
      )}
      {message.attachment && (
        <a
          href={message.attachment}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs underline"
        >
          <Paperclip className="h-3 w-3" />
          {message.attachment_name || t("hazard.attach")}
        </a>
      )}
    </li>
  );
}

export function HazardConversationPanel({ incidentId }: { incidentId: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["hazard-conversation", incidentId],
    queryFn: () => getHazardConversation(incidentId),
  });

  const limit = data?.audio_seconds_limit ?? FALLBACK_AUDIO_LIMIT;
  const recorder = useRecorder(limit);

  const send = useMutation({
    mutationFn: (payload: Parameters<typeof postHazardMessage>[1]) =>
      postHazardMessage(incidentId, payload),
    onSuccess: () => {
      setBody("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({
        queryKey: ["hazard-conversation", incidentId],
      });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const isPhoto = file?.type.startsWith("image/") ?? false;

  const submitText = () => {
    if (!body.trim() && !file) return;
    send.mutate({
      body: body.trim(),
      ...(file && isPhoto ? { photo: file } : {}),
      ...(file && !isPhoto ? { attachment: file, attachment_name: file.name } : {}),
    });
  };

  const submitVoice = async () => {
    const { file: audio, seconds } = await recorder.stop();
    if (!audio) return;
    send.mutate({ audio, audio_seconds: seconds });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("hazard.conversationTitle")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("hazard.participants")}:{" "}
          {data.participants
            .map((person) =>
              person.is_responsible
                ? `${person.full_name} (${t("hazard.responsible")})`
                : person.is_reporter
                  ? `${person.full_name} (${t("hazard.reporter")})`
                  : person.full_name,
            )
            .join(" · ")}
        </p>
      </div>

      {/* Both halves of 「什么时候改，需要多少时间」, when they are known. */}
      {data.incident.rectification_duration_hours && (
        <p className="text-xs text-muted-foreground">
          {t("hazard.duration")}:{" "}
          {t("hazard.durationHours", {
            hours: data.incident.rectification_duration_hours,
          })}
        </p>
      )}

      <ul className="space-y-2">
        {data.messages.length === 0 && (
          <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {t("hazard.empty")}
          </li>
        )}
        {data.messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </ul>

      {/* Archived is readable, not hidden: 「记录全部都要留着」. What closes is
          the ability to add to it, and the reason is said rather than shown as
          a disabled box with no explanation. */}
      {data.is_closed ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {t("hazard.closed")}
        </p>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("hazard.placeholder")}
              aria-label={t("hazard.placeholder")}
              className="min-w-[12rem] flex-1"
            />
            <Button
              size="sm"
              disabled={send.isPending || (!body.trim() && !file)}
              disabledReason={
                send.isPending ? t("common.saving") : t("hazard.nothingToSend")
              }
              onClick={submitText}
            >
              <Send className="h-4 w-4" />
              {t("hazard.send")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              className="h-8 max-w-xs text-xs"
              aria-label={t("hazard.attach")}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />

            {recorder.supported ? (
              recorder.recording ? (
                <Button size="sm" variant="destructive" onClick={submitVoice}>
                  <Square className="h-4 w-4" />
                  {t("hazard.recordStop")} ·{" "}
                  {t("hazard.recordingFor", {
                    seconds: recorder.seconds,
                    limit,
                  })}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={send.isPending}
                  disabledReason={t("common.saving")}
                  onClick={() => void recorder.start()}
                >
                  <Mic className="h-4 w-4" />
                  {t("hazard.recordStart")}
                </Button>
              )
            ) : (
              // Said out loud rather than hidden: a worker told to send a
              // voice note, on a browser that cannot, needs to know why the
              // button is not there.
              <span className="text-xs text-muted-foreground">
                {t("hazard.unsupported")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
