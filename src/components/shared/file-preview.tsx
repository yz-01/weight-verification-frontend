"use client";

/**
 * One file, looked at in the page: read it, print it, open it in its own tab
 * or save it (B27).
 *
 * 「必须下载到本地才看得到资料」 was the complaint. A PDF, a photograph, a text
 * file or a clip is shown right here; anything a browser cannot draw - a Word
 * file, a drawing, a zip - says so and offers the download, never an empty
 * frame that looks like a broken page.
 *
 * Which is which is the server's answer (`preview_type`, decided from the
 * file's name), not this component's guess, and the bytes are fetched with
 * the session like every other API call - the API is another origin, so a
 * plain link would arrive signed out.
 */

import { Download, ExternalLink, FileWarning, Loader2, Printer, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { SheetView } from "@/components/shared/file-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PreviewKind = "pdf" | "image" | "text" | "video" | "audio" | "sheet";

/**
 * How a content type is shown, or `null` when the browser cannot show it.
 *
 * An Excel workbook has no type the browser draws, so the server sends none;
 * it is recognised by its name and read here as a table (PDF 统一操作规则:
 * 「所有关于 pdf 或者 excel 的都可以预览不用先下载」).
 */
export function previewKind(type: string | null | undefined, filename = ""): PreviewKind | null {
  if (/\.xlsx$/i.test(filename)) return "sheet";
  if (!type) return null;
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/")) return "text";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return null;
}

/** `DOCX` from `minutes.docx`, for the sentence that says it cannot be shown. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function FilePreview({
  load,
  previewType,
  filename,
  onDownload,
  className,
}: {
  /** Fetches the file and resolves to an object URL; revoked here. */
  load: () => Promise<string>;
  previewType: string | null | undefined;
  filename: string;
  onDownload: () => Promise<void> | void;
  className?: string;
}) {
  const t = useTranslations("filePreview");
  const kind = previewKind(previewType, filename);
  const frame = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!kind) return;
    let alive = true;
    let made: string | null = null;
    load()
      .then((objectUrl) => {
        made = objectUrl;
        if (alive) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // `load` is a fresh closure on every render of the caller; the file is
    // named by its preview type and name, and `attempt` is the retry. A
    // different file is a different mount (the callers key it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, filename, attempt]);

  const save = useCallback(async () => {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  }, [onDownload]);

  const print = () => {
    if (!url) return;
    if (kind === "image") {
      const printable = window.open("", "_blank");
      if (!printable) return;
      printable.document.write(
        `<!doctype html><title>${escapeAttribute(filename)}</title>` +
          `<style>html,body{margin:0}img{max-width:100%;display:block;margin:0 auto}</style>` +
          `<img src="${escapeAttribute(url)}" onload="window.focus();window.print()">`,
      );
      printable.document.close();
      return;
    }
    const target = frame.current?.contentWindow;
    if (target) {
      target.focus();
      target.print();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const canPrint = kind === "pdf" || kind === "image" || kind === "text";

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="relative min-h-60 flex-1 overflow-hidden rounded-md border bg-muted/30">
        {!kind ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <FileWarning className="size-8 text-warning" />
            <p className="text-sm font-medium text-foreground">
              {t("unsupported", { ext: fileExtension(filename) || t("thisFormat") })}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">{t("unsupportedHelp")}</p>
            <Button size="sm" disabled={downloading} onClick={() => void save()}>
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {t("download")}
            </Button>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-destructive">{t("failed")}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFailed(false);
                setUrl(null);
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw className="size-4" />
              {t("retry")}
            </Button>
          </div>
        ) : !url ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={filename} className="absolute inset-0 size-full object-contain" />
        ) : kind === "video" ? (
          <video src={url} controls className="absolute inset-0 size-full bg-black" />
        ) : kind === "sheet" ? (
          <SheetFromUrl url={url} />
        ) : kind === "audio" ? (
          <div className="grid h-full place-items-center p-6">
            <audio src={url} controls className="w-full max-w-md" />
          </div>
        ) : (
          <iframe ref={frame} src={url} title={filename} className="absolute inset-0 size-full bg-white" />
        )}
      </div>
      {kind && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!url}
            disabledReason={!url ? t("loading") : undefined}
            onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-4" />
            {t("openNewTab")}
          </Button>
          {canPrint && (
            <Button
              size="sm"
              variant="outline"
              disabled={!url}
              disabledReason={!url ? t("loading") : undefined}
              onClick={print}
            >
              <Printer className="size-4" />
              {t("print")}
            </Button>
          )}
          <Button size="sm" disabled={downloading} onClick={() => void save()}>
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {t("download")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A workbook already fetched as an object URL, read as a table. */
function SheetFromUrl({ url }: { url: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(url)
      .then((response) => response.blob())
      .then((read) => alive && setBlob(read));
    return () => {
      alive = false;
    };
  }, [url]);
  return blob ? (
    <SheetView file={blob} />
  ) : (
    <div className="grid h-full place-items-center">
      <Loader2 className="size-7 animate-spin text-primary" />
    </div>
  );
}

export function FilePreviewDialog({
  title,
  description,
  onClose,
  ...preview
}: {
  title: string;
  description?: string;
  onClose: () => void;
  load: () => Promise<string>;
  previewType: string | null | undefined;
  filename: string;
  onDownload: () => Promise<void> | void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92dvh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="break-all">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <FilePreview {...preview} className="flex-1" />
      </DialogContent>
    </Dialog>
  );
}
