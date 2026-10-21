"use client";

/**
 * A row's files as pictures (J34-10, Lucas 10-20).
 *
 * The client, on 施工准证: 「我要的是照片，不要一大堆文字」 - a list never shows
 * a file's name (「17922223678…605.jpg +1」). A photograph is its small
 * stamped copy, a PDF its first page, a Word or Excel file its own preview
 * when the server has one; anything else - or a picture that will not load -
 * is its type's icon with 「PDF」 / 「DOCX」 under it. Squares the size of the
 * photo strip (`PhotoStrip`), four at most and 「+N」 for the rest. The name
 * is kept for the tooltip and the screen reader, and for the record's own
 * detail, where the files open.
 */

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentFileIcon } from "@/components/document-workflow/document-archive-parts";
import { cn } from "@/lib/utils";

export interface ThumbFile {
  id: string;
  name: string;
  thumbnail_url?: string | null;
}

const SQUARES = 4;

export function FileThumbs({ files, className }: { files: readonly ThumbFile[]; className?: string }) {
  const t = useTranslations("photos");
  if (files.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = files.length > SQUARES ? files.slice(0, SQUARES - 1) : files;
  const more = files.length - shown.length;
  return (
    <span className={cn("inline-flex shrink-0 gap-1", className)} data-file-thumbs>
      {shown.map((file) => (
        <FileSquare key={file.id} file={file} />
      ))}
      {more > 0 ? (
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground ring-1 ring-panel-border sm:size-16"
          aria-label={t("more", { count: more })}
          title={t("more", { count: more })}
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

function FileSquare({ file }: { file: ThumbFile }) {
  const [failed, setFailed] = useState(false);
  const picture = file.thumbnail_url && !failed ? file.thumbnail_url : null;
  return (
    <span
      title={file.name}
      aria-label={file.name}
      role="img"
      data-file-thumb={picture ? "picture" : "icon"}
      className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-panel-border sm:size-16"
    >
      {picture ? (
        <Image
          src={picture}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <DocumentFileIcon name={file.name} />
      )}
    </span>
  );
}
