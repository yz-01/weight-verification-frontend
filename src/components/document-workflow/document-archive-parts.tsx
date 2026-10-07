"use client";

/**
 * Pieces of the document archive screen (B6, D5).
 *
 * - `DocumentCategoryPicker`: the one category filter. A dropdown whose
 *   categories open to show their subcategories, so choosing either sets
 *   category + subcategory together (X16). It replaces both the two selects
 *   and the left folder tree.
 * - `DocumentThumb`: the table's thumbnail. A photograph shows itself in
 *   small; a PDF, Word or Excel file shows its type. A tap opens the
 *   document's existing preview.
 * - `DOCUMENT_FILE_ACCEPT`: what the upload pickers offer, the same list the
 *   server accepts (`ALLOWED_DOCUMENT_EXTENSIONS`).
 */

import {
  ChevronDown,
  ChevronRight,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  DocumentCategory,
  DocumentSubcategory,
  DocumentSystemFileInfo,
  DocumentVersion,
} from "@/interfaces/document-workflow";
import { cn } from "@/lib/utils";
import { documentVersionThumbnailUrl } from "@/services/document-workflow.service";

/** The upload pickers' `accept`: PDF, Word, Excel and photographs (B6). */
export const DOCUMENT_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,image/*";

/**
 * What the category filter's button says: the subcategory as a path, the
 * category alone, or "all" when nothing is chosen (or the choice is gone).
 */
export function categoryPickerLabel(
  categories: DocumentCategory[],
  subcategories: DocumentSubcategory[],
  category: string | undefined,
  subcategory: string | undefined,
  allLabel: string,
): string {
  const parent = categories.find((item) => item.id === category);
  if (!parent) return allLabel;
  const child = subcategories.find(
    (item) => item.id === subcategory && item.category === parent.id,
  );
  return child ? `${parent.name} / ${child.name}` : parent.name;
}

export function DocumentCategoryPicker({
  categories,
  subcategories,
  category,
  subcategory,
  onChange,
}: {
  categories: DocumentCategory[];
  subcategories: DocumentSubcategory[];
  category: string | undefined;
  subcategory: string | undefined;
  onChange: (category: string | undefined, subcategory: string | undefined) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // Which categories show their subcategories; the chosen one starts open.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(category ? [category] : []),
  );
  const label = categoryPickerLabel(
    categories,
    subcategories,
    category,
    subcategory,
    t("documents.allCategories"),
  );
  const choose = (nextCategory: string | undefined, nextSubcategory: string | undefined) => {
    onChange(nextCategory, nextSubcategory);
    setOpen(false);
  };
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const row = (active: boolean) =>
    cn(
      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
      active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted",
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-[220px] justify-between bg-card font-normal"
          aria-label={t("documents.field.category")}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate" title={label}>
              {label}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[60dvh] w-72 gap-0.5 overflow-y-auto p-1.5">
        <div className="flex items-center">
          <span className="w-7 shrink-0" />
          <button type="button" className={row(!category)} onClick={() => choose(undefined, undefined)}>
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("documents.allCategories")}</span>
          </button>
        </div>
        {categories.map((folder) => {
          const children = subcategories.filter((child) => child.category === folder.id);
          const isOpen = expanded.has(folder.id);
          return (
            <div key={folder.id}>
              <div className="flex items-center">
                {children.length > 0 ? (
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    aria-expanded={isOpen}
                    aria-label={t(
                      isOpen ? "documents.categoryPicker.collapse" : "documents.categoryPicker.expand",
                      { name: folder.name },
                    )}
                    onClick={() => toggle(folder.id)}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="w-7 shrink-0" />
                )}
                <button
                  type="button"
                  className={row(category === folder.id && !subcategory)}
                  onClick={() => choose(folder.id, undefined)}
                >
                  {isOpen ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                  <span className={cn("min-w-0 flex-1 truncate", !folder.is_active && "text-muted-foreground")}>
                    {folder.name}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{folder.record_count ?? 0}</span>
                </button>
              </div>
              {isOpen &&
                children.map((child) => (
                  <div key={child.id} className="flex items-center pl-7">
                    <button
                      type="button"
                      className={cn(row(subcategory === child.id), "ml-2 border-l pl-3")}
                      onClick={() => choose(folder.id, child.id)}
                    >
                      <span className={cn("min-w-0 flex-1 truncate", !child.is_active && "text-muted-foreground")}>
                        {child.name}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{child.record_count ?? 0}</span>
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export type ThumbnailKind = "image" | "photo" | "pdf" | "word" | "excel" | "file" | "none";

const PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tif", "tiff"]);

/**
 * Photographs above this size show their type icon instead of themselves: a
 * thumbnail is drawn from the whole file (E3 will bring real thumbnails), and
 * a page of large scans should not download tens of megabytes to draw icons.
 */
export const THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * How a version is drawn in the table. `image` only when the server says the
 * browser can show it (`preview_type`) and it is small enough to fetch; any
 * other photograph - a HEIC browsers cannot draw, a very large scan - is
 * `photo`, the image icon.
 */
export function thumbnailKind(version: DocumentVersion | null | undefined): ThumbnailKind {
  if (!version) return "none";
  if (version.preview_type?.startsWith("image/") && version.byte_size <= THUMBNAIL_MAX_BYTES) {
    return "image";
  }
  return fileKindOf(version.original_name);
}

/** What a file is by its name: the icon a file that is not drawn gets. */
export function fileKindOf(name: string): Exclude<ThumbnailKind, "image" | "none"> {
  const extension = extensionOf(name);
  if (PHOTO_EXTENSIONS.has(extension)) return "photo";
  if (extension === "pdf") return "pdf";
  if (extension === "doc" || extension === "docx") return "word";
  if (extension === "xls" || extension === "xlsx") return "excel";
  return "file";
}

const KIND_ICON = {
  image: FileImage,
  photo: FileImage,
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  file: File,
  none: File,
} as const;

const KIND_TONE = {
  image: "text-muted-foreground",
  photo: "text-muted-foreground",
  pdf: "text-destructive",
  word: "text-primary",
  excel: "text-success",
  file: "text-muted-foreground",
  none: "text-muted-foreground/50",
} as const;

/** A file's type icon and extension, for a file that is not drawn. */
export function DocumentFileIcon({ name }: { name: string }) {
  const kind = fileKindOf(name);
  const Icon = KIND_ICON[kind];
  const extension = extensionOf(name).toUpperCase();
  return (
    <span className="flex flex-col items-center justify-center" data-file-kind={kind}>
      <Icon className={cn("h-5 w-5", KIND_TONE[kind])} />
      {extension && (
        <span className="mt-0.5 text-[9px] font-semibold leading-none text-muted-foreground">{extension}</span>
      )}
    </span>
  );
}

export function DocumentThumb({
  version,
  systemFile,
  onOpen,
}: {
  version: DocumentVersion | null;
  /** E4: a file picked from the system brings its own watermarked thumbnail. */
  systemFile?: DocumentSystemFileInfo | null;
  onOpen: () => void;
}) {
  const t = useTranslations();
  const kind: ThumbnailKind = systemFile
    ? systemFile.thumbnail_url
      ? "image"
      : fileKindOf(systemFile.file_name)
    : thumbnailKind(version);
  const versionId = systemFile ? undefined : version?.id;
  const button = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "image" || !versionId) return;
    let alive = true;
    let made: string | null = null;
    const load = () => {
      documentVersionThumbnailUrl(versionId)
        .then((objectUrl) => {
          made = objectUrl;
          if (alive) setUrl(objectUrl);
          else URL.revokeObjectURL(objectUrl);
        })
        // A photo that cannot be fetched keeps its icon; the preview it
        // opens says what went wrong.
        .catch(() => undefined);
    };
    // Only rows scrolled into view fetch their photo.
    const node = button.current;
    let observer: IntersectionObserver | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            load();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(node);
    } else {
      load();
    }
    return () => {
      alive = false;
      observer?.disconnect();
      if (made) URL.revokeObjectURL(made);
    };
  }, [kind, versionId]);

  const Icon = KIND_ICON[kind];
  const fileName = systemFile?.file_name ?? version?.original_name ?? "";
  const extension = extensionOf(fileName).toUpperCase();
  const shown = systemFile?.thumbnail_url ?? url;
  return (
    <button
      ref={button}
      type="button"
      className="flex h-10 w-10 shrink-0 flex-col items-center justify-center overflow-hidden rounded-md border bg-muted/40 transition-colors hover:border-primary/50"
      title={fileName ? `${t("filePreview.preview")} · ${fileName}` : t("documents.noFile")}
      aria-label={fileName ? `${t("filePreview.preview")} · ${fileName}` : t("documents.noFile")}
      data-thumbnail={kind}
      onClick={onOpen}
    >
      {kind === "image" && shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL fetched with the session, or the server's watermarked copy; next/image cannot load either.
        <img src={shown} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <Icon className={cn("h-4 w-4", KIND_TONE[kind])} />
          {extension && (
            <span className="mt-0.5 max-w-full truncate px-0.5 text-[9px] font-semibold leading-none text-muted-foreground">
              {extension}
            </span>
          )}
        </>
      )}
    </button>
  );
}
