"use client";

/**
 * The parts every conversation in this system is made of (T-340).
 *
 * There are two conversation endpoints — a hazard's, which predates this and
 * is the hazard itself rather than a panel beside it, and the generic record
 * chat that six other modules now hang off — and the customer's requirement
 * is that a person sees *one* chat, not two that drift apart. Rather than let
 * that be a matter of discipline, the pieces that decide what a chat looks and
 * behaves like live here and both panels import them: the voice recorder, the
 * message list (its rows, photo thumbnails and viewer), and one composer.
 *
 * Photographs are thumbnails (F2, 7/10: 「隐患整改沟通里的照片太大了」): the
 * longest edge is 128px on a phone and 160px from `sm` up, rounded, several in
 * a row, and a tap opens the shared `PhotoViewer` (zoom, previous / next,
 * download). On a phone that keeps three photo messages on one screen.
 *
 * What is deliberately *not* here is where the messages come from. The hazard
 * keeps its own store and its own participants/closed rules (D-094 and
 * 「记录全部都要留着」); the generic panel reads the record chat. Merging the
 * data layers as well would mean migrating live hazard conversations, which
 * risks a customer's evidence for no visible gain.
 */

import { Mic, Paperclip, Send, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The viewer every record detail already opens its photographs in, so a chat
// photo zooms and downloads the same way. (record-detail-shell reaches this
// file through record-conversation; each side only uses the other at render
// time, so the import cycle is harmless.)
import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ConversationPhoto,
  groupConversationMessages,
} from "@/lib/conversation-groups";
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

/**
 * The size of a photo in a chat: longest edge 128px on a phone, 160px from
 * `sm` up, aspect kept. Exported for the guard test.
 */
export const CHAT_THUMBNAIL_IMG_CLASS =
  "block h-auto w-auto max-h-32 max-w-32 sm:max-h-40 sm:max-w-40";

/** One photo in a chat, small; a tap opens it full size. */
export function ChatPhotoThumbnail({
  url,
  alt,
  onOpen,
}: {
  url: string;
  alt: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      title={alt}
      onClick={onOpen}
      className="block shrink-0 overflow-hidden rounded-md border bg-muted/40 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Deliberately a plain <img>: these are user photographs served
          from the API host, not build-time assets Next can optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" className={CHAT_THUMBNAIL_IMG_CLASS} />
    </button>
  );
}

/**
 * The full-size viewer for a chat's photos: returns the opener and the dialog
 * to render. Previous / next walk every photo of the conversation, in order.
 */
export function useChatPhotoViewer(photos: ConversationPhoto[], reference: string) {
  const [open, setOpen] = useState<number | null>(null);
  const shellPhotos = useMemo<ShellPhoto[]>(
    () =>
      photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        label: photo.author,
        takenAt: photo.sentAt,
      })),
    [photos],
  );
  const openPhoto = useCallback(
    (id: string) => {
      const index = photos.findIndex((photo) => photo.id === id);
      if (index >= 0) setOpen(index);
    },
    [photos],
  );
  const viewer =
    open !== null && shellPhotos[open] ? (
      <PhotoViewer
        photos={shellPhotos}
        index={open}
        reference={reference}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    ) : null;
  return { openPhoto, viewer };
}

/**
 * Every message of one conversation, oldest first. A run of photo-only
 * messages from one person sits in one row (`groupConversationMessages`).
 */
export function ConversationMessageList({
  messages,
  emptyLabel,
  reference,
}: {
  messages: ConversationMessage[];
  emptyLabel: string;
  /** The record's number, used to name a downloaded photo. */
  reference: string;
}) {
  const rows = useMemo(() => groupConversationMessages(messages), [messages]);
  const photos = useMemo(() => rows.flatMap((row) => row.photos), [rows]);
  const { openPhoto, viewer } = useChatPhotoViewer(photos, reference);

  return (
    <>
      <ul className="space-y-2">
        {messages.length === 0 && (
          <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {emptyLabel}
          </li>
        )}
        {rows.map((row) => (
          <ConversationMessageRow
            key={row.lead.id}
            message={row.lead}
            photos={row.photos}
            onOpenPhoto={openPhoto}
          />
        ))}
      </ul>
      {viewer}
    </>
  );
}

export function ConversationMessageRow({
  message,
  photos,
  onOpenPhoto,
}: {
  message: ConversationMessage;
  /** The row's photographs: the message's own, plus any grouped after it. */
  photos: ConversationPhoto[];
  onOpenPhoto: (id: string) => void;
}) {
  const t = useTranslations();
  const formatter = useDateFormat();

  return (
    <li className="rounded-md border p-2.5 text-sm sm:p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{message.author_name}</span>
        <span className="text-xs text-muted-foreground">
          {formatter.dateTime(message.sent_at)}
        </span>
      </div>
      {message.body && <p className="mt-1 whitespace-pre-wrap">{message.body}</p>}
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          {photos.map((photo) => (
            <ChatPhotoThumbnail
              key={photo.id}
              url={photo.url}
              alt={t("hazard.photo")}
              onOpen={() => onOpenPhoto(photo.id)}
            />
          ))}
        </div>
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
