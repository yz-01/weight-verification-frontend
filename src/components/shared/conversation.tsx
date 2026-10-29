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
 * longest edge is 128px on a phone; from `sm` up a fixed 56px 4:3 tile, four
 * to a row (JB43, 客户 10-27: 「照片尺寸要比…两张小照片还要小」「一次显示四张」).
 * A tap opens the shared `PhotoViewer` (zoom, previous / next, download).
 *
 * What is deliberately *not* here is where the messages come from. The hazard
 * keeps its own store and its own participants/closed rules (D-094 and
 * 「记录全部都要留着」); the generic panel reads the record chat. Merging the
 * data layers as well would mean migrating live hazard conversations, which
 * risks a customer's evidence for no visible gain.
 */

import { Mic, Paperclip, Send, Square, X } from "lucide-react";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { downloadEvidence } from "@/components/shared/evidence-file-actions";
import { FieldCamera } from "@/components/shared/field-camera";
import { isPhotoFile, phoneFileAccept } from "@/lib/attachment-picker";
import { FilePreviewDialog } from "@/components/shared/file-preview";
// The viewer every record detail already opens its photographs in, so a chat
// photo zooms and downloads the same way. (record-detail-shell reaches this
// file through record-conversation; each side only uses the other at render
// time, so the import cycle is harmless.)
import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type ConversationPhoto,
  groupConversationMessages,
} from "@/lib/conversation-groups";
import { useDateFormat } from "@/lib/dates";
import { type LocationFix, requestLocation } from "@/lib/field-location";
import { compressPhoto } from "@/lib/photo-compression";
import { photoMeta } from "@/lib/photo-meta";

/** Matches the server's cap. Shown while recording, not discovered on send. */
export const FALLBACK_AUDIO_LIMIT = 60;

/** The shape both endpoints return for one message. */
export type ConversationMessage = {
  id: string;
  /** Who said it (the user id): the open chat rings for others' words (JB36). */
  author?: string | null;
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

export type VoiceResult = { file: File | null; seconds: number };

/**
 * The recording format this browser can make, best first, or `undefined` to
 * let it choose.
 *
 * JB36 (客户 10-26 事项 11: 「iPhone/Android无法发送沟通」): the recorder
 * asked for WebM outright. An iPhone before iOS 18.4 records only MP4, so
 * `new MediaRecorder(..., { mimeType: "audio/webm" })` threw after the
 * microphone had opened: the button did nothing, nothing was sent, and the
 * microphone stayed on (the orange dot in the client's screenshot).
 */
export const VOICE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"] as const;

export function voiceMimeType(
  isTypeSupported: ((type: string) => boolean) | undefined = typeof MediaRecorder !== "undefined"
    ? (type) => MediaRecorder.isTypeSupported(type)
    : undefined,
): string | undefined {
  if (!isTypeSupported) return undefined;
  return VOICE_TYPES.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** A voice file's name ending, from what was recorded: `.m4a` for an iPhone's MP4. */
export function voiceExtension(type: string): string {
  const base = type.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a") return "m4a";
  if (base === "audio/aac") return "aac";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

/** The part of a `MediaRecorder` a voice note uses (a fake one in tests). */
export type VoiceMedia = {
  /** What the recorder is making; empty or missing reads as WebM. */
  mimeType?: string;
  state: string;
  stream: { getTracks(): { stop(): void }[] };
  start(): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

/**
 * One recording, from the microphone opening to the file - or to nothing.
 *
 * Kept out of the hook so it can be driven without a browser. Three ways it
 * ends: 「停止并发送」 (`stop`, the file), 「取消」 (`cancel`, nothing - J3,
 * Q3-1), and the limit, which hands the file to `onLimit` as a stop would
 * (JB3: the cap used to stop the recorder with nobody waiting for the file,
 * and the stop button never finished after that - the note was lost).
 */
export function startVoiceSession(
  media: VoiceMedia,
  limitSeconds: number,
  events: { tick: (seconds: number) => void; limit: (result: VoiceResult) => void; ended: () => void },
  timers: { every: (run: () => void) => unknown; clear: (handle: unknown) => void } = {
    every: (run) => setInterval(run, 1000),
    clear: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  },
) {
  let chunks: Blob[] = [];
  let take: ((file: File | null) => void) | null = null;
  let elapsed = 0;
  let open = true;
  media.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  media.onstop = () => {
    const type = media.mimeType || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type });
    take?.(
      blob.size
        ? new File([blob], `voice-${Date.now()}.${voiceExtension(type)}`, { type: type.split(";")[0] })
        : null,
    );
    take = null;
  };
  media.start();
  const ticker = timers.every(() => {
    elapsed += 1;
    events.tick(elapsed);
    // Stop at the cap rather than let it run past and be refused - and send
    // what was said, as 「停止并发送」 would.
    if (elapsed >= limitSeconds) {
      const taken = elapsed;
      end((file) => events.limit({ file, seconds: taken }));
    }
  });

  function end(next: ((file: File | null) => void) | null) {
    if (!open) return false;
    open = false;
    timers.clear(ticker);
    take = next;
    if (!next) chunks = [];
    if (media.state !== "inactive") media.stop();
    media.stream.getTracks().forEach((track) => track.stop());
    events.ended();
    return true;
  }

  return {
    stop(): Promise<VoiceResult> {
      const taken = elapsed;
      return new Promise((resolve) => {
        if (!end((file) => resolve({ file, seconds: taken }))) resolve({ file: null, seconds: 0 });
      });
    },
    /** The microphone off, the recording dropped, nothing sent. */
    cancel() {
      end(null);
    },
  };
}

/**
 * Record a voice note, stopping itself at the limit.
 *
 * Stopping on its own matters more than it looks: a worker who holds the
 * button too long would otherwise finish a recording, upload it over a poor
 * site connection, and only then be told it was too long - having lost both
 * the recording and the time. What was said is sent (`onLimit`).
 */
export function useRecorder(limitSeconds: number, onLimit?: (result: VoiceResult) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<ReturnType<typeof startVoiceSession> | null>(null);
  const limitHandler = useRef(onLimit);
  useEffect(() => {
    limitHandler.current = onLimit;
  }, [onLimit]);

  // Leaving the page drops a recording in progress.
  useEffect(() => () => session.current?.cancel(), []);

  const start = useCallback(async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    let media: MediaRecorder;
    try {
      const mimeType = voiceMimeType();
      media = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (error) {
      // Never leave the microphone on for a recording that did not start.
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    setSeconds(0);
    setRecording(true);
    session.current = startVoiceSession(media as unknown as VoiceMedia, limitSeconds, {
      tick: setSeconds,
      limit: (result) => limitHandler.current?.(result),
      ended: () => {
        session.current = null;
        setRecording(false);
      },
    });
  }, [limitSeconds]);

  const stop = useCallback(
    (): Promise<VoiceResult> => session.current?.stop() ?? Promise.resolve({ file: null, seconds: 0 }),
    [],
  );

  /** 「取消」 (J3, Q3-1): the microphone off, the recording dropped, nothing sent. */
  const cancel = useCallback(() => session.current?.cancel(), []);

  return { recording, seconds, start, stop, cancel, supported: canRecord() };
}

/**
 * The size of a photo in a chat: longest edge 128px on a phone, aspect kept;
 * from `sm` up a 56px 4:3 tile, smaller than a record's own photo tiles, cut
 * from the bottom so the watermark strip stays (JB43). Exported for the guard
 * test.
 */
export const CHAT_THUMBNAIL_IMG_CLASS =
  "block h-auto w-auto max-h-32 max-w-32 sm:aspect-4/3 sm:w-14 sm:max-h-none sm:max-w-none sm:object-cover sm:object-bottom";

/** A message's photos: a wrapping row on a phone, four to a row from `sm` up (JB43). */
export const CHAT_PHOTO_GRID_CLASS =
  "flex flex-wrap items-start gap-2 sm:grid sm:w-fit sm:grid-cols-4 sm:gap-1.5";

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
        // Sent from the room's camera: its time and the message's GPS.
        ...photoMeta({ captured_at: photo.sentAt, latitude: photo.latitude, longitude: photo.longitude }),
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
        <div className={`mt-2 ${CHAT_PHOTO_GRID_CLASS}`} data-chat-photos>
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
        <ChatAttachment
          url={message.attachment}
          name={message.attachment_name || t("hazard.attach")}
          sentBy={`${message.author_name} · ${formatter.dateTime(message.sent_at)}`}
        />
      )}
    </li>
  );
}

/** What a sent file is, from its name: how the in-page preview reads it. */
export function chatAttachmentType(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const known: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    txt: "text/plain",
    csv: "text/csv",
    mp4: "video/mp4",
    webm: "audio/webm",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
  };
  return known[ext] ?? null;
}

/**
 * A file sent in the conversation, opened in the page.
 *
 * Client 2026-10-10 (round 2): 「我上传了文件发送给手机端…我这里手机就打不开」 -
 * 「ecrl quo.xlsx」 was a bare link, and a phone has nothing to open an Excel
 * file with. Tapping it now reads it here - a PDF, a photo, a Word or Excel
 * file (`FilePreview`) - with 下载 beside it; a format nothing can draw says
 * so and offers the download. One component, so every chat (the hazard's,
 * the permit's, every record's) opens files the same way.
 */
function ChatAttachment({ url, name, sentBy }: { url: string; name: string; sentBy: string }) {
  const [open, setOpen] = useState(false);
  const type = chatAttachmentType(name);
  return (
    <>
      {/* The file as a picture, never its name (J34-11): a photo is
          itself, anything else its type's square; the name is the tooltip
          and the preview's title. */}
      <span className="mt-2 block" data-chat-attachment>
        <FileThumbs
          all
          files={[
            {
              id: url,
              name,
              thumbnail_url: type?.startsWith("image/") ? url : null,
              onOpen: () => setOpen(true),
            },
          ]}
        />
      </span>
      {open && (
        <FilePreviewDialog
          title={name}
          description={sentBy}
          load={async () => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(String(response.status));
            const blob = await response.blob();
            // The stored file's own type can be a generic one; the preview
            // needs the real one to draw a PDF in its frame.
            return URL.createObjectURL(type ? new Blob([blob], { type }) : blob);
          }}
          previewType={type}
          filename={name}
          onDownload={() => downloadEvidence(url, name)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export type ComposerPayload = {
  body?: string;
  photo?: File;
  audio?: File;
  audio_seconds?: number;
  attachment?: File;
  attachment_name?: string;
  /** Where a photo taken with the in-app camera was taken, when the phone said. */
  latitude?: string;
  longitude?: string;
  accuracy_m?: string;
};

/** The phone's field app, where a chat photo is taken with the in-app camera. */
export function isFieldChatPath(pathname: string | null | undefined): boolean {
  return !!pathname?.startsWith("/field-staff");
}

/**
 * How long a send waits for the position its photo asked for. The fix was
 * asked for when the shutter went, so by the time a person has typed a line it
 * has normally long arrived; a phone that cannot find itself indoors must not
 * hold the message back for it.
 */
export const PHOTO_LOCATION_WAIT_MS = 3_000;

type PhotoPlace = Pick<ComposerPayload, "latitude" | "longitude" | "accuracy_m">;

/**
 * Where a chat photo was taken, asked the moment it is taken - the same
 * position every other in-app camera photo carries into the evidence ledger.
 * Best effort: no answer means the photo goes without one, never that it does
 * not go. A photo picked from the gallery gets none, because where the phone
 * is now says nothing about where that photo was taken.
 */
export function usePhotoLocation() {
  const pending = useRef<Promise<LocationFix | null> | null>(null);

  const start = useCallback(() => {
    pending.current = requestLocation({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 30_000,
    }).catch(() => null);
  }, []);

  const clear = useCallback(() => {
    pending.current = null;
  }, []);

  const read = useCallback(async (): Promise<PhotoPlace> => {
    const asked = pending.current;
    if (!asked) return {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fix = await Promise.race([
      asked,
      new Promise<null>((settle) => {
        timer = setTimeout(() => settle(null), PHOTO_LOCATION_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return fix
      ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
      : {};
  }, []);

  return { start, clear, read };
}

/**
 * The box a person types, attaches or speaks into.
 *
 * Voice is offered first rather than last, and a browser that cannot record
 * says so instead of showing a button that does nothing: the customer
 * described part of their crew as 「不识字」, so for them the 「或」 in
 * 「文字或语音」 does not hold (D-094).
 *
 * On the phone a photo is taken with the app's own camera (`FieldCamera`),
 * like every other photo the field app takes - not the phone's system camera
 * (Lucas, 10-09: 「聊天室拍照好像不是系统的相机，弄成系统相机拍照」, where
 * 系统 means this system). So a chat photo is taken at upload size and carries
 * where it was taken. The file box stays: in the office for any file, on the
 * phone for documents only - a phone photo comes only from the app's square
 * camera (J45, Lucas 2026-10-22: no gallery). Every photo, however it
 * arrived, goes through the same `compressPhoto` as the offline queue before
 * it is sent.
 */
/** What the chat's file box takes in the office; on the phone, less pictures. */
const CHAT_FILE_ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx";

export function ConversationComposer({
  body,
  setBody,
  file,
  setFile,
  limit,
  sending,
  onSend,
  moreWork,
}: {
  body: string;
  setBody: (value: string) => void;
  file: File | null;
  setFile: (value: File | null) => void;
  limit: number;
  sending: boolean;
  onSend: (payload: ComposerPayload) => void;
  /**
   * The 「需要继续整改」 switch (ID11), for whoever may confirm the record
   * while it waits for them. On, the message sends the item back to the
   * person fixing it; off, it is only a message - a question never sends
   * work back by accident. There is no 退回 button any more.
   */
  moreWork?: { on: boolean; onChange: (next: boolean) => void };
}) {
  const t = useTranslations();
  const recorder = useRecorder(limit, ({ file: audio, seconds }) => {
    if (audio) onSend({ audio, audio_seconds: seconds });
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const fieldMode = isFieldChatPath(usePathname());
  const fileAccept = fieldMode ? (phoneFileAccept(CHAT_FILE_ACCEPT) ?? "") : CHAT_FILE_ACCEPT;
  // A gallery picture the phone's chooser let through anyway (J45).
  const [galleryPhoto, setGalleryPhoto] = useState("");
  const place = usePhotoLocation();
  // Shrinking a gallery photo and waiting for the position take a moment;
  // the send button stays locked meanwhile so a second tap is not a second
  // message.
  const [preparing, setPreparing] = useState(false);
  const busy = sending || preparing;
  // The microphone refused or the recorder could not start: said, instead of
  // a button that does nothing (JB36).
  const [voiceFailed, setVoiceFailed] = useState(false);

  const startVoice = async () => {
    setVoiceFailed(false);
    try {
      await recorder.start();
    } catch {
      setVoiceFailed(true);
    }
  };

  const isPhoto = file?.type.startsWith("image/") ?? false;

  const resetFileInput = () => {
    if (fileInput.current) fileInput.current.value = "";
  };

  const takePhoto = (photo: File) => {
    resetFileInput();
    setFile(photo);
    place.start();
  };

  const clearPhoto = () => {
    resetFileInput();
    setFile(null);
    place.clear();
  };

  const submitText = async () => {
    if (!body.trim() && !file) return;
    setPreparing(true);
    try {
      const photo = file && isPhoto ? await compressPhoto(file) : undefined;
      const where = photo ? await place.read() : {};
      onSend({
        body: body.trim(),
        ...(photo ? { photo, ...where } : {}),
        ...(file && !isPhoto ? { attachment: file, attachment_name: file.name } : {}),
      });
    } finally {
      setPreparing(false);
    }
    resetFileInput();
  };

  const submitVoice = async () => {
    const { file: audio, seconds } = await recorder.stop();
    if (!audio) return;
    onSend({ audio, audio_seconds: seconds });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      {moreWork && (
        <label
          className={`flex items-start gap-3 rounded-md border p-2.5 text-sm ${moreWork.on ? "border-tone-rose/50 bg-tone-rose/5" : "border-dashed"}`}
          data-more-work={moreWork.on ? "on" : "off"}
        >
          <Switch
            tone="danger"
            checked={moreWork.on}
            onCheckedChange={moreWork.onChange}
            aria-label={t("taskFlow.moreWork.label")}
          />
          <span className="min-w-0">
            <span className="block font-medium">{t("taskFlow.moreWork.label")}</span>
            <span className="block text-xs text-muted-foreground">
              {t(moreWork.on ? "taskFlow.moreWork.on" : "taskFlow.moreWork.off")}
            </span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          // The phone keyboard's own 「发送」 key sends too (JB36) - never
          // while a Chinese word is still being put together.
          enterKeyHint="send"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            if (!busy && (body.trim() || file)) void submitText();
          }}
          placeholder={t("hazard.placeholder")}
          aria-label={t("hazard.placeholder")}
          className="min-w-[12rem] flex-1"
        />
        <Button
          size="sm"
          disabled={busy || (!body.trim() && !file)}
          disabledReason={busy ? t("common.saving") : t("hazard.nothingToSend")}
          onClick={() => void submitText()}
        >
          <Send className="h-4 w-4" />
          {moreWork?.on ? t("taskFlow.moreWork.send") : t("hazard.send")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {fieldMode && (
          // The pending photo shows here, whichever way it came, so the
          // worker sees what is about to be sent and can retake or clear it.
          <FieldCamera
            label={t("hazard.takePhoto")}
            file={file && isPhoto ? file : undefined}
            disabled={busy}
            className="w-28 shrink-0"
            onCapture={takePhoto}
            onClear={clearPhoto}
          />
        )}

        {/* The browser's own file box said 「Choose File / No file chosen」 in
            English on every phone and computer (客户 10-29 晚 图 5): a button
            in our words opens it, and the chosen file's name shows beside. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip />
          {t("hazard.attach")}
        </Button>
        {file && !(fieldMode && isPhoto) ? (
          <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{file.name}</span>
        ) : null}
        <Input
          ref={fileInput}
          type="file"
          accept={fileAccept}
          className="hidden"
          tabIndex={-1}
          aria-label={t("hazard.attach")}
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            if (fieldMode && picked && isPhotoFile(picked)) {
              setGalleryPhoto(picked.name);
              return;
            }
            setGalleryPhoto("");
            // A photo from the office's files was not taken here and now, so
            // it carries no position.
            place.clear();
            setFile(picked);
          }}
        />
        {galleryPhoto ? (
          <p role="alert" className="w-full text-xs text-destructive">
            {t("attachmentPicker.photoUseCamera", { name: galleryPhoto })}
          </p>
        ) : null}

        {recorder.supported ? (
          recorder.recording ? (
            <>
              <Button size="sm" variant="destructive" onClick={submitVoice}>
                <Square className="h-4 w-4" />
                {t("hazard.recordStop")} ·{" "}
                {t("hazard.recordingFor", { seconds: recorder.seconds, limit })}
              </Button>
              {/* 「取消」 (J3, Q3-1): dropped at once, nothing sent, no second question. */}
              <Button size="sm" variant="outline" onClick={recorder.cancel}>
                <X className="h-4 w-4" />
                {t("hazard.recordCancel")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={sending}
              disabledReason={t("common.saving")}
              onClick={() => void startVoice()}
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
        {voiceFailed ? (
          <p role="alert" className="w-full text-xs text-destructive">
            {t("hazard.recordFailed")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
