"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/interfaces/api";
import type { DeliveryNoteOCRResult } from "@/interfaces/contractor";
import { OCR_READ_TIMEOUT_MS, readWithin } from "@/lib/delivery-note-read";

type Target = { project: string; image: File };

/**
 * Reading a delivery-note photo, the way 材料进场 does it - for every module.
 *
 * Lucas, 2026-09-26: 「全部模块的OCR应该是统一用材料进场的那个OCR才对」. The
 * engine behind every screen was already the same; what differed was this
 * layer. 材料进场 read the photo the moment it was taken, said when it could
 * not (no project yet, offline, unreadable), named the fields it was unsure
 * of, and ignored a late answer for a photo that had since been retaken.
 * 设备进退场 waited behind a 【使用 Azure OCR 读取】 button and said only
 * "read". Both now come through here.
 *
 * `read` is the module's endpoint - each returns the same result
 * (`receiving.ocr.read_delivery_note` on the server). `onRead` fills the
 * module's own form; `onReset` clears whatever it kept from the last read.
 *
 * A read never holds the form back (hotfix after the October deploy): it
 * stops waiting after `OCR_READ_TIMEOUT_MS` and says to type the details in,
 * and a field the worker typed into while it was reading is theirs - pass
 * its name to `noteTyped`, and `onRead` is told not to overwrite it.
 */
export function useDeliveryNoteReader({
  read,
  onRead,
  onReset,
}: {
  read: (project: string, image: File) => Promise<DeliveryNoteOCRResult>;
  onRead: (result: DeliveryNoteOCRResult, typed: ReadonlySet<string>) => void;
  onReset?: () => void;
}) {
  const t = useTranslations("fieldStaffPwa.material");
  const [message, setMessage] = useState("");
  const [succeeded, setSucceeded] = useState(false);
  // A read is in progress for the current photo. Not the mutation's own
  // pending flag: a read that timed out or was cancelled may still be on the
  // wire, but nobody is waiting on it any more.
  const [reading, setReading] = useState(false);
  // The photo being read. An answer for any other photo is stale and dropped.
  const target = useRef<Target | null>(null);
  // Fields the worker typed into while this read was running.
  const typed = useRef(new Set<string>());
  // A form that closed (submitted, or dismissed) takes no late answer: it
  // would write the last delivery's DO into the next one's draft.
  useEffect(() => () => {
    target.current = null;
  }, []);

  const mutation = useMutation({
    mutationFn: ({ project, image }: Target) =>
      readWithin(() => read(project, image), OCR_READ_TIMEOUT_MS),
    onSuccess: (outcome, sent) => {
      if (target.current !== sent) return;
      setReading(false);
      if (outcome.kind !== "read") {
        // Failed, or out of time: the worker types it in, nothing waits.
        target.current = null;
        setSucceeded(false);
        setMessage(
          outcome.kind === "failed" && outcome.reason instanceof ApiError
            ? outcome.reason.message
            : t("ocrManual"),
        );
        onReset?.();
        return;
      }
      const result = outcome.result;
      setSucceeded(true);
      const doubtful = result.low_confidence_fields ?? [];
      setMessage(
        doubtful.length > 0
          ? t("ocrLowConfidence", {
              fields: doubtful.map((field) => t(`ocrField.${field}`)).join(", "),
            })
          : t("ocrReady"),
      );
      onRead(result, new Set(typed.current));
    },
  });

  /** Forget the last read: a new project, or the photo was removed. */
  const cancel = () => {
    target.current = null;
    setReading(false);
    setSucceeded(false);
    setMessage("");
    onReset?.();
  };

  /** Read this photo now - the moment it is taken, no button. */
  const inspect = (project: string, image?: File) => {
    cancel();
    if (!image) return;
    if (!project) {
      setMessage(t("ocrChooseProject"));
      return;
    }
    if (!navigator.onLine) {
      setMessage(t("ocrOffline"));
      return;
    }
    const next = { project, image };
    target.current = next;
    typed.current = new Set();
    setReading(true);
    mutation.mutate(next);
  };

  /** The worker typed into this field: a read that lands later leaves it alone. */
  const noteTyped = (field: string) => {
    if (reading) typed.current.add(field);
  };

  return { inspect, cancel, noteTyped, reading, message, succeeded };
}

/** The one line that says how the read went, the same on every screen. */
export function DeliveryNoteReadStatus({
  reader,
  className = "",
}: {
  reader: Pick<ReturnType<typeof useDeliveryNoteReader>, "reading" | "message" | "succeeded">;
  className?: string;
}) {
  const t = useTranslations("fieldStaffPwa.material");
  if (!reader.reading && !reader.message) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${reader.succeeded ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"} ${className}`}
    >
      {reader.reading ? t("ocrReading") : reader.message}
    </p>
  );
}
