"use client";

/**
 * 「从系统里选」: find files already in the system and file them here (E4, Q23).
 *
 * Search (record number - short `RC-005` or full -, what the record is, file
 * name) and filters (module, project, dates) over a grid of thumbnails. A tap
 * ticks a file; dragging a thumbnail onto the archive area on the right ticks
 * it too. The server returns only files the reader could already open, and
 * filing them stores references, not copies.
 */

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, FolderInput, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DocumentFileIcon } from "@/components/document-workflow/document-archive-parts";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/interfaces/contractor";
import type { DocumentSystemFileInfo, SystemFile } from "@/interfaces/document-workflow";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { searchSystemFiles } from "@/services/document-workflow.service";

/**
 * The module filter, in the server's order (`system_files.MODULES`), each
 * named by its own menu entry so a module has one name everywhere.
 */
export const SYSTEM_FILE_MODULES: Record<string, string> = {
  MATERIAL_RECEIPT: "nav.material_receipts",
  MATERIAL_OUTGOING: "nav.material_outgoing",
  EQUIPMENT: "nav.equipment",
  HAZARD: "nav.hazard_rectification",
  PROGRESS: "nav.progress",
  DISPOSAL: "nav.site_disposals",
  WASTE_OUTGOING: "nav.waste_outgoing",
  FIELD_TASK: "nav.field_tasks",
  MATERIAL_REQUEST: "nav.material_requests",
  SUNDRY_CLAIM: "nav.submodule.sundryClaims",
  // 顾问申请附件 (E4): only the applications the reader can open.
  CONSULTANT_APPLICATION: "nav.consultant_applications",
};

/** The drag payload's type: only a thumbnail from this picker drops here. */
export const SYSTEM_FILE_DRAG_TYPE = "application/x-mse-system-file";

const PAGE_SIZE = 24;

/** 「来自 RC-005 · 材料进场」 - where a system file came from. */
export function useSourceLabel() {
  const t = useTranslations();
  return (source: Pick<DocumentSystemFileInfo, "module" | "record">) => {
    const key = SYSTEM_FILE_MODULES[source.module];
    const moduleName = key ? t(key) : "";
    return source.record.reference
      ? t("documents.source.from", { reference: source.record.reference, module: moduleName })
      : t("documents.source.fromModule", { module: moduleName });
  };
}

/**
 * Add the dropped file to the selection; anything else dropped is ignored.
 * Exported for the component test - the runner has no DOM to drag in.
 */
export function droppedSelection(
  current: Record<string, SystemFile>,
  rows: SystemFile[],
  droppedId: string,
): Record<string, SystemFile> {
  const row = rows.find((item) => item.id === droppedId);
  if (!row || current[row.id]) return current;
  return { ...current, [row.id]: row };
}

export function SystemFilePicker({
  projects,
  initialProject,
  selected,
  onSelectedChange,
}: {
  projects: Project[];
  /** The page's project; the picker starts there (Q23: 默认当前项目). */
  initialProject?: string;
  selected: Record<string, SystemFile>;
  onSelectedChange: (next: Record<string, SystemFile>) => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const sourceLabel = useSourceLabel();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [project, setProject] = useState(initialProject ?? "all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [dragOver, setDragOver] = useState(false);

  const query = {
    page,
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
    module: moduleFilter === "all" ? undefined : moduleFilter,
    project: project === "all" ? undefined : project,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };
  const files = useQuery({
    queryKey: ["documents", "system-files", query],
    queryFn: () => searchSystemFiles(query),
  });
  const rows = files.data?.results ?? [];
  const totalPages = files.data?.total_pages ?? 1;
  const chosen = Object.values(selected);

  const toggle = (row: SystemFile) => {
    const next = { ...selected };
    if (next[row.id]) delete next[row.id];
    else next[row.id] = row;
    onSelectedChange(next);
  };
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 min-w-45 flex-1 bg-card"
            value={search}
            placeholder={t("documents.pickFromSystem.searchPlaceholder")}
            aria-label={t("documents.pickFromSystem.searchPlaceholder")}
            onChange={(event) => filter(() => setSearch(event.target.value))}
          />
          <Select value={moduleFilter} onValueChange={(value) => filter(() => setModuleFilter(value))}>
            <SelectTrigger size="sm" className="h-9 w-40 bg-card" aria-label={t("documents.pickFromSystem.module")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documents.pickFromSystem.allModules")}</SelectItem>
              {Object.entries(SYSTEM_FILE_MODULES).map(([value, key]) => (
                <SelectItem key={value} value={value}>
                  {t(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={project} onValueChange={(value) => filter(() => setProject(value))}>
            <SelectTrigger size="sm" className="h-9 w-42.5 bg-card" aria-label={t("documents.field.project")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documents.allProjects")}</SelectItem>
              {projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-9 w-36.25 bg-card"
            aria-label={t("documents.field.dateFrom")}
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => filter(() => setDateFrom(event.target.value))}
          />
          <Input
            type="date"
            className="h-9 w-36.25 bg-card"
            aria-label={t("documents.field.dateTo")}
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => filter(() => setDateTo(event.target.value))}
          />
        </div>
        <QueryFailedNote query={files} what={t("documents.pickFromSystem.what")} />

        {files.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 && !files.isError ? (
          <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            {t("documents.pickFromSystem.empty")}
          </p>
        ) : (
          <ul className="grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
            {rows.map((row) => {
              const ticked = Boolean(selected[row.id]);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    draggable
                    data-system-file={row.id}
                    aria-pressed={ticked}
                    title={`${row.file_name} · ${sourceLabel(row)}`}
                    className={cn(
                      "group relative flex w-full flex-col overflow-hidden rounded-md border bg-card text-left transition-colors",
                      ticked ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50",
                    )}
                    onClick={() => toggle(row)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(SYSTEM_FILE_DRAG_TYPE, row.id);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <span className="flex aspect-[4/3] w-full items-center justify-center bg-muted/40">
                      {row.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the server's watermarked copy; sizes vary per file.
                        <img src={row.thumbnail_url} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <DocumentFileIcon name={row.file_name} />
                      )}
                    </span>
                    {ticked && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 space-y-0.5 p-1.5">
                      <span className="block truncate text-xs font-medium text-foreground">{sourceLabel(row)}</span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {[row.project_name, row.uploaded_by_name, df.date(row.captured_at)].filter(Boolean).join(" · ")}
                      </span>
                      {row.filed && (
                        <span className="block truncate text-2xs text-warning">{t("documents.pickFromSystem.alreadyFiled")}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="icon-sm"
              title={t("documents.pickFromSystem.previous")}
              disabled={page <= 1}
              disabledReason={t("documents.pickFromSystem.firstPage")}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              title={t("documents.pickFromSystem.next")}
              disabled={page >= totalPages}
              disabledReason={t("documents.pickFromSystem.lastPage")}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* The archive area: tick a file, or drag its thumbnail here. */}
      <section
        aria-label={t("documents.pickFromSystem.dropArea")}
        data-drop-area
        className={cn(
          "flex min-h-40 flex-col gap-2 rounded-md border-2 border-dashed p-2 transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        )}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(SYSTEM_FILE_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const id = event.dataTransfer.getData(SYSTEM_FILE_DRAG_TYPE);
          if (id) onSelectedChange(droppedSelection(selected, rows, id));
        }}
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <FolderInput className="h-4 w-4 text-muted-foreground" />
          {t("documents.pickFromSystem.selected", { count: chosen.length })}
        </p>
        {chosen.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">
            {t("documents.pickFromSystem.dropHint")}
          </p>
        ) : (
          <ul className="max-h-[40dvh] space-y-1 overflow-y-auto">
            {chosen.map((row) => (
              <li key={row.id} className="flex items-center gap-1.5 rounded bg-muted/50 px-1.5 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate" title={row.file_name}>
                  {sourceLabel(row)}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("documents.pickFromSystem.remove", { name: row.file_name })}
                  onClick={() => toggle(row)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
