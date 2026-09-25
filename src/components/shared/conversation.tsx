"use client";

/**
 * The parts every conversation in this system is made of (T-340).
 *
 * There are two conversation endpoints — a hazard's, which predates this and
 * is the hazard itself rather than a panel beside it, and the generic record
 * chat that six other modules now hang off — and the customer's requirement
 * is that a person sees *one* chat, not two that drift apart. Rather than let
 * that be a matter of discipline, the pieces that decide what a chat looks and
 * behaves like live here and both panels import them: the voice recorder, one
 * message row, and one composer.
 *
 * What is deliberately *not* here is where the messages come from. The hazard
 * keeps its own store and its own participants/closed rules (D-094 and
 * 「记录全部都要留着」); the generic panel reads the record chat. Merging the
 * data layers as well would mean migrating live hazard conversations, which
 * risks a customer's evidence for no visible gain.
 */

import { Mic, Paperclip, Send, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDateFormat } from "@/lib/dates";

/** Matches the server's cap. Shown while recording, not discovered on send. */
export const FALLBACK_AUDIO_LIMIT = 60;

/** The shape both endpoints return for one message. */
export type ConversationMessage = {
  id: string;
  author_name: string;
  body: string;
  photo: string | null;
  watermarked_photo?: string | null;
  audio: string | null;
  audio_seconds?: number | null;
  attachment: string | null;
  attachment_name: string;
  sent_at: string;
};

export function canRecord(): boolean {
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
export function useRecorder(limitSeconds: number) {
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

export function ConversationMessageRow({
  message,
}: {
  message: ConversationMessage;
}) {
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

export type ComposerPayload = {
  body?: string;
  photo?: File;
  audio?: File;
  audio_seconds?: number;
  attachment?: File;
  attachment_name?: string;
};

/**
 * The box a person types, attaches or speaks into.
 *
 * Voice is offered first rather than last, and a browser that cannot record
 * says so instead of showing a button that does nothing: the customer
 * described part of their crew as 「不识字」, so for them the 「或」 in
 * 「文字或语音」 does not hold (D-094).
 */
export function ConversationComposer({
  body,
  setBody,
  file,
  setFile,
  limit,
  sending,
  onSend,
}: {
  body: string;
  setBody: (value: string) => void;
  file: File | null;
  setFile: (value: File | null) => void;
  limit: number;
  sending: boolean;
  onSend: (payload: ComposerPayload) => void;
}) {
  const t = useTranslations();
  const recorder = useRecorder(limit);
  const fileInput = useRef<HTMLInputElement>(null);

  const isPhoto = file?.type.startsWith("image/") ?? false;

  const submitText = () => {
    if (!body.trim() && !file) return;
    onSend({
      body: body.trim(),
      ...(file && isPhoto ? { photo: file } : {}),
      ...(file && !isPhoto ? { attachment: file, attachment_name: file.name } : {}),
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  const submitVoice = async () => {
    const { file: audio, seconds } = await recorder.stop();
    if (!audio) return;
    onSend({ audio, audio_seconds: seconds });
  };

  return (
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
          disabled={sending || (!body.trim() && !file)}
          disabledReason={sending ? t("common.saving") : t("hazard.nothingToSend")}
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
              {t("hazard.recordingFor", { seconds: recorder.seconds, limit })}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={sending}
              disabledReason={t("common.saving")}
              onClick={() => void recorder.start()}
            >
              <Mic className="h-4 w-4" />
              {t("hazard.recordStart")}
            </Button>
          )
        ) : (
          // Said out loud rather than hidden: a worker told to send a voice
          // note, on a browser that cannot, needs to know why the button is
          // not there.
          <span className="text-xs text-muted-foreground">
            {t("hazard.unsupported")}
          </span>
        )}
      </div>
    </div>
  );
}
