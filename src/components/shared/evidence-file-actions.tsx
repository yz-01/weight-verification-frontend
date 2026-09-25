"use client";

/**
 * Preview, print or download one photograph or document, from the record it
 * belongs to (T-365, D-236).
 *
 * 客户第 70 条：「原栏目里的单一资料必须能独立 Preview／打印／下载／导出 —— 例如
 * 打开一笔材料收货记录后，里面的 DO、文件可以直接查看打印导出，**不需要先进
 * Multi Engine**，也不需要下载整包。」 And the principle beside it: 「原始资料永远
 * 留在原事项」 - so this reads the file where it already is and makes no copy.
 *
 * Three actions, each with the plainest mechanism that works across origins.
 * The files are served from the API host, not this one, which rules out the
 * obvious `<a download>` (ignored cross-origin) and printing the file's own
 * window (a cross-origin window cannot be told to print):
 *
 * * preview - the file in a new tab, full size, with the watermark it carries;
 * * print - a blank window of our own holding the image, printed once it has
 *   loaded; a PDF opens in the browser's own viewer, which prints it;
 * * download - fetched as a blob and saved under a name that says which record
 *   it came from. If the host refuses the fetch, the file opens instead, so
 *   the person can still save it rather than being shown nothing.
 */

import { Download, ExternalLink, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

function isPdf(url: string) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function printEvidence(url: string, title: string) {
  if (isPdf(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const printable = window.open("", "_blank");
  if (!printable) return;
  printable.document.write(
    `<!doctype html><title>${escapeAttribute(title)}</title>` +
      `<style>html,body{margin:0}img{max-width:100%;display:block;margin:0 auto}</style>` +
      `<img src="${escapeAttribute(url)}" onload="window.focus();window.print()">`,
  );
  printable.document.close();
}

export async function downloadEvidence(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // The host would not hand the bytes to script. Opening the file is the
    // honest fallback: the person can still save it from there.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function EvidenceFileActions({
  url,
  filename,
  title,
}: {
  url: string;
  /** Saved as, e.g. `MR-0001-delivery-note.jpg`. */
  filename: string;
  /** The heading on the printed page. */
  title: string;
}) {
  const t = useTranslations("evidenceFile");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" asChild>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink />
          {t("preview")}
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={() => printEvidence(url, title)}>
        <Printer />
        {t("print")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void downloadEvidence(url, filename)}
      >
        <Download />
        {t("download")}
      </Button>
    </div>
  );
}
