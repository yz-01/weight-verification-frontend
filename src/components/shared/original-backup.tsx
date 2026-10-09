"use client";

/**
 * One photo original's state, worded and coloured (H5 三.5, WP1).
 *
 * What is shown is the server's word: 「原图已备份」 appears only when the
 * server has verified the bytes. Since Lucas's update of 2026-10-09 the field
 * worker sees none of this (「现场人员只需拍照、提交，不需要了解原图备份和
 * 同步操作」): it is read in the office's evidence ledger and on the technical
 * page (`components/technical`), where the sync, retry and storage tools are.
 */

import { CheckCircle2, CloudUpload, ImageUp, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OriginalStatus } from "@/interfaces/evidence";

const STATUS_STYLE: Record<OriginalStatus, { icon: typeof CheckCircle2; className: string }> = {
  APPLICATION_UPLOADED: { icon: CloudUpload, className: "text-muted-foreground" },
  ORIGINAL_PENDING: { icon: ImageUp, className: "text-warning" },
  ORIGINAL_BACKED_UP: { icon: CheckCircle2, className: "text-success" },
  ORIGINAL_FAILED: { icon: XCircle, className: "text-destructive" },
};

/** One of the four states, worded and coloured. */
export function OriginalStatusText({ status, className = "" }: { status: OriginalStatus; className?: string }) {
  const t = useTranslations("originals");
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${style.className} ${className}`}>
      <Icon className="size-3.5 shrink-0" />
      {t(`status.${status}`)}
    </span>
  );
}
