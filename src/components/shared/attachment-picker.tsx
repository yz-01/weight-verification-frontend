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
 * On a phone (J45, Lucas 2026-10-22) the camera button is the app's own
 * square camera, the same as the desktop's, never the phone's camera app or
 * gallery; the phone's file chooser offers documents only (`phoneFileAccept`),
 * and a picture that still arrives through it is turned away with a word to
 * use the camera.
 *
 * `pasteAnywhere` (JB223, 客户 11-19 事项 3: 「支持粘贴 WhatsApp 照片及截图」) is
 * for a form somebody fills at a desk: a 【粘贴截图】 button, Ctrl+V of a
 * picture anywhere on the page (words pasted into a text box stay words), and
 * a line saying what was pasted - or why nothing was. Off by default.
 */

import { ClipboardPaste, FileText, FileUp, ImageIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { FieldCamera } from "@/components/shared/field-camera";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  acceptFiles,
  isPhotoFile,
  megabytes,
  phoneFileAccept,
  transferFiles,
  type AttachmentRule,
  type Refusal,
} from "@/lib/attachment-picker";
import {
  canReadClipboardPictures,
  nameScreenshots,
  pastedForTheBox,
  pastedLineKey,
  readClipboardPictures,
} from "@/lib/clipboard-pictures";
import { cn } from "@/lib/utils";
import { carriesFiles } from "@/lib/voucher-sources";

/** What the last paste did, said under the box (JB223). */
type PasteLine =
  | { key: "pastedPictures" | "pastedFiles"; count: number }
  | { key: "clipboardEmpty" | "clipboardRefused" };

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
  pasteAnywhere = false,
  hint,
  chooseLabel,
  cameraLabel,
  fit,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  rule: AttachmentRule;
  /** Off for an archive of documents, which needs no photograph. */
  camera?: boolean;
  /**
   * JB223: 【粘贴截图】, Ctrl+V anywhere on the page, and the line saying what
   * was pasted. The buttons then read 选择 → 粘贴 → 摄像头, the camera last.
   */
  pasteAnywhere?: boolean;
  /** A page's own one-line hint in place of the standard one. */
  hint?: string;
  /** A page's own words on the file chooser and the camera button. */
  chooseLabel?: string;
  cameraLabel?: string;
  /**
   * A page's own ceilings beyond `rule` (JB223: ten photos and ten files in
   * one box): what the box keeps of a new list, and what it turns away -
   * said with the rule's refusals, through `refusalText`.
   */
  fit?: (files: File[]) => { files: File[]; refused: Refusal[] };
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
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState<Refusal[]>([]);
  const [notFiles, setNotFiles] = useState(false);
  // Pictures a phone tried to bring in from its gallery (J45).
  const [photosRefused, setPhotosRefused] = useState<string[]>([]);
  const [pasteLine, setPasteLine] = useState<PasteLine | null>(null);
  const phoneAccept = phoneFileAccept(rule.accept);
  const showChooser = !mobile || phoneAccept !== null;
  // Read during render, like the hazard form's GPS support: it does not
  // change while the form is open, and a phone never gets the button.
  const showPasteButton = pasteAnywhere && !mobile && canReadClipboardPictures();

  const limit = rule.maxBytes === undefined ? "" : megabytes(rule.maxBytes);

  /** Offer files to the box; how many it took. */
  const add = (incoming: File[]) => {
    if (disabled || incoming.length === 0) return 0;
    const accepted = acceptFiles(files, incoming, rule);
    const fitted = fit ? fit(accepted.files) : { files: accepted.files, refused: [] };
    setRefused([...accepted.refused, ...fitted.refused]);
    setNotFiles(false);
    setPhotosRefused([]);
    setPasteLine(null);
    if (fitted.files.length !== files.length || fitted.files.some((file, at) => file !== files[at])) {
      onChange(fitted.files);
    }
    return Math.max(0, fitted.files.length - files.length);
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

  /** Files from the chooser or a paste: on a phone, pictures only by the camera. */
  const offerPicker = (list: FileList | File[] | null) => {
    const incoming = Array.from(list ?? []);
    if (!mobile) {
      return add(incoming);
    }
    const pictures = incoming.filter(isPhotoFile);
    const taken = add(incoming.filter((file) => !isPhotoFile(file)));
    setPhotosRefused(pictures.map((file) => file.name));
    return taken;
  };

  /** A paste, from Ctrl+V or 【粘贴截图】; with `pasteAnywhere` it is named and said. */
  const takePasted = (incoming: File[]) => {
    if (!pasteAnywhere) {
      offerPicker(incoming);
      return;
    }
    const named = nameScreenshots(incoming, t("screenshotName"), new Date());
    const taken = offerPicker(named);
    setPasteLine(taken > 0 ? { key: pastedLineKey(named), count: taken } : null);
  };

  const pasteFromClipboard = async () => {
    const found = await readClipboardPictures(
      typeof navigator === "undefined" ? undefined : navigator.clipboard,
      t("screenshotName"),
    );
    if (found.kind === "ok") takePasted(found.files);
    else setPasteLine({ key: found.kind === "empty" ? "clipboardEmpty" : "clipboardRefused" });
  };

  // Ctrl+V anywhere on the page. A paste the box itself took (focus inside
  // it) is already prevented and is not taken twice.
  const onWindowPaste = useEffectEvent((event: ClipboardEvent) => {
    if (event.defaultPrevented) return;
    const pasted = pastedForTheBox(event.target, event.clipboardData);
    if (pasted.length === 0) return;
    event.preventDefault();
    takePasted(pasted);
  });
  useEffect(() => {
    if (!pasteAnywhere || disabled) return;
    const listener = (event: ClipboardEvent) => onWindowPaste(event);
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, [pasteAnywhere, disabled]);

  const chooser = showChooser && (
    <Button
      key="choose"
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={disabled}
      onClick={() => picker.current?.click()}
    >
      <FileUp />
      {chooseLabel ?? t("chooseFile")}
    </Button>
  );
  const cameraButton = camera && (
    <FieldCamera
      key="camera"
      trigger="button"
      label={cameraLabel ?? t("takePhoto")}
      className="min-h-11"
      disabled={disabled}
      onCapture={(photo) => add([photo])}
    />
  );
  const pasteButton = showPasteButton && (
    <Button
      key="paste"
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={disabled}
      onClick={() => void pasteFromClipboard()}
    >
      <ClipboardPaste />
      {t("pasteScreenshot")}
    </Button>
  );
  const buttons = (pasteAnywhere ? [chooser, pasteButton, cameraButton] : [cameraButton, chooser]).filter(Boolean);

  return (
    <div
      className={cn("space-y-2", className)}
      data-slot="attachment-picker"
      // Only a paste that carries files is taken, and only from inside here.
      onPaste={(event) => {
        const pasted = transferFiles(event.clipboardData);
        if (pasted.length > 0) {
          event.preventDefault();
          takePasted(pasted);
        } else if (carriesFiles(event.clipboardData)) {
          setNotFiles(true);
        }
      }}
    >
      <div
        tabIndex={disabled ? -1 : 0}
        aria-label={hint ?? t(dropHintKey(camera, false))}
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
          {hint ?? t(mobile && camera && !showChooser ? "dropHintPhoneCameraOnly" : dropHintKey(camera, mobile))}
        </p>
        <div
          className={cn(
            "grid gap-2",
            buttons.length >= 3 ? "grid-cols-1 sm:grid-cols-3" : buttons.length === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {buttons}
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
        {showChooser && (
          <input
            ref={picker}
            type="file"
            multiple={rule.multiple}
            accept={mobile ? (phoneAccept ?? undefined) : rule.accept}
            className="hidden"
            aria-label={chooseLabel ?? t("chooseFile")}
            onChange={(event) => {
              offerPicker(event.target.files);
              event.target.value = "";
            }}
          />
        )}
      </div>

      {refused.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-destructive">
          {refused.map((item, at) => (
            <li key={`${item.name}-${at}`}>{say(item)}</li>
          ))}
        </ul>
      )}
      {photosRefused.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          {t("photoUseCamera", { name: photosRefused.join(", ") })}
        </p>
      )}
      {notFiles && (
        <p role="alert" className="text-xs text-destructive">
          {t("notAFile")}
        </p>
      )}
      {pasteLine && "count" in pasteLine && (
        <p role="status" className="text-sm font-medium text-success">
          {t(pasteLine.key, { count: pasteLine.count })}
        </p>
      )}
      {pasteLine && !("count" in pasteLine) && (
        <p role="alert" className="text-sm text-destructive">
          {t(pasteLine.key)}
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
                  setPasteLine(null);
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
