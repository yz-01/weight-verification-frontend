"use client";

/**
 * 添加附件 - the one desktop way to add files (I3, ID26).
 *
 * Four ways in, in one place: the computer's camera, a file dragged onto the
 * area, Ctrl+V of a copied picture (a photo copied from WhatsApp Web works),
 * and the ordinary file chooser. Whatever was added is listed with a
 * thumbnail before it is uploaded, and can be taken out again.
 *
 * It holds files; the page uploads them. So every page keeps its own server
 * call, limits and error texts: the page hands its limits in `rule`, the
 * picker shows them, and refuses early with the same sentences the server
 * would use (`refusalText` hands in a page's own messages).
 *
 * Paste is taken only while focus is inside this component, or inside its
 * camera dialog, so Ctrl+V in any other field on the page is left alone.
 * On a phone the camera button is the phone's own capture input, as before.
 */

import { FileText, FileUp, ImageIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { FieldCamera } from "@/components/shared/field-camera";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { acceptFiles, megabytes, transferFiles, type AttachmentRule, type Refusal } from "@/lib/attachment-picker";
import { cn } from "@/lib/utils";
import { carriesFiles } from "@/lib/voucher-sources";

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Thumb({ file }: { file: File }) {
  const isImage = file.type.startsWith("image/");
  const url = useMemo(() => (isImage ? URL.createObjectURL(file) : ""), [file, isImage]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!url) return <FileText className="size-8 shrink-0 text-muted-foreground" />;
  return (
    <>
      {/* A local blob, not an optimisable asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={file.name} className="size-10 shrink-0 rounded object-cover" />
    </>
  );
}

/** The picker's one-line hint: no camera named where there is none (the archive). */
export function dropHintKey(camera: boolean, mobile: boolean) {
  if (camera) return mobile ? "dropHintPhone" : "dropHint";
  return mobile ? "dropHintPhoneNoCamera" : "dropHintNoCamera";
}

export function AttachmentPicker({
  files,
  onChange,
  rule,
  camera = true,
  showLimits = true,
  doneCount = 0,
  refusalText,
  disabled = false,
  className,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  rule: AttachmentRule;
  /** Off for an archive of documents, which needs no photograph. */
  camera?: boolean;
  /** Off when the page already says its limits in its own hint. */
  showLimits?: boolean;
  /** The first this many files are already sent (a batch in progress): drawn green. */
  doneCount?: number;
  /**
   * A page's own sentence for a refusal (the one its server would send), or
   * undefined to use the picker's standard wording.
   */
  refusalText?: (item: Refusal, limits: { maxFiles?: number; limit: string }) => string | undefined;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("attachmentPicker");
  const mobile = useIsMobile();
  const picker = useRef<HTMLInputElement>(null);
  const phoneCamera = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState<Refusal[]>([]);
  const [notFiles, setNotFiles] = useState(false);

  const limit = rule.maxBytes === undefined ? "" : megabytes(rule.maxBytes);

  const add = (incoming: File[]) => {
    if (disabled || incoming.length === 0) return;
    const result = acceptFiles(files, incoming, rule);
    setRefused(result.refused);
    setNotFiles(false);
    if (result.files.length !== files.length || result.files.some((file, at) => file !== files[at])) {
      onChange(result.files);
    }
  };

  const say = (item: Refusal) => {
    const own = refusalText?.(item, { maxFiles: rule.maxFiles, limit });
    if (own) return own;
    if (item.kind === "type") return t("wrongType", { name: item.name });
    if (item.kind === "size") return t("tooBig", { name: item.name, limit });
    if (item.kind === "total") {
      return t("tooBigTotal", { name: item.name, limit: megabytes(rule.maxTotalBytes ?? 0) });
    }
    return t("tooMany", { limit: rule.maxFiles ?? 0, name: item.name });
  };

  const offerPicker = (list: FileList | null) => {
    add(Array.from(list ?? []));
  };

  return (
    <div
      className={cn("space-y-2", className)}
      data-slot="attachment-picker"
      // Only a paste that carries files is taken, and only from inside here.
      onPaste={(event) => {
        const pasted = transferFiles(event.clipboardData);
        if (pasted.length > 0) {
          event.preventDefault();
          add(pasted);
        } else if (carriesFiles(event.clipboardData)) {
          setNotFiles(true);
        }
      }}
    >
      <div
        tabIndex={disabled ? -1 : 0}
        aria-label={t(dropHintKey(camera, false))}
        className={cn(
          "space-y-2 rounded-lg border border-dashed border-panel-border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging && "border-primary bg-primary/5",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(transferFiles(event.dataTransfer));
        }}
      >
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="mt-0.5 size-3.5 shrink-0" />
          {t(dropHintKey(camera, mobile))}
        </p>
        <div className={cn("grid gap-2", camera ? "grid-cols-2" : "grid-cols-1")}>
          {camera &&
            (mobile ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={disabled}
                onClick={() => phoneCamera.current?.click()}
              >
                <ImageIcon />
                {t("takePhoto")}
              </Button>
            ) : (
              <FieldCamera
                trigger="button"
                label={t("takePhoto")}
                className="min-h-11"
                disabled={disabled}
                onCapture={(photo) => add([photo])}
              />
            ))}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={disabled}
            onClick={() => picker.current?.click()}
          >
            <FileUp />
            {t("chooseFile")}
          </Button>
        </div>
        {showLimits && ((rule.multiple && rule.maxFiles !== undefined) || limit) ? (
          <p className="text-2xs text-muted-foreground">
            {rule.multiple && rule.maxFiles !== undefined
              ? limit
                ? t("limitsMany", { count: rule.maxFiles, limit })
                : t("limitsCount", { count: rule.maxFiles })
              : t("limitsOne", { limit })}
          </p>
        ) : null}
        <p className="text-2xs text-muted-foreground">{t("copiedNote")}</p>
        <input
          ref={phoneCamera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label={t("takePhoto")}
          onChange={(event) => {
            offerPicker(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={picker}
          type="file"
          multiple={rule.multiple}
          accept={rule.accept}
          className="hidden"
          aria-label={t("chooseFile")}
          onChange={(event) => {
            offerPicker(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {refused.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-destructive">
          {refused.map((item, at) => (
            <li key={`${item.name}-${at}`}>{say(item)}</li>
          ))}
        </ul>
      )}
      {notFiles && (
        <p role="alert" className="text-xs text-destructive">
          {t("notAFile")}
        </p>
      )}

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm", index < doneCount && "text-success")}
            >
              <Thumb file={file} />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{size(file.size)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                title={t("remove")}
                aria-label={t("remove")}
                disabled={disabled}
                onClick={() => {
                  setRefused([]);
                  onChange(files.filter((_, at) => at !== index));
                }}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
