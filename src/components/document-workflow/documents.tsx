"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  Download,
  Eye,
  FilePlus2,
  FolderCog,
  Loader2,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
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
import { ApiError } from "@/interfaces/api";
import type { Project } from "@/interfaces/contractor";
import type {
  DocumentCategory,
  DocumentCategoryPayload,
  DocumentDetail,
  DocumentPayload,
  DocumentRecord,
  DocumentSubcategory,
  DocumentSubcategoryPayload,
  DocumentVersion,
} from "@/interfaces/document-workflow";
import { useDateFormat } from "@/lib/dates";
import { getProjects } from "@/services/contractor.service";
import {
  archiveDocument,
  createDocument,
  createDocumentCategory,
  createDocumentSubcategory,
  downloadDocumentVersion,
  getDocument,
  getDocumentCategories,
  getDocuments,
  getDocumentSubcategories,
  updateDocument,
  updateDocumentCategory,
  updateDocumentSubcategory,
  uploadDocumentVersion,
} from "@/services/document-workflow.service";

export function Documents() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const list = useListQuery(["status", "category"]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DocumentRecord | null | "new">(null);
  const [uploading, setUploading] = useState<DocumentRecord | null>(null);
  const [archiving, setArchiving] = useState<DocumentRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);

  const documents = useQuery({
    queryKey: ["documents", list.query],
    queryFn: () => getDocuments(list.query),
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
            <p className="max-w-[180px] truncate text-xs text-muted-foreground">
              {row.original.reference_no || t("common.emptyValue")}
            </p>
          </div>
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
              className="max-w-[260px] truncate font-medium text-foreground"
              title={row.original.title}
            >
              {row.original.title}
            </p>
            <p className="max-w-[260px] truncate text-xs text-muted-foreground">
              {row.original.latest_version?.original_name ??
                t("documents.noFile")}
            </p>
          </div>
        ),
      },
      {
        id: "category",
        meta: { label: t("documents.field.category") },
        header: () => t("documents.field.category"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.category_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.subcategory_name ?? t("common.emptyValue")}
            </p>
          </div>
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
        id: "version_count",
        meta: { label: t("documents.field.versions") },
        header: () => t("documents.field.versions"),
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.version_count ?? 0)} />
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
            {df.date(row.original.created_at)}
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
              {can("document.manage") && active && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t("documents.upload.action")}
                    onClick={() => setUploading(record)}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t("common.edit")}
                    onClick={() => setEditing(record)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
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
    [can, df, t],
  );

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
          can("document.manage") ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                onClick={() => setTaxonomyOpen(true)}
              >
                <FolderCog className="h-4 w-4" />
                {t("documents.taxonomy.action")}
              </Button>
              <Button
                size="sm"
                className="rounded-full px-4 shadow-sm"
                disabled={categoryRows.filter((item) => item.is_active).length === 0}
                onClick={() => setEditing("new")}
              >
                <FilePlus2 className="h-4 w-4" />
                {t("documents.create.action")}
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
          <Select
            value={list.filters.category ?? "all"}
            onValueChange={(value) =>
              list.setFilter("category", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger
              size="sm"
              className="h-9 w-[190px] bg-card"
              aria-label={t("documents.field.category")}
            >
              <SelectValue placeholder={t("documents.field.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documents.allCategories")}</SelectItem>
              {categoryRows.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {editing && (
        <DocumentEditorDialog
          document={editing === "new" ? null : editing}
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
          onClose={() => setUploading(null)}
          onDone={refresh}
        />
      )}

      {viewingId && (
        <DocumentDetailDialog
          documentId={viewingId}
          onClose={() => setViewingId(null)}
        />
      )}

      {taxonomyOpen && (
        <TaxonomyDialog
          categories={categoryRows}
          subcategories={subcategoryRows}
          isLoading={categories.isLoading || subcategories.isLoading}
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

function DocumentEditorDialog({
  document,
  categories,
  subcategories,
  projects,
  showProject,
  onClose,
  onDone,
}: {
  document: DocumentRecord | null;
  categories: DocumentCategory[];
  subcategories: DocumentSubcategory[];
  projects: Project[];
  showProject: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState(document?.title ?? "");
  const [referenceNo, setReferenceNo] = useState(document?.reference_no ?? "");
  const [description, setDescription] = useState(document?.description ?? "");
  const [keywords, setKeywords] = useState(document?.keywords ?? "");
  const [project, setProject] = useState(document?.project ?? "none");
  const [category, setCategory] = useState(
    document?.category ?? categories.find((item) => item.is_active)?.id ?? "",
  );
  const [subcategory, setSubcategory] = useState(document?.subcategory ?? "none");
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
      return document
        ? updateDocument(document.id, payload)
        : createDocument(payload);
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
    (item) => item.category === category && (item.is_active || item.id === document?.subcategory),
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[720px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>
            {t(document ? "documents.edit.title" : "documents.create.title")}
          </DialogTitle>
          <DialogDescription>
            {t(document ? "documents.edit.description" : "documents.create.description")}
          </DialogDescription>
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
              <Select
                value={project}
                onValueChange={setProject}
                disabled={document !== null}
              >
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
                  .filter((item) => item.is_active || item.id === document?.category)
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
            size="sm"
            className="rounded-full px-4"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            disabled={!title.trim() || !category || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : document ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <FilePlus2 className="h-4 w-4" />
            )}
            {t(document ? "common.save" : "common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionUploadDialog({
  document,
  onClose,
  onDone,
}: {
  document: DocumentRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: () => uploadDocumentVersion(document.id, file!, note.trim()),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (error) => {
      setErrors(error instanceof ApiError ? error.errors : {});
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("documents.upload.title")}</DialogTitle>
          <DialogDescription>
            {t("documents.upload.description", { name: document.title })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldWrapper
            label={t("documents.field.file")}
            required
            error={errors.file}
            hint={t("documents.upload.limit")}
          >
            <Input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("documents.field.versionNote")}
            optional={t("common.optional")}
            error={errors.note}
          >
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            disabled={!file || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("documents.upload.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDetailDialog({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [downloading, setDownloading] = useState<string | null>(null);
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

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[900px] [&>button]:hidden">
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
          <DocumentDetailBody
            document={detail.data}
            downloading={downloading}
            onDownload={(version) => void handleDownload(version)}
          />
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
  downloading,
  onDownload,
}: {
  document: DocumentDetail;
  downloading: string | null;
  onDownload: (version: DocumentVersion) => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            className="sm:col-span-2 lg:col-span-3"
          />
        )}
        {document.status === "ARCHIVED" && (
          <ReadField
            label={t("documents.field.archiveReason")}
            value={document.archive_reason}
            className="sm:col-span-2 lg:col-span-3"
          />
        )}
      </div>

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
                <TableHead>{t("documents.field.sha256")}</TableHead>
                <TableHead>{t("documents.field.createdAt")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.versions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("documents.versions.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                document.versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="font-medium tabular-nums">
                      v{version.version_number}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[220px] truncate" title={version.original_name}>
                        {version.original_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(version.byte_size)}
                        {version.note ? ` - ${version.note}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>{version.uploaded_by_name ?? t("common.emptyValue")}</TableCell>
                    <TableCell>
                      <code className="block max-w-[170px] truncate text-xs" title={version.sha256}>
                        {version.sha256}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {df.dateTime(version.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("documents.download")}
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
  onClose,
}: {
  categories: DocumentCategory[];
  subcategories: DocumentSubcategory[];
  isLoading: boolean;
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[980px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("documents.taxonomy.title")}</DialogTitle>
          <DialogDescription>{t("documents.taxonomy.description")}</DialogDescription>
        </DialogHeader>

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
          <div className="grid min-h-[380px] gap-6 lg:grid-cols-2">
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <TypeBadge label={String(rows.length)} />
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
      <div className="max-h-[420px] overflow-y-auto rounded-md border">
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

function CategoryForm({
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
      isValid={Boolean(code.trim() && name.trim())}
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
      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 sm:col-span-2">
        <div>
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
      isValid={Boolean(category && code.trim() && name.trim())}
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
      <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 sm:col-span-2">
        <div>
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
  isValid,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  isPending: boolean;
  isValid: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <section className="space-y-5 py-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" size="sm" disabled={isPending} onClick={onCancel}>
          <X className="h-4 w-4" />
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={!isValid || isPending} onClick={onSubmit}>
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
