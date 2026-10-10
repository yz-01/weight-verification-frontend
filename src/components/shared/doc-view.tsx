"use client";

/**
 * A Word `.docx` read in the page (`lib/docx-preview.ts`): its text, tables
 * and pictures, drawn as React elements - nothing in the file runs here.
 * Layout is Word's job; this says so in one line and the download is the
 * file itself.
 */

import { FileWarning, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { readDocument, type DocBlock, type DocInline, type DocPreview } from "@/lib/docx-preview";
import { cn } from "@/lib/utils";

const HEADING_CLASS = {
  1: "text-xl font-semibold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
} as const;

const ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
} as const;

function Inline({ inline, images }: { inline: DocInline; images: Record<string, string> }): ReactNode {
  if (inline.type === "break") return <br />;
  if (inline.type === "image") {
    const src = images[inline.image];
    // eslint-disable-next-line @next/next/no-img-element -- a blob: URL read from the file itself.
    return src ? <img src={src} alt="" className="my-1 inline-block h-auto max-w-full" /> : null;
  }
  const { run } = inline;
  return (
    <span
      className={cn(
        "whitespace-pre-wrap",
        run.bold && "font-semibold",
        run.italic && "italic",
        run.underline && "underline",
        run.strike && "line-through",
      )}
    >
      {run.text}
    </span>
  );
}

function Blocks({ blocks, images }: { blocks: DocBlock[]; images: Record<string, string> }): ReactNode {
  return blocks.map((block, index) => {
    if (block.type === "table") {
      return (
        <div key={index} className="my-2 rounded-md border">
          <Table>
            <TableBody>
              {block.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      className={cn("border-r align-top whitespace-normal last:border-r-0", cell.merged && "border-t-0")}
                    >
                      <Blocks blocks={cell.blocks} images={images} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }
    const content = block.inlines.map((inline, inlineIndex) => (
      <Inline key={inlineIndex} inline={inline} images={images} />
    ));
    const empty = block.inlines.length === 0;
    return (
      <p
        key={index}
        className={cn(
          "min-h-[1em] leading-relaxed",
          block.heading ? cn("mt-3 mb-1", HEADING_CLASS[block.heading]) : "my-1 text-sm",
          ALIGN_CLASS[block.align],
          block.list && "relative pl-5",
        )}
      >
        {block.list && !empty ? (
          <span aria-hidden className="absolute left-1 text-muted-foreground">
            •
          </span>
        ) : null}
        {content}
      </p>
    );
  });
}

/** The pictures of a read document as object URLs, released with it. */
function useImageUrls(read: DocPreview | null): Record<string, string> {
  const urls = useMemo(() => {
    const made: Record<string, string> = {};
    if (!read) return made;
    for (const [key, image] of Object.entries(read.images)) {
      made[key] = URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.type }));
    }
    return made;
  }, [read]);
  useEffect(
    () => () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return urls;
}

export function DocView({ file }: { file: Blob }) {
  const t = useTranslations("filePreview");
  const [read, setRead] = useState<DocPreview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    readDocument(file)
      .then((result) => alive && setRead(result))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);
  const images = useImageUrls(read);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileWarning className="size-8 text-warning" />
        <p className="max-w-md text-sm text-foreground">{t("wordFailed")}</p>
      </div>
    );
  }
  if (!read) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <p className="shrink-0 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {read.truncated ? `${t("wordTruncated")} ` : ""}
        {t("wordNote")}
      </p>
      <div className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto max-w-3xl bg-card px-6 py-5 text-foreground sm:px-10">
          {read.blocks.length ? (
            <Blocks blocks={read.blocks} images={images} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("wordEmpty")}</p>
          )}
        </article>
      </div>
    </div>
  );
}
