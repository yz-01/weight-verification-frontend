"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  ChevronRight,
  Download,
  Eye,
  FilePlus2,
  Folder,
  FolderCog,
  FolderInput,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import {
  SystemFilePicker,
  useSourceLabel,
} from "@/components/document-workflow/system-file-picker";
import { useRecordOpener } from "@/components/shared/record-opener";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FilePreview } from "@/components/shared/file-preview";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { ApiError } from "@/interfaces/api";
import type { Requirement } from "@/lib/missing-fields";
import type { Project } from "@/interfaces/contractor";
import type {
  DocumentCategory,
  DocumentCategoryPayload,
  DocumentDetail,
  DocumentPayload,
  DocumentRecord,
  DocumentSubcategory,
  DocumentSubcategoryPayload,
  DocumentSystemFileInfo,
  DocumentVersion,
  SystemFile,
} from "@/interfaces/document-workflow";
import { useDateFormat } from "@/lib/dates";
import { toastSuccess } from "@/services/api-client";
import { getProjects } from "@/services/contractor.service";
import { getUsers } from "@/services/users.service";
import {
  addSystemFiles,
  archiveDocument,
  attachSystemFiles,
  createDocumentCategory,
  createDocumentSubcategory,
  deleteDocumentCategory,
  documentVersionObjectUrl,
  downloadDocumentVersion,
  downloadSystemFile,
  getDocument,
  getDocumentCategories,
  getDocuments,
  getDocumentSubcategories,
  systemFileObjectUrl,
  updateDocument,
  updateDocumentCategory,
  updateDocumentSubcategory,
  uploadDocument,
  uploadDocumentVersion,
} from "@/services/document-workflow.service";
import {
  DOCUMENT_FILE_ACCEPT,
  DocumentCategoryPicker,
  DocumentThumb,
} from "@/components/document-workflow/document-archive-parts";
import { cn } from "@/lib/utils";

export function Documents() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const searchParams = useSearchParams();
  const list = useListQuery([
    "status",
    "project",
    "category",
    "subcategory",
    "date_from",
    "date_to",
    "uploaded_by",
  ]);
  // A row of the report centre's 项目资料 preview links to `?document=<id>`.
  const [viewingId, setViewingId] = useUrlSelection("document");
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  // Uploading is for everybody who reads the archive and is on the project
  // (B28, E10); filing company-wide and editing stay with the manager.
  const canUpload = can("document.view") || can("document.manage");
  const manages = can("document.manage");
  const [filing, setFiling] = useState(searchParams.get("create") === "1" && canUpload);
  const [uploading, setUploading] = useState<DocumentRecord | null>(null);
  const [archiving, setArchiving] = useState<DocumentRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  // E4: a system file's source tag opens the record it came from (F9 routes).
  const opener = useRecordOpener();

  // On the top bar's 「当前项目」 (B13) the archive shows that project's files
  // and the company-wide ones, which belong to every project.
  const topBar = useCurrentProject();
  const documentsQuery =
    topBar.active && list.filters.project
      ? { ...list.query, with_company: "1" }
      : list.query;
  const documents = useQuery({
    queryKey: ["documents", documentsQuery],
    queryFn: () => getDocuments(documentsQuery),
  });
  const categories = useQuery({
    queryKey: ["documents", "categories"],
    queryFn: () =>
      getDocumentCategories({ page_size: 100, sort_by: "name", sort_order: "asc" }),
  });
  const subcategories = useQuery({
    queryKey: ["documents", "subcategories"],
    queryFn: () =>
      getDocumentSubcategories({
        page_size: 100,
        sort_by: "name",
        sort_order: "asc",
      }),
  });
  const projects = useQuery({
    queryKey: ["projects", "document-options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    enabled: can("project.view"),
  });
  const users = useQuery({
    queryKey: ["users", "document-archive-options"],
    queryFn: () => getUsers({ page_size: 500, status: "ACTIVE", sort_by: "full_name", sort_order: "asc" }),
    enabled: can("document.view"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const archiveMutation = useMutation({
    mutationFn: (record: DocumentRecord) =>
      archiveDocument(record.id, archiveReason.trim()),
    onSuccess: () => {
      setArchiving(null);
      setArchiveReason("");
      refresh();
    },
  });

  const columns = useMemo<ColumnDef<DocumentRecord, unknown>[]>(
    () => [
      {
        accessorKey: "document_no",
        meta: { label: t("documents.field.number") },
        header: ({ column }) => (
          <SortableHeader
            label={t("documents.field.number")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium tabular-nums text-foreground">
              {row.original.document_no}
            </p>
            <p className="max-w-45 truncate text-xs text-muted-foreground">
              {row.original.reference_no || t("common.emptyValue")}
            </p>
          </div>
        ),
      },
      {
        // D5: a photo shows itself in small, any other file its type; a tap
        // opens the same preview as the eye button.
        id: "thumbnail",
        enableSorting: false,
        meta: { label: t("documents.field.thumbnail") },
        header: () => <span className="sr-only">{t("documents.field.thumbnail")}</span>,
        cell: ({ row }) => (
          <DocumentThumb
            version={row.original.latest_version}
            systemFile={row.original.system_file}
            coverUrl={row.original.cover_photo_url}
            onOpen={() => setViewingId(row.original.id)}
          />
        ),
      },
      {
        accessorKey: "title",
        meta: { label: t("documents.field.title") },
        header: ({ column }) => (
          <SortableHeader
            label={t("documents.field.title")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className="max-w-65 truncate font-medium text-foreground"
              title={row.original.title}
            >
              {row.original.title}
            </p>
            {row.original.system_file ? (
              <SourceTag
                source={row.original.system_file}
                onOpen={() => openSource(row.original)}
                more={(row.original.file_count ?? 1) - 1}
              />
            ) : (
              <p className="max-w-65 truncate text-xs text-muted-foreground">
                {row.original.latest_version?.original_name ??
                  t("documents.noFile")}
              </p>
            )}
          </div>
        ),
      },
      {
        // Where it is filed, as one path (B28): 「显示路径」.
        id: "category",
        meta: { label: t("documents.field.path") },
        header: () => t("documents.field.path"),
        cell: ({ row }) => (
          <p
            className="flex max-w-60 min-w-0 items-center gap-1 text-sm"
            title={[row.original.category_name, row.original.subcategory_name].filter(Boolean).join(" / ")}
          >
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.original.category_name}</span>
            {row.original.subcategory_name ? (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{row.original.subcategory_name}</span>
              </>
            ) : null}
          </p>
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("documents.field.project") },
        header: () => t("documents.field.project"),
        cell: ({ row }) =>
          row.original.project_name || t("documents.companyWide"),
      },
      {
        accessorKey: "created_by_name",
        meta: { label: t("documents.field.uploadedBy") },
        header: () => t("documents.field.uploadedBy"),
        cell: ({ row }) => row.original.created_by_name || t("common.emptyValue"),
      },
      {
        accessorKey: "status",
        meta: { label: t("documents.field.status") },
        header: ({ column }) => (
          <SortableHeader
            label={t("documents.field.status")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`documents.status.${row.original.status}`)}
            tone={row.original.status === "ACTIVE" ? "positive" : "neutral"}
          />
        ),
      },
      {
        // Every file the document holds - picked from the system or uploaded
        // (2026-10-10: files picked together are one document).
        id: "version_count",
        meta: { label: t("documents.field.files") },
        header: () => t("documents.field.files"),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.file_count ?? row.original.version_count ?? 0)} />
        ),
      },
      {
        accessorKey: "created_at",
        meta: { label: t("documents.field.createdAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("documents.field.createdAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {df.dateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => {
          const record = row.original;
          const active = record.status === "ACTIVE";
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("common.view")}
                onClick={() => setViewingId(record.id)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {/* Add a file (a new version, or more files) to any document -
                  uploaded or picked from the system alike (2026-10-10 图3).
                  Anybody on the project; a company-wide document only from
                  the manager (the server says the same), so it is greyed
                  with the reason rather than missing. */}
              {active && canUpload && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t("documents.upload.action")}
                  disabled={!manages && !record.project}
                  disabledReason={
                    !manages && !record.project
                      ? t("documents.upload.companyWideManagerOnly")
                      : undefined
                  }
                  onClick={() => setUploading(record)}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              )}
              {manages && active && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t("common.edit")}
                  onClick={() => setEditing(record)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {can("document.archive") && active && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-warning hover:bg-warning/10"
                  title={t("documents.archive.action")}
                  onClick={() => setArchiving(record)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openSource reads the opener, which is stable per render of this page.
    [can, canUpload, df, manages, t],
  );

  function openSource(record: DocumentRecord, file?: DocumentSystemFileInfo) {
    const source = file ?? record.system_file;
    if (!source) return;
    opener.open(source.record.kind, source.record.id, {
      reference: source.record.reference,
      project_id: record.project,
      project_name: record.project_name ?? "",
      submitted_at: source.captured_at,
      photo: source.thumbnail_url,
    });
  }

  const rows = documents.data?.results ?? [];
  const totalCount = documents.data?.count ?? 0;
  const categoryRows = categories.data?.results ?? [];
  const subcategoryRows = subcategories.data?.results ?? [];

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("documents.title")}
        subtitle={
          documents.isLoading
            ? t("common.loading")
            : t("documents.count", { count: totalCount })
        }
        action={
          canUpload ? (
            <div className="flex flex-wrap items-center gap-2">
              {manages && (
                <Button
                  variant="outline"
                  onClick={() => setTaxonomyOpen(true)}
                >
                  <FolderCog className="size-4" />
                  {t("documents.taxonomy.action")}
                </Button>
              )}
              <Button
                disabled={categoryRows.filter((item) => item.is_active).length === 0}
                disabledReason={
                  categoryRows.filter((item) => item.is_active).length === 0
                    ? t("documents.uploadFile.noCategory")
                    : undefined
                }
                onClick={() => setFiling(true)}
              >
                <FilePlus2 className="size-4" />
                {t("documents.uploadFile.action")}
              </Button>
            </div>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        totalCount={totalCount}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={documents.isLoading}
        isError={documents.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="document-archive"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.filters.status,
            onSelect: () => list.setFilter("status", undefined),
          },
          ...(["ACTIVE", "ARCHIVED"] as const).map((status) => ({
            key: status,
            label: t(`documents.status.${status}`),
            active: list.filters.status === status,
            onSelect: () => list.setFilter("status", status),
          })),
        ]}
        toolbarActions={
          <div className="flex flex-wrap items-center gap-2">
            {!topBar.active && (
            <Select value={list.filters.project ?? "all"} onValueChange={(value) => list.setFilter("project", value === "all" ? undefined : value)}>
              <SelectTrigger className="w-full bg-card sm:w-45" aria-label={t("documents.field.project")}><SelectValue placeholder={t("documents.field.project")} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("documents.allProjects")}</SelectItem>{(projects.data?.results ?? []).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
            )}
            {/* B6 / D5 (X16): one dropdown sets category and subcategory together. */}
            <DocumentCategoryPicker
              categories={categoryRows}
              subcategories={subcategoryRows}
              category={list.filters.category}
              subcategory={list.filters.subcategory}
              onChange={(category, subcategory) => list.setFilters({ category, subcategory })}
            />
            <Select value={list.filters.uploaded_by ?? "all"} onValueChange={(value) => list.setFilter("uploaded_by", value === "all" ? undefined : value)}>
              <SelectTrigger className="w-full bg-card sm:w-45" aria-label={t("documents.field.uploadedBy")}><SelectValue placeholder={t("documents.field.uploadedBy")} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("documents.allUploaders")}</SelectItem>{(users.data?.results ?? []).map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" className="w-full bg-card sm:w-40" aria-label={t("documents.field.dateFrom")} value={list.filters.date_from ?? ""} max={list.filters.date_to} onChange={(event) => list.setFilter("date_from", event.target.value || undefined)} />
            <Input type="date" className="w-full bg-card sm:w-40" aria-label={t("documents.field.dateTo")} value={list.filters.date_to ?? ""} min={list.filters.date_from} onChange={(event) => list.setFilter("date_to", event.target.value || undefined)} />
            <QueryFailedNote query={projects} what={t("documents.what.projects")} className="basis-full" />
            <QueryFailedNote query={categories} what={t("documents.what.categories")} className="basis-full" />
            <QueryFailedNote query={subcategories} what={t("documents.what.subcategories")} className="basis-full" />
            <QueryFailedNote query={users} what={t("documents.what.uploaders")} className="basis-full" />
          </div>
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {filing && (
        <UploadDocumentDialog
          categories={categoryRows}
          subcategories={subcategoryRows}
          projects={projects.data?.results ?? []}
          manages={manages}
          category={list.filters.category}
          subcategory={list.filters.subcategory}
          project={list.filters.project}
          onClose={() => setFiling(false)}
          onDone={refresh}
        />
      )}

      {editing && (
        <DocumentEditorDialog
          document={editing}
          categories={categoryRows}
          subcategories={subcategoryRows}
          projects={projects.data?.results ?? []}
          showProject={can("project.view")}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}

      {uploading && (
        <VersionUploadDialog
          document={uploading}
          projects={projects.data?.results ?? []}
          onClose={() => setUploading(null)}
          onDone={refresh}
        />
      )}

      {viewingId && (
        <DocumentDetailDialog
          documentId={viewingId}
          onOpenSource={openSource}
          onClose={() => setViewingId(null)}
        />
      )}
      {opener.sheet}

      {taxonomyOpen && (
        <TaxonomyDialog
          categories={categoryRows}
          subcategories={subcategoryRows}
          isLoading={categories.isLoading || subcategories.isLoading}
          loadError={
            <>
              <QueryFailedNote query={categories} what={t("documents.what.categories")} />
              <QueryFailedNote query={subcategories} what={t("documents.what.subcategories")} />
            </>
          }
          onClose={() => setTaxonomyOpen(false)}
        />
      )}

      {archiving && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setArchiving(null);
            setArchiveReason("");
          }}
          title={t("documents.archive.title", { name: archiving.title })}
          description={t("documents.archive.description")}
          confirmLabel={t("documents.archive.confirm")}
          confirmIcon={Archive}
          variant="default"
          isPending={archiveMutation.isPending}
          reason={archiveReason}
          onReasonChange={setArchiveReason}
          reasonRequired
          onConfirm={() => archiveMutation.mutate(archiving)}
        />
      )}
    </div>
  );
}

/**
 * Field errors from a failed upload. A refused file type (B6) is worded from
 * the catalogue - the field's own message is the server's English - and put
 * under the file input, where the reader is looking.
 */
function uploadErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  if (error.code === "document_file_type_not_allowed") {
    return { ...error.errors, file: error.message };
  }
  return error.errors;
}

/**
 * 「来自 RC-005 · 材料进场」 under a system file's title (E4), opening the
 * record it came from; 「原记录已删除」 when that record is gone (Q23).
 */
function SourceTag({
  source,
  onOpen,
  more = 0,
}: {
  source: DocumentSystemFileInfo;
  onOpen: () => void;
  /** The document's other files, said after the tag: 「等 3 个文件」. */
  more?: number;
}) {
  const t = useTranslations();
  const label = useSourceLabel()(source);
  return (
    <p className="flex max-w-65 min-w-0 items-center gap-1.5 text-xs">
      <button
        type="button"
        className="min-w-0 truncate text-primary underline-offset-2 hover:underline"
        title={t("documents.source.open")}
        onClick={onOpen}
      >
        {label}
      </button>
      {source.record.deleted && (
        <StatusBadge label={t("documents.source.deleted")} tone="neutral" />
      )}
      {more > 0 && (
        <span className="shrink-0 text-muted-foreground">
          {t("documents.filesMore", { count: more })}
        </span>
      )}
    </p>
  );
}

/**
 * How a system file is shown: a photograph comes back as its watermarked
 * JPEG whatever it was uploaded as; anything else as the server says. Not
 * keyed on the thumbnail: a list leaves a photo not stamped yet without one
 * (Fable #17), and opening it is what stamps it.
 */
function systemFilePreviewType(source: DocumentSystemFileInfo): string | null {
  if (source.kind === "PHOTO") return "image/jpeg";
  return source.preview_type;
}

function fileStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).slice(0, 255);
}

/**
 * The name a document of several files gets when nobody types one:
 * 「钢筋照片 等 3 个文件」; one file keeps its own name.
 */
export function groupTitle(
  names: string[],
  format: (values: { name: string; count: number }) => string,
): string {
  if (names.length === 0) return "";
  const first = fileStem(names[0]);
  return names.length === 1 ? first : format({ name: first, count: names.length }).slice(0, 255);
}

/**
 * Upload files into the archive in one step (B28): the files, the folder
 * they go in, and the project. The files chosen together are ONE document
 * (2026-10-10: 「我选了这三个不是应该放在一起的吗」) - from the computer as
 * its first file and the ones after it, from the system as the picked files.
 */
function UploadDocumentDialog({
  categories,
  subcategories,
  projects,
  manages,
  category: initialCategory,
  subcategory: initialSubcategory,
  project: initialProject,
  onClose,
  onDone,
}: {
  categories: DocumentCategory[];
  subcategories: DocumentSubcategory[];
  projects: Project[];
  manages: boolean;
  category?: string;
  subcategory?: string;
  project?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const active = categories.filter((item) => item.is_active);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [keywords, setKeywords] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState(
    active.find((item) => item.id === initialCategory)?.id ?? active[0]?.id ?? "",
  );
  const [subcategory, setSubcategory] = useState(
    subcategories.find((item) => item.id === initialSubcategory && item.is_active)?.id ?? "none",
  );
  const [project, setProject] = useState(
    initialProject ?? (manages ? "none" : (projects.length === 1 ? projects[0].id : "")),
  );
  // How far an upload of several files got, and the document it made: a
  // retry after a failure carries on into the same document.
  const [done, setDone] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // E4: 「从电脑上传」｜「从系统里选」.
  const [origin, setOrigin] = useState<"computer" | "system">("computer");
  const [picked, setPicked] = useState<Record<string, SystemFile>>({});
  const pickedIds = Object.keys(picked);
  // A document belongs to one project, so the picked files must share one.
  const mixedProjects = new Set(Object.values(picked).map((file) => file.project ?? "")).size > 1;
  const availableSubcategories = subcategories.filter(
    (item) => item.category === category && item.is_active,
  );
  const categoryName = categories.find((item) => item.id === category)?.name ?? "";
  const subcategoryName = availableSubcategories.find((item) => item.id === subcategory)?.name;
  const formatGroup = (values: { name: string; count: number }) =>
    t("documents.uploadFile.groupTitle", values);
  const defaultTitle =
    origin === "system"
      ? groupTitle(Object.values(picked).map((file) => file.file_name), formatGroup)
      : groupTitle(files.map((file) => file.name), formatGroup);
  // Once part of a several-file upload is in, what it was filed as is fixed.
  const started = createdId !== null;

  const mutation = useMutation({
    mutationFn: async () => {
      let documentId = createdId;
      let next = done;
      if (!documentId) {
        const created = await uploadDocument(
          {
            title: title.trim() || defaultTitle,
            reference_no: referenceNo.trim(),
            keywords: keywords.trim(),
            description: note.trim(),
            project: project === "none" || project === "" ? null : project,
            category,
            subcategory: subcategory === "none" ? null : subcategory,
          },
          files[0],
          { quiet: true },
        );
        documentId = created.id;
        setCreatedId(created.id);
        next = 1;
        setDone(1);
      }
      for (let index = next; index < files.length; index += 1) {
        await uploadDocumentVersion(documentId, files[index], "", { quiet: true });
        setDone(index + 1);
      }
      toastSuccess("documents.toast.uploaded");
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => {
      onDone();
      setErrors(uploadErrors(error));
    },
  });
  const filing = useMutation({
    mutationFn: () =>
      addSystemFiles({
        files: pickedIds,
        category,
        subcategory: subcategory === "none" ? null : subcategory,
        keywords: keywords.trim(),
        title: title.trim() || defaultTitle,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => setErrors(error instanceof ApiError ? error.errors : {}),
  });
  const pending = mutation.isPending || filing.isPending;
  // Part of a several-file upload is in: say so, and that 「上传」 carries on.
  const partial = started && done < files.length;

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[92dvh] overflow-y-auto [&>button]:hidden",
          origin === "system" ? "sm:max-w-260" : "sm:max-w-170",
        )}
      >
        <DialogHeader>
          <DialogTitle>{t("documents.uploadFile.title")}</DialogTitle>
          <DialogDescription>
            {t(origin === "system" ? "documents.pickFromSystem.description" : "documents.uploadFile.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={origin} onValueChange={(value) => !started && setOrigin(value as "computer" | "system")}>
          <TabsList>
            <TabsTrigger value="computer">{t("documents.uploadFile.fromComputer")}</TabsTrigger>
            <TabsTrigger value="system">{t("documents.pickFromSystem.tab")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* One plain line for each way in (2026-10-10: 「我不会用」). */}
        <ul className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-slot="upload-ways">
          <li className={cn(origin === "computer" && "font-medium text-foreground")}>
            {t("documents.uploadFile.computerWay")}
          </li>
          <li className={cn(origin === "system" && "font-medium text-foreground")}>
            {t("documents.pickFromSystem.systemWay")}
          </li>
        </ul>

        <div className="grid gap-4 sm:grid-cols-2">
          {origin === "system" ? (
            <FieldWrapper
              label={t("documents.pickFromSystem.files")}
              required
              error={errors.files}
              hint={t("documents.pickFromSystem.hint")}
              className="sm:col-span-2"
            >
              <SystemFilePicker
                projects={projects}
                initialProject={initialProject}
                selected={picked}
                onSelectedChange={setPicked}
              />
            </FieldWrapper>
          ) : (
          <>
          <FieldWrapper
            label={t("documents.field.file")}
            required
            error={errors.file}
            hint={t("documents.uploadFile.fileHint")}
            className="sm:col-span-2"
          >
            <Input
              type="file"
              multiple
              accept={DOCUMENT_FILE_ACCEPT}
              disabled={pending}
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                // A new choice is a new document.
                setCreatedId(null);
                setDone(0);
              }}
            />
          </FieldWrapper>
          {files.length > 1 && (
            <ul className="max-h-28 overflow-y-auto rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className={cn("truncate", index < done && "text-success")}>
                  {file.name}
                </li>
              ))}
            </ul>
          )}
          {partial && !mutation.isPending && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground sm:col-span-2">
              {t("documents.uploadFile.partial", { done, total: files.length })}
            </p>
          )}
          </>
          )}
          {origin === "system" && mixedProjects && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground sm:col-span-2">
              {t("documents.pickFromSystem.mixedProjects")}
            </p>
          )}
          <FieldWrapper
            label={t("documents.field.title")}
            optional={t("common.optional")}
            error={errors.title}
            hint={t("documents.uploadFile.titleHint")}
            className="sm:col-span-2"
          >
            <Input
              value={title}
              disabled={started}
              placeholder={defaultTitle || undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("documents.field.category")} required error={errors.category}>
            <Select
              value={category}
              disabled={started}
              onValueChange={(value) => {
                setCategory(value);
                setSubcategory("none");
              }}
            >
              <SelectTrigger className="w-full bg-card">
                <SelectValue placeholder={t("common.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {active.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.subcategory")}
            optional={t("common.optional")}
            error={errors.subcategory}
          >
            <Select value={subcategory} onValueChange={setSubcategory} disabled={started}>
              <SelectTrigger className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {availableSubcategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <p className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
            <Folder className="h-3.5 w-3.5 shrink-0" />
            {t("documents.uploadFile.pathPreview")}
            <span className="font-medium text-foreground">
              {[categoryName, subcategoryName].filter(Boolean).join(" / ") || t("common.emptyValue")}
            </span>
          </p>
          {origin === "computer" && (
          <>
          <FieldWrapper
            label={t("documents.field.project")}
            required={!manages}
            optional={manages ? t("common.optional") : undefined}
            error={errors.project}
            hint={manages ? undefined : t("documents.uploadFile.projectHint")}
            className="sm:col-span-2"
          >
            <Select value={project} onValueChange={setProject} disabled={started}>
              <SelectTrigger className="w-full bg-card">
                <SelectValue placeholder={t("common.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {manages && <SelectItem value="none">{t("documents.companyWide")}</SelectItem>}
                {projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.reference")}
            optional={t("common.optional")}
            error={errors.reference_no}
          >
            <Input
              value={referenceNo}
              disabled={started}
              onChange={(event) => setReferenceNo(event.target.value)}
            />
          </FieldWrapper>
          </>
          )}
          <FieldWrapper
            label={t("documents.field.keywords")}
            optional={t("common.optional")}
            error={errors.keywords}
            className={origin === "computer" ? undefined : "sm:col-span-2"}
          >
            <Input
              value={keywords}
              disabled={started}
              placeholder={t("documents.keywordsPlaceholder")}
              onChange={(event) => setKeywords(event.target.value)}
            />
          </FieldWrapper>
          {origin === "computer" && (
          <FieldWrapper
            label={t("documents.field.description")}
            optional={t("common.optional")}
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              rows={2}
              value={note}
              disabled={started}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          {origin === "system" ? (
            <Button
              requires={[
                [pickedIds.length > 0, t("documents.pickFromSystem.files")],
                [category, t("documents.field.category")],
              ]}
              disabled={filing.isPending || mixedProjects}
              disabledReason={mixedProjects ? t("documents.pickFromSystem.mixedProjects") : undefined}
              onClick={() => filing.mutate()}
            >
              {filing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
              {t("documents.pickFromSystem.confirm", { count: pickedIds.length })}
            </Button>
          ) : (
          <Button
            requires={[
              [files.length > 0, t("documents.field.file")],
              [category, t("documents.field.category")],
              [manages || (project && project !== "none"), t("documents.field.project")],
            ]}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {mutation.isPending && files.length > 1
              ? t("documents.uploadFile.progress", { done, total: files.length })
              : partial
                ? t("documents.uploadFile.resume")
                : t("documents.uploadFile.confirm")}
          </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentEditorDialog({
  document,
  categories,
  subcategories,
  projects,
  showProject,
  onClose,
  onDone,
}: {
  document: DocumentRecord;
  categories: DocumentCategory[];
  subcategories: DocumentSubcategory[];
  projects: Project[];
  showProject: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState(document.title);
  const [referenceNo, setReferenceNo] = useState(document.reference_no);
  const [description, setDescription] = useState(document.description);
  const [keywords, setKeywords] = useState(document.keywords);
  const [project, setProject] = useState(document.project ?? "none");
  const [category, setCategory] = useState(document.category);
  const [subcategory, setSubcategory] = useState(document.subcategory ?? "none");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => {
      const payload: DocumentPayload = {
        title: title.trim(),
        reference_no: referenceNo.trim(),
        description: description.trim(),
        keywords: keywords.trim(),
        project: showProject ? (project === "none" ? null : project) : undefined,
        category,
        subcategory: subcategory === "none" ? null : subcategory,
      };
      return updateDocument(document.id, payload);
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => {
      setErrors(error instanceof ApiError ? error.errors : {});
    },
  });

  const availableSubcategories = subcategories.filter(
    (item) => item.category === category && (item.is_active || item.id === document.subcategory),
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-180 [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("documents.edit.title")}</DialogTitle>
          <DialogDescription>{t("documents.edit.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("documents.field.title")}
            required
            error={errors.title}
            className="sm:col-span-2"
          >
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.reference")}
            optional={t("common.optional")}
            error={errors.reference_no}
          >
            <Input
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
            />
          </FieldWrapper>
          {showProject && (
            <FieldWrapper
              label={t("documents.field.project")}
              optional={t("common.optional")}
              error={errors.project}
            >
              {/* A document never moves project; the server refuses it too. */}
              <Select value={project} onValueChange={setProject} disabled>
                <SelectTrigger className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("documents.companyWide")}</SelectItem>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          <FieldWrapper
            label={t("documents.field.category")}
            required
            error={errors.category}
          >
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setSubcategory("none");
              }}
            >
              <SelectTrigger className="w-full bg-card">
                <SelectValue placeholder={t("common.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((item) => item.is_active || item.id === document.category)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.subcategory")}
            optional={t("common.optional")}
            error={errors.subcategory}
          >
            <Select value={subcategory} onValueChange={setSubcategory}>
              <SelectTrigger className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {availableSubcategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.keywords")}
            optional={t("common.optional")}
            error={errors.keywords}
            className="sm:col-span-2"
          >
            <Input
              value={keywords}
              placeholder={t("documents.keywordsPlaceholder")}
              onChange={(event) => setKeywords(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.description")}
            optional={t("common.optional")}
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldWrapper>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            requires={[
              [title, t("documents.field.title")],
              [category, t("documents.field.category")],
            ]}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Add files to one document: a new version, more files beside the ones it
 * has, or files already in the system (2026-10-10: 「我点这个上传为什么不能上传
 * 系统内部的文件只能外部的？」). The same two ways in as filing a new
 * document. Every document takes them, one picked from the system too; what
 * it already holds, and the records those files came from, stay as they are.
 */
function VersionUploadDialog({
  document,
  projects,
  onClose,
  onDone,
}: {
  document: DocumentRecord;
  projects: Project[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [origin, setOrigin] = useState<"computer" | "system">("computer");
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState(0);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Record<string, SystemFile>>({});
  const pickedIds = Object.keys(picked);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The files it already holds from the system: greyed in the picker.
  const detail = useQuery({
    queryKey: ["documents", "detail", document.id],
    queryFn: () => getDocument(document.id),
    enabled: origin === "system",
  });
  const held = new Set(
    (detail.data?.system_files ?? []).map((file) => file.evidence_id).filter(Boolean),
  );
  const unavailableReason = (row: SystemFile): string | null => {
    if (held.has(row.id)) return t("documents.attach.alreadyHere");
    if ((row.project ?? null) !== (document.project ?? null)) return t("documents.attach.otherProject");
    return null;
  };
  const mutation = useMutation({
    mutationFn: async () => {
      // A retry after a failure carries on from the file that failed.
      for (let index = done; index < files.length; index += 1) {
        await uploadDocumentVersion(document.id, files[index], note.trim(), { quiet: true });
        setDone(index + 1);
      }
      toastSuccess("documents.toast.versionUploaded");
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => {
      onDone();
      setErrors(uploadErrors(error));
    },
  });
  const attaching = useMutation({
    mutationFn: () => attachSystemFiles(document.id, pickedIds),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => setErrors(error instanceof ApiError ? error.errors : {}),
  });
  const pending = mutation.isPending || attaching.isPending;

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[92dvh] overflow-y-auto [&>button]:hidden",
          origin === "system" ? "sm:max-w-260" : "sm:max-w-130",
        )}
      >
        <DialogHeader>
          <DialogTitle>{t("documents.upload.title")}</DialogTitle>
          <DialogDescription>
            {t("documents.upload.description", { name: document.title })}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={origin} onValueChange={(value) => !pending && setOrigin(value as "computer" | "system")}>
          <TabsList>
            <TabsTrigger value="computer">{t("documents.uploadFile.fromComputer")}</TabsTrigger>
            <TabsTrigger value="system">{t("documents.pickFromSystem.tab")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <ul className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-slot="upload-ways">
          <li className={cn(origin === "computer" && "font-medium text-foreground")}>
            {t("documents.uploadFile.computerWay")}
          </li>
          <li className={cn(origin === "system" && "font-medium text-foreground")}>
            {t("documents.pickFromSystem.systemWay")}
          </li>
        </ul>
        {origin === "system" ? (
          <div className="space-y-2">
            <QueryFailedNote query={detail} what={t("documents.attach.what")} />
            <FieldWrapper
              label={t("documents.pickFromSystem.files")}
              required
              error={errors.files}
              hint={t("documents.attach.hint")}
            >
              <SystemFilePicker
                projects={projects}
                initialProject={document.project ?? undefined}
                lockProject={Boolean(document.project)}
                unavailableReason={unavailableReason}
                selected={picked}
                onSelectedChange={setPicked}
              />
            </FieldWrapper>
          </div>
        ) : (
          <div className="space-y-4">
            <FieldWrapper
              label={t("documents.field.file")}
              required
              error={errors.file}
              hint={t("documents.upload.limit")}
            >
              <Input
                type="file"
                multiple
                accept={DOCUMENT_FILE_ACCEPT}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []));
                  setDone(0);
                }}
              />
            </FieldWrapper>
            {files.length > 1 && (
              <ul className="max-h-28 overflow-y-auto rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`} className={cn("truncate", index < done && "text-success")}>
                    {file.name}
                  </li>
                ))}
              </ul>
            )}
            <FieldWrapper
              label={t("documents.field.versionNote")}
              optional={t("common.optional")}
              error={errors.note}
            >
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </FieldWrapper>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          {origin === "system" ? (
            <Button
              requires={[[pickedIds.length > 0, t("documents.pickFromSystem.files")]]}
              disabled={attaching.isPending}
              onClick={() => attaching.mutate()}
            >
              {attaching.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
              {t("documents.attach.confirm", { count: pickedIds.length })}
            </Button>
          ) : (
            <Button
              requires={[[files.length > 0, t("documents.field.file")]]}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {mutation.isPending && files.length > 1
                ? t("documents.uploadFile.progress", { done, total: files.length })
                : done > 0 && done < files.length
                  ? t("documents.uploadFile.resume")
                  : t("documents.upload.confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Which file the detail's preview shows: a picked one or an uploaded one. */
type ShownFile =
  | { kind: "system"; file: DocumentSystemFileInfo }
  | { kind: "version"; version: DocumentVersion };

function DocumentDetailDialog({
  documentId,
  onOpenSource,
  onClose,
}: {
  documentId: string;
  onOpenSource: (record: DocumentRecord, source?: DocumentSystemFileInfo) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [downloading, setDownloading] = useState<string | null>(null);
  // Which file the preview shows (`s:<id>` / `v:<id>`); the newest upload,
  // else the first picked file, until somebody picks another.
  const [previewing, setPreviewing] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["documents", "detail", documentId],
    queryFn: () => getDocument(documentId),
  });

  const handleDownload = async (version: DocumentVersion) => {
    setDownloading(version.id);
    try {
      await downloadDocumentVersion(version);
    } finally {
      setDownloading(null);
    }
  };

  const systemFiles = detail.data
    ? (detail.data.system_files ?? (detail.data.system_file ? [detail.data.system_file] : []))
    : [];
  const versions = detail.data?.versions ?? [];
  const shown: ShownFile | null = (() => {
    const picked = systemFiles.find((file) => `s:${file.id}` === previewing);
    if (picked) return { kind: "system", file: picked };
    const version = versions.find((item) => `v:${item.id}` === previewing);
    if (version) return { kind: "version", version };
    if (versions[0]) return { kind: "version", version: versions[0] };
    if (systemFiles[0]) return { kind: "system", file: systemFiles[0] };
    return null;
  })();
  const shownKey =
    shown?.kind === "system" ? `s:${shown.file.id}` : shown ? `v:${shown.version.id}` : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-295 [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("documents.detail.title")}</DialogTitle>
          <DialogDescription>
            {detail.data?.document_no ?? t("common.loading")}
          </DialogDescription>
        </DialogHeader>

        {detail.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {t("table.errorBody")}
          </p>
        ) : !detail.data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* B27: the file itself, in the page - 「不需要先下载到本地」. */}
            <section className="flex min-w-0 flex-col gap-2" aria-label={t("documents.preview.title")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{t("documents.preview.title")}</h3>
                {shown?.kind === "version" && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground" title={shown.version.original_name}>
                    v{shown.version.version_number} · {shown.version.original_name}
                  </span>
                )}
                {shown?.kind === "system" && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground" title={shown.file.file_name}>
                    {shown.file.file_name}
                  </span>
                )}
              </div>
              {shown?.kind === "system" ? (
                <>
                  <SourceTag
                    source={shown.file}
                    onOpen={() => onOpenSource(detail.data, shown.file)}
                  />
                  <FilePreview
                    key={shownKey}
                    load={() => systemFileObjectUrl(detail.data.id, shown.file)}
                    previewType={systemFilePreviewType(shown.file)}
                    filename={shown.file.file_name}
                    onDownload={() => downloadSystemFile(detail.data, shown.file)}
                    className="h-[52dvh] lg:h-[64dvh]"
                  />
                </>
              ) : shown?.kind === "version" ? (
                <FilePreview
                  key={shownKey}
                  load={() => documentVersionObjectUrl(shown.version)}
                  previewType={shown.version.preview_type}
                  filename={shown.version.original_name}
                  onDownload={() => handleDownload(shown.version)}
                  className="h-[52dvh] lg:h-[64dvh]"
                />
              ) : (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {t("documents.versions.empty")}
                </p>
              )}
            </section>
            <DocumentDetailBody
              document={detail.data}
              systemFiles={systemFiles}
              downloading={downloading}
              previewing={shownKey}
              onPreview={(key) => setPreviewing(key)}
              onDownload={(version) => void handleDownload(version)}
              onOpenSource={(file) => onOpenSource(detail.data, file)}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDetailBody({
  document,
  systemFiles,
  downloading,
  previewing,
  onPreview,
  onDownload,
  onOpenSource,
}: {
  document: DocumentDetail;
  systemFiles: DocumentSystemFileInfo[];
  downloading: string | null;
  /** `s:<id>` or `v:<id>`: the file the preview shows. */
  previewing: string | null;
  onPreview: (key: string) => void;
  onDownload: (version: DocumentVersion) => void;
  onOpenSource: (file: DocumentSystemFileInfo) => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const [savingFile, setSavingFile] = useState<string | null>(null);
  const saveSystemFile = async (file: DocumentSystemFileInfo) => {
    setSavingFile(file.id ?? "");
    try {
      await downloadSystemFile(document, file);
    } finally {
      setSavingFile(null);
    }
  };
  return (
    <div className="min-w-0 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadField label={t("documents.field.title")} value={document.title} />
        <ReadField
          label={t("documents.field.reference")}
          value={document.reference_no}
        />
        <ReadField
          label={t("documents.field.status")}
          value={
            <StatusBadge
              label={t(`documents.status.${document.status}`)}
              tone={document.status === "ACTIVE" ? "positive" : "neutral"}
            />
          }
        />
        <ReadField label={t("documents.field.category")} value={document.category_name} />
        <ReadField
          label={t("documents.field.subcategory")}
          value={document.subcategory_name}
        />
        <ReadField
          label={t("documents.field.project")}
          value={document.project_name ?? t("documents.companyWide")}
        />
        <ReadField label={t("documents.field.keywords")} value={document.keywords} />
        <ReadField
          label={t("documents.field.createdAt")}
          value={df.dateTime(document.created_at)}
        />
        <ReadField
          label={t("documents.field.updatedAt")}
          value={df.dateTime(document.updated_at)}
        />
        {document.description && (
          <ReadField
            label={t("documents.field.description")}
            value={document.description}
            className="sm:col-span-2"
          />
        )}
        {document.status === "ARCHIVED" && (
          <ReadField
            label={t("documents.field.archiveReason")}
            value={document.archive_reason}
            className="sm:col-span-2"
          />
        )}
      </div>

      {/* The files picked from the system into it (2026-10-10: kept
          together), each previewed, saved or traced to its record. */}
      {systemFiles.length > 0 && (
        <section className="space-y-2 border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("documents.systemFiles.title")}
            </h3>
            <TypeBadge label={String(systemFiles.length)} />
          </div>
          <ul className="divide-y rounded-md border">
            {systemFiles.map((file, index) => {
              const key = `s:${file.id}`;
              return (
                <li key={file.id ?? index} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" title={file.file_name}>
                      {file.file_name}
                    </p>
                    <SourceTag source={file} onOpen={() => onOpenSource(file)} />
                  </div>
                  <Button
                    variant={previewing === key ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title={t("filePreview.preview")}
                    aria-pressed={previewing === key}
                    onClick={() => onPreview(key)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title={t("documents.download")}
                    disabled={savingFile === (file.id ?? "")}
                    disabledReason={savingFile === (file.id ?? "") ? t("documents.downloading") : undefined}
                    onClick={() => void saveSystemFile(file)}
                  >
                    {savingFile === (file.id ?? "") ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2 border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("documents.versions.title")}
          </h3>
          <TypeBadge label={String(document.versions.length)} />
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("documents.field.version")}</TableHead>
                <TableHead>{t("documents.field.file")}</TableHead>
                <TableHead>{t("documents.field.uploadedBy")}</TableHead>
                <TableHead className="hidden xl:table-cell">{t("documents.field.sha256")}</TableHead>
                <TableHead>{t("documents.field.createdAt")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.versions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {systemFiles.length > 0
                      ? t("documents.versions.emptyWithSystemFiles")
                      : t("documents.versions.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                document.versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="font-medium tabular-nums">
                      v{version.version_number}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-55 truncate" title={version.original_name}>
                        {version.original_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(version.byte_size)}
                        {version.note ? ` - ${version.note}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>{version.uploaded_by_name ?? t("common.emptyValue")}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <code className="block max-w-42.5 truncate text-xs" title={version.sha256}>
                        {version.sha256}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {df.dateTime(version.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant={previewing === `v:${version.id}` ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        title={t("filePreview.preview")}
                        aria-pressed={previewing === `v:${version.id}`}
                        onClick={() => onPreview(`v:${version.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("documents.download")}
                        disabledReason={
                          downloading === version.id
                            ? t("documents.downloading")
                            : undefined
                        }
                        disabled={downloading === version.id}
                        onClick={() => onDownload(version)}
                      >
                        {downloading === version.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function TaxonomyDialog({
  categories,
  subcategories,
  isLoading,
  loadError,
  onClose,
}: {
  categories: DocumentCategory[];
  subcategories: DocumentSubcategory[];
  isLoading: boolean;
  /** Says which list failed, so an empty list is not read as "none set up". */
  loadError: React.ReactNode;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [categoryForm, setCategoryForm] = useState<DocumentCategory | "new" | null>(null);
  const [subcategoryForm, setSubcategoryForm] = useState<
    DocumentSubcategory | "new" | null
  >(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["documents", "categories"] });
    void queryClient.invalidateQueries({ queryKey: ["documents", "subcategories"] });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-245 [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("documents.taxonomy.title")}</DialogTitle>
          <DialogDescription>{t("documents.taxonomy.description")}</DialogDescription>
        </DialogHeader>
        {loadError}

        {categoryForm ? (
          <CategoryForm
            category={categoryForm === "new" ? null : categoryForm}
            onCancel={() => setCategoryForm(null)}
            onDone={() => {
              refresh();
              setCategoryForm(null);
            }}
          />
        ) : subcategoryForm ? (
          <SubcategoryForm
            subcategory={subcategoryForm === "new" ? null : subcategoryForm}
            categories={categories}
            onCancel={() => setSubcategoryForm(null)}
            onDone={() => {
              refresh();
              setSubcategoryForm(null);
            }}
          />
        ) : (
          <div className="grid min-h-95 gap-6 lg:grid-cols-2">
            <TaxonomyList
              title={t("documents.categories.title")}
              addLabel={t("documents.categories.add")}
              isLoading={isLoading}
              rows={categories.map((category) => ({
                id: category.id,
                code: category.code,
                name: category.name,
                description: category.description,
                active: category.is_active,
                onEdit: () => setCategoryForm(category),
              }))}
              onAdd={() => setCategoryForm("new")}
            />
            <TaxonomyList
              title={t("documents.subcategories.title")}
              addLabel={t("documents.subcategories.add")}
              isLoading={isLoading}
              rows={subcategories.map((subcategory) => ({
                id: subcategory.id,
                code: `${subcategory.category_name} / ${subcategory.code}`,
                name: subcategory.name,
                description: subcategory.description,
                active: subcategory.is_active,
                onEdit: () => setSubcategoryForm(subcategory),
              }))}
              onAdd={() => setSubcategoryForm("new")}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TaxonomyListRow {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  onEdit: () => void;
}

function TaxonomyList({
  title,
  addLabel,
  isLoading,
  rows,
  onAdd,
}: {
  title: string;
  addLabel: string;
  isLoading: boolean;
  rows: TaxonomyListRow[];
  onAdd: () => void;
}) {
  const t = useTranslations();
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="panel-title">{title}</h3>
          <TypeBadge label={String(rows.length)} />
        </div>
        <Button variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
      <div className="max-h-105 overflow-y-auto rounded-lg border">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("table.noResults")}
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.name}
                    </p>
                    <StatusBadge
                      label={t(
                        row.active
                          ? "documents.taxonomy.active"
                          : "documents.taxonomy.inactive",
                      )}
                      tone={row.active ? "positive" : "neutral"}
                    />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{row.code}</p>
                  {row.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {row.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title={t("common.edit")}
                  onClick={row.onEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * One document category's form. Exported so Category Management can open it
 * in a dialog in place (D-264) - one form, two places it is shown.
 *
 * Correcting an existing category also offers removing it (p23): this dialog
 * is the only place document categories are managed since B1 took them out of
 * 分类管理 (Q5). Armed by a switch, never a confirm dialog (spec rule 8). A
 * category documents or subcategories still use is refused by the server,
 * which names them; that sentence is shown here, beside the switch.
 */
export function CategoryForm({
  category,
  onCancel,
  onDone,
}: {
  category: DocumentCategory | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [code, setCode] = useState(category?.code ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [active, setActive] = useState(category?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removeArmed, setRemoveArmed] = useState(false);
  const [removeRefusal, setRemoveRefusal] = useState("");
  const removal = useMutation({
    mutationFn: () => deleteDocumentCategory(category!.id),
    onSuccess: onDone,
    onError: (error) =>
      setRemoveRefusal(
        error instanceof ApiError ? error.message : t("documents.categories.remove.failed"),
      ),
  });
  const mutation = useMutation({
    mutationFn: () => {
      const payload: DocumentCategoryPayload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        is_active: active,
      };
      return category
        ? updateDocumentCategory(category.id, payload)
        : createDocumentCategory(payload);
    },
    onSuccess: onDone,
    onError: (error) => setErrors(error instanceof ApiError ? error.errors : {}),
  });

  return (
    <TaxonomyFormShell
      title={t(category ? "documents.categories.edit" : "documents.categories.create")}
      isPending={mutation.isPending}
      requires={[
        [code, t("documents.field.code")],
        [name, t("documents.field.name")],
      ]}
      onCancel={onCancel}
      onSubmit={() => mutation.mutate()}
    >
      <FieldWrapper label={t("documents.field.code")} required error={errors.code}>
        <Input
          value={code}
          disabled={category !== null}
          onChange={(event) => setCode(event.target.value)}
        />
      </FieldWrapper>
      <FieldWrapper label={t("documents.field.name")} required error={errors.name}>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </FieldWrapper>
      <FieldWrapper
        label={t("documents.field.description")}
        optional={t("common.optional")}
        error={errors.description}
        className="sm:col-span-2"
      >
        <Textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FieldWrapper>
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("documents.taxonomy.active")}</p>
          <p className="text-xs text-muted-foreground">
            {t("documents.taxonomy.activeHint")}
          </p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
      {category && (
        <div className="space-y-2 rounded-xl border border-tone-rose/25 bg-tone-rose/6 p-3 sm:col-span-2">
          <label className="flex items-start gap-3">
            <Switch
              checked={removeArmed}
              onCheckedChange={(next) => {
                setRemoveArmed(next);
                setRemoveRefusal("");
              }}
              aria-label={t("documents.categories.remove.switch")}
            />
            <span>
              <span className="block text-sm font-medium">
                {t("documents.categories.remove.switch")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("documents.categories.remove.hint")}
              </span>
            </span>
          </label>
          {removeArmed && (
            <Button
              variant="destructive"
              className="w-full"
              disabled={removal.isPending || mutation.isPending}
              onClick={() => removal.mutate()}
            >
              {removal.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t("documents.categories.remove.confirm")}
            </Button>
          )}
          {removeRefusal && (
            <p role="alert" className="text-sm text-destructive">
              {removeRefusal}
            </p>
          )}
        </div>
      )}
    </TaxonomyFormShell>
  );
}

function SubcategoryForm({
  subcategory,
  categories,
  onCancel,
  onDone,
}: {
  subcategory: DocumentSubcategory | null;
  categories: DocumentCategory[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [category, setCategory] = useState(
    subcategory?.category ?? categories.find((item) => item.is_active)?.id ?? "",
  );
  const [code, setCode] = useState(subcategory?.code ?? "");
  const [name, setName] = useState(subcategory?.name ?? "");
  const [description, setDescription] = useState(subcategory?.description ?? "");
  const [active, setActive] = useState(subcategory?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: () => {
      const payload: DocumentSubcategoryPayload = {
        category,
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        is_active: active,
      };
      return subcategory
        ? updateDocumentSubcategory(subcategory.id, payload)
        : createDocumentSubcategory(payload);
    },
    onSuccess: onDone,
    onError: (error) => setErrors(error instanceof ApiError ? error.errors : {}),
  });

  return (
    <TaxonomyFormShell
      title={t(
        subcategory
          ? "documents.subcategories.edit"
          : "documents.subcategories.create",
      )}
      isPending={mutation.isPending}
      requires={[
        [category, t("documents.field.category")],
        [code, t("documents.field.code")],
        [name, t("documents.field.name")],
      ]}
      onCancel={onCancel}
      onSubmit={() => mutation.mutate()}
    >
      <FieldWrapper
        label={t("documents.field.category")}
        required
        error={errors.category}
      >
        <Select
          value={category}
          onValueChange={setCategory}
          disabled={subcategory !== null}
        >
          <SelectTrigger className="w-full bg-card">
            <SelectValue placeholder={t("common.selectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {categories
              .filter((item) => item.is_active || item.id === subcategory?.category)
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FieldWrapper>
      <FieldWrapper label={t("documents.field.code")} required error={errors.code}>
        <Input value={code} onChange={(event) => setCode(event.target.value)} />
      </FieldWrapper>
      <FieldWrapper label={t("documents.field.name")} required error={errors.name}>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </FieldWrapper>
      <FieldWrapper
        label={t("documents.field.description")}
        optional={t("common.optional")}
        error={errors.description}
      >
        <Textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FieldWrapper>
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("documents.taxonomy.active")}</p>
          <p className="text-xs text-muted-foreground">
            {t("documents.taxonomy.activeHint")}
          </p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
    </TaxonomyFormShell>
  );
}

function TaxonomyFormShell({
  title,
  isPending,
  requires,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  isPending: boolean;
  requires: readonly Requirement[];
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <section className="space-y-5 py-2">
      <h3 className="panel-title">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="flex flex-col-reverse gap-2 border-t border-panel-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={isPending} onClick={onCancel}>
          <X className="h-4 w-4" />
          {t("common.cancel")}
        </Button>
        <Button requires={requires} disabled={isPending} onClick={onSubmit}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
          {t("common.save")}
        </Button>
      </div>
    </section>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
