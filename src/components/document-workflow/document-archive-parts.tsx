"use client";

/**
 * Pieces of the document archive screen (B6, D5).
 *
 * - `DocumentCategoryPicker`: the one category filter. A dropdown whose
 *   categories open to show their subcategories, so choosing either sets
 *   category + subcategory together (X16). It replaces both the two selects
 *   and the left folder tree.
 * - `DocumentThumb`: the table's thumbnail. A photograph shows itself in
 *   small; a PDF shows its first page (made once by the server, 2026-10-10),
 *   and so does a Word or Excel file that carries Office's saved preview;
 *   anything else shows its type. A tap opens the document's preview.
 * - `DOCUMENT_FILE_ACCEPT`: what the upload pickers offer, the same list the
 *   server accepts (`ALLOWED_DOCUMENT_EXTENSIONS`).
 * - `inUseOn` / `subcategoryInUseOn` / `scopeBadge`: which project a category
 *   or sub-category is in use on, and how its row says so (JB146).
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
  DocumentTaxonomyScope,
  DocumentTaxonomyScopePayload,
  DocumentVersion,
} from "@/interfaces/document-workflow";
import type { Project } from "@/interfaces/contractor";
import { cn } from "@/lib/utils";
import { documentVersionThumbnailUrl } from "@/services/document-workflow.service";

/** The upload pickers' `accept`: PDF, Word, Excel and photographs (B6). */
export const DOCUMENT_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,image/*";

/**
 * Whether a category or sub-category is offered for a document on
 * `projectId` (JB146, 客户 11-10 事项 4 第 2、3 点): a project's own row on that
 * project only, head office's on every project or on the ones assigned to
 * it. A company-wide document (`null`) takes head office's rows only. The
 * server decides it the same way (`DocumentTaxonomyScope.in_use_on`).
 */
export function inUseOn(row: DocumentTaxonomyScope, projectId: string | null): boolean {
  if (!projectId) return row.project === null;
  if (row.project !== null) return row.project === projectId;
  return row.all_projects || row.assigned_projects.includes(projectId);
}

/** A sub-category is in use only where its category is too. */
export function subcategoryInUseOn(
  row: DocumentSubcategory,
  categories: DocumentCategory[],
  projectId: string | null,
): boolean {
  const parent = categories.find((item) => item.id === row.category);
  return parent !== undefined && inUseOn(row, projectId) && inUseOn(parent, projectId);
}

/**
 * The badge on a row of 文档分类 (JB146): 总部·全部项目, 总部·N 个项目, 本项目
 * (the top bar's project), or the project's name when another one's row is
 * listed (head office on 全部项目). `key` is under
 * `documents.taxonomy.scope.badge`.
 */
export function scopeBadge(
  row: DocumentTaxonomyScope,
  currentProjectId: string,
): { key: "all" | "chosen" | "here" | "project"; values: Record<string, string | number> } {
  if (row.project !== null) {
    return row.project === currentProjectId
      ? { key: "here", values: {} }
      : { key: "project", values: { project: row.project_name ?? "" } };
  }
  return row.all_projects
    ? { key: "all", values: {} }
    : { key: "chosen", values: { count: row.assigned_projects.length } };
}

/** Who is setting categories up, and on which project (JB146). */
export interface TaxonomyScopeContext {
  /** Holds `project.view_all`: makes head office's rows, and any project's. */
  headOffice: boolean;
  /** The top bar's project; "" on 全部项目. */
  currentProjectId: string;
  /** The projects the reader can see, for the choices. */
  projects: Pick<Project, "id" | "code" | "name">[];
}

/** 总部 · 全部项目 / 总部 · 指定项目 / 只属于一个项目. */
export type TaxonomyScopeChoice = "ALL" | "CHOSEN" | "PROJECT";

export interface TaxonomyScopeState {
  choice: TaxonomyScopeChoice;
  /** 指定项目: the projects ticked. */
  chosen: string[];
  /** 只属于一个项目: which one. */
  project: string;
}

/**
 * Where a row in the category form starts. An existing row as it is. A new
 * one by head office: every project on 全部项目, the top bar's project when
 * one is chosen. A new one by a project account: its project - the top
 * bar's, or its only one; with several and 全部项目 the form asks
 * (客户 11-10 事项 4 第 2 点).
 */
export function initialTaxonomyScope(
  row: DocumentTaxonomyScope | null,
  context: TaxonomyScopeContext,
): TaxonomyScopeState {
  if (row) {
    if (row.project !== null) return { choice: "PROJECT", chosen: [], project: row.project };
    return { choice: row.all_projects ? "ALL" : "CHOSEN", chosen: row.assigned_projects, project: "" };
  }
  if (context.headOffice) {
    return context.currentProjectId
      ? { choice: "CHOSEN", chosen: [context.currentProjectId], project: context.currentProjectId }
      : { choice: "ALL", chosen: [], project: "" };
  }
  const only = context.projects.length === 1 ? context.projects[0].id : "";
  return { choice: "PROJECT", chosen: [], project: context.currentProjectId || only };
}

/**
 * The 适用范围 choices the form offers: head office only, and never one that
 * moves a row to another owner (a project's own row stays that project's).
 */
export function taxonomyScopeChoices(
  row: DocumentTaxonomyScope | null,
  context: TaxonomyScopeContext,
): TaxonomyScopeChoice[] {
  if (!context.headOffice) return [];
  if (row) return row.project === null ? ["ALL", "CHOSEN"] : [];
  return ["ALL", "CHOSEN", "PROJECT"];
}

/** Whether the form asks which project a new row of one project is for. */
export function asksForProject(
  row: DocumentTaxonomyScope | null,
  context: TaxonomyScopeContext,
  state: TaxonomyScopeState,
): boolean {
  if (row || state.choice !== "PROJECT") return false;
  if (context.headOffice) return true;
  return !context.currentProjectId && context.projects.length !== 1;
}

/** What a save sends about where the row is in use: only what may change. */
export function taxonomyScopePayload(
  row: DocumentTaxonomyScope | null,
  context: TaxonomyScopeContext,
  state: TaxonomyScopeState,
): DocumentTaxonomyScopePayload {
  if (row) {
    if (row.project !== null || !context.headOffice) return {};
    return state.choice === "ALL"
      ? { all_projects: true }
      : { all_projects: false, assigned_projects: state.chosen };
  }
  if (state.choice === "PROJECT") return { project: state.project || null };
  return state.choice === "ALL"
    ? { project: null, all_projects: true }
    : { project: null, all_projects: false, assigned_projects: state.chosen };
}

/**
 * The project a new sub-category's category has to be in use on: its own
 * project; `null` for head office's, which goes under head office's
 * categories; undefined while no project is chosen yet.
 */
export function taxonomyScopeProject(state: TaxonomyScopeState): string | null | undefined {
  if (state.choice === "PROJECT") return state.project || undefined;
  return null;
}

/**
 * The categories a sub-category may sit under (JB146): a project's own
 * under a category in use on that project, head office's under head
 * office's; an existing one under the category it has, which never changes.
 */
export function parentCategoryOptions(
  categories: DocumentCategory[],
  subcategory: DocumentSubcategory | null,
  state: TaxonomyScopeState,
): DocumentCategory[] {
  if (subcategory) return categories.filter((item) => item.id === subcategory.category);
  const placement = taxonomyScopeProject(state);
  return categories.filter(
    (item) => item.is_active && (placement === undefined || inUseOn(item, placement)),
  );
}

/** Where an upload of several files into one document stands. */
export interface UploadBatch {
  files: File[];
  /** The first this many of `files` are in the document already. */
  done: number;
  /** The document the first file made; null until then. */
  createdId: string | null;
}

/**
 * The batch after the picker changes its files.
 *
 * Before anything was sent, or once every file was in, a new choice is a new
 * document. Part-way through (a file failed), the document stays: the files
 * already in it go first and count as done, a file added joins the same
 * document, and taking one off only leaves it out of what is still to send.
 * Starting again there filed the files already sent a second time.
 */
export function nextUploadBatch(batch: UploadBatch, next: File[]): UploadBatch {
  const complete = batch.done >= batch.files.length && batch.files.length > 0;
  if (batch.createdId === null || complete) {
    return { files: next, done: 0, createdId: null };
  }
  const sent = batch.files.slice(0, batch.done);
  const keptSent = sent.filter((file) => next.includes(file));
  const rest = next.filter((file) => !sent.includes(file));
  return { files: [...keptSent, ...rest], done: keptSent.length, createdId: batch.createdId };
}

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
          className="w-full justify-between bg-card font-normal sm:w-55"
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
        <span className="mt-0.5 text-2xs font-semibold leading-none text-muted-foreground">{extension}</span>
      )}
    </span>
  );
}

export function DocumentThumb({
  version,
  systemFile,
  coverUrl,
  onOpen,
}: {
  version: DocumentVersion | null;
  /** E4: a file picked from the system brings its own watermarked thumbnail. */
  systemFile?: DocumentSystemFileInfo | null;
  /** E3: the list row's small stamped copy, when the document is a photograph. */
  coverUrl?: string | null;
  onOpen: () => void;
}) {
  const t = useTranslations();
  // The server's first-page picture of an uploaded PDF; dropped for the
  // type icon if it cannot be loaded.
  const [pageFailed, setPageFailed] = useState(false);
  const firstPage = !systemFile && !pageFailed ? (version?.thumbnail_url ?? null) : null;
  const kind: ThumbnailKind = systemFile
    ? coverUrl || systemFile.thumbnail_url
      ? "image"
      : fileKindOf(systemFile.file_name)
    : firstPage
      ? "image"
      : thumbnailKind(version);
  // Only a photograph without a server picture is fetched whole.
  const versionId = systemFile || firstPage ? undefined : version?.id;
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
  const shown = coverUrl || systemFile?.thumbnail_url || firstPage || url;
  // A document's first page is shown whole, from its top; a photo fills the square.
  const isPage = Boolean(firstPage) || Boolean(systemFile && systemFile.kind !== "PHOTO" && !coverUrl);
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
        <img
          loading="lazy"
          decoding="async"
          src={shown}
          alt=""
          className={cn("h-full w-full", isPage ? "bg-card object-contain object-top" : "object-cover")}
          onError={firstPage ? () => setPageFailed(true) : undefined}
        />
      ) : (
        <>
          <Icon className={cn("h-4 w-4", KIND_TONE[kind])} />
          {extension && (
            <span className="mt-0.5 max-w-full truncate px-0.5 text-2xs font-semibold leading-none text-muted-foreground">
              {extension}
            </span>
          )}
        </>
      )}
    </button>
  );
}
