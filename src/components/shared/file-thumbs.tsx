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

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentFileIcon } from "@/components/document-workflow/document-archive-parts";
import { cn } from "@/lib/utils";

export interface ThumbFile {
  id: string;
  name: string;
  thumbnail_url?: string | null;
  /** Where the file opens (J34-11): a detail's square is a link to it. */
  href?: string | null;
  /** Or what opening it does - a download through the API, the viewer. */
  onOpen?: () => void;
}

const SQUARES = 4;

export function FileThumbs({
  files,
  className,
  all = false,
}: {
  files: readonly ThumbFile[];
  className?: string;
  /** A record's detail, a chat message (J34-11): every file, wrapping, none behind 「+N」. */
  all?: boolean;
}) {
  const t = useTranslations("photos");
  if (files.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = all || files.length <= SQUARES ? files : files.slice(0, SQUARES - 1);
  const more = files.length - shown.length;
  return (
    <span className={cn("inline-flex gap-1", all ? "flex-wrap" : "shrink-0", className)} data-file-thumbs>
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
  const square = <Square file={file} picture={picture} onFailed={() => setFailed(true)} />;
  const ring = "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (file.href) {
    return (
      <a href={file.href} target="_blank" rel="noopener noreferrer" className={ring} data-file-open>
        {square}
      </a>
    );
  }
  if (file.onOpen) {
    return (
      <button type="button" onClick={file.onOpen} className={ring} data-file-open>
        {square}
      </button>
    );
  }
  return square;
}

function Square({ file, picture, onFailed }: { file: ThumbFile; picture: string | null; onFailed: () => void }) {
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
          onError={onFailed}
        />
      ) : (
        <DocumentFileIcon name={file.name} />
      )}
    </span>
  );
}

const IMAGE_NAME = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i;

/**
 * One file reached only through the API (a package's chat), as a picture
 * (J34-11): a photograph is fetched once and shown as itself, anything else
 * is its type's square. Pressing it opens the file as before.
 */
export function LoadedFileThumb({
  id,
  name,
  load,
  onOpen,
}: {
  id: string;
  name: string;
  load: () => Promise<Blob>;
  onOpen: () => void;
}) {
  const image = IMAGE_NAME.test(name);
  // query-failure: a picture that will not load is its type's square, and opening it says why.
  const picture = useQuery({
    queryKey: ["file-thumb", id],
    queryFn: async () => URL.createObjectURL(await load()),
    enabled: image,
    staleTime: Infinity,
    retry: false,
  });
  return <FileThumbs all files={[{ id, name, thumbnail_url: picture.data ?? null, onOpen }]} />;
}

/** A file's picture: its stamped copy when it is a photograph, else none (its type's square). */
export function stampedPicture(contentType: string | null | undefined, stamped: string | null | undefined) {
  return contentType?.startsWith("image/") && stamped ? stamped : null;
}

/** A file sent with only its address: itself when its name says photograph, else its type's square. */
export function pictureByName(name: string, url: string | null | undefined) {
  return url && IMAGE_NAME.test(name) ? url : null;
}
