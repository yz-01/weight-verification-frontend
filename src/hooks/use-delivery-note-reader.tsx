"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { ApiError } from "@/interfaces/api";
import type { DeliveryNoteOCRResult } from "@/interfaces/contractor";

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
 */
export function useDeliveryNoteReader({
  read,
  onRead,
  onReset,
}: {
  read: (project: string, image: File) => Promise<DeliveryNoteOCRResult>;
  onRead: (result: DeliveryNoteOCRResult) => void;
  onReset?: () => void;
}) {
  const t = useTranslations("fieldStaffPwa.material");
  const [message, setMessage] = useState("");
  const [succeeded, setSucceeded] = useState(false);
  // The photo being read. An answer for any other photo is stale and dropped.
  const target = useRef<Target | null>(null);

  const mutation = useMutation({
    mutationFn: ({ project, image }: Target) => read(project, image),
    onSuccess: (result, sent) => {
      if (target.current !== sent) return;
      setSucceeded(true);
      const doubtful = result.low_confidence_fields ?? [];
      setMessage(
        doubtful.length > 0
          ? t("ocrLowConfidence", {
              fields: doubtful.map((field) => t(`ocrField.${field}`)).join(", "),
            })
          : t("ocrReady"),
      );
      onRead(result);
    },
    onError: (reason, sent) => {
      if (target.current !== sent) return;
      setSucceeded(false);
      setMessage(reason instanceof ApiError ? reason.message : t("ocrManual"));
      onReset?.();
    },
  });

  /** Forget the last read: a new project, or the photo was removed. */
  const cancel = () => {
    target.current = null;
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
    mutation.mutate(next);
  };

  return { inspect, cancel, reading: mutation.isPending, message, succeeded };
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
