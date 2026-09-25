"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck2,
  FileQuestion,
  FileImage,
  FileText,
  Loader2,
  MapPin,
  PenTool,
  Video,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { AdvancedTechnicalSettings } from "@/components/shared/advanced-technical-settings";
import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import {
  EVIDENCE_KINDS,
  type EvidenceAsset,
  type EvidenceRevisionAction,
} from "@/interfaces/evidence";
import { useDateFormat } from "@/lib/dates";
import {
  getEvidenceAssets,
  getEvidenceRevisions,
  reviseEvidence,
  verifyEvidenceIntegrity,
} from "@/services/evidence.service";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { getProjects } from "@/services/contractor.service";

export function EvidenceArchive() {
  const t = useTranslations();
  const df = useDateFormat();
  const list = useListQuery([
    "kind",
    "has_gps",
    "captured_from",
    "captured_to",
    "project",
    "category",
  ]);
  const [viewing, setViewing] = useState<EvidenceAsset | null>(null);
  const selectedProject = list.filters.project ?? "";

  const projects = useQuery({
    queryKey: ["projects", "evidence-filter"],
    queryFn: () => getProjects({ page_size: 200, sort_by: "name" }),
    staleTime: 60_000,
  });
  const categories = useQuery({
    queryKey: ["project-categories", "evidence-filter", selectedProject],
    queryFn: () => getProjectCategories({
      project: selectedProject,
      page_size: 500,
      sort_by: "sort_order",
    }),
    enabled: Boolean(selectedProject),
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["evidence", list.query],
    queryFn: () => getEvidenceAssets(list.query),
  });

  const columns = useMemo<ColumnDef<EvidenceAsset, unknown>[]>(
    () => [
      {
        accessorKey: "original_filename",
        meta: { label: t("evidence.field.file") },
        header: () => t("evidence.field.file"),
        cell: ({ row }) => (
          <div className="flex min-w-[190px] items-center gap-2.5">
            <EvidenceFileIcon kind={row.original.kind} />
            <div className="min-w-0">
              <p
                className="max-w-[240px] truncate font-medium text-foreground"
                title={row.original.original_filename}
              >
                {row.original.original_filename}
              </p>
              <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                {row.original.content_type || t("common.emptyValue")}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "kind",
        meta: { label: t("evidence.field.kind") },
        header: ({ column }) => (
          <SortableHeader
            label={t("evidence.field.kind")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <TypeBadge label={t(`evidence.kind.${row.original.kind}`)} />
        ),
      },
      {
        id: "source",
        meta: { label: t("evidence.field.source") },
        header: () => t("evidence.field.source"),
        cell: ({ row }) => (
          <div className="min-w-[150px]">
            <p className="max-w-[210px] truncate text-sm">
              {row.original.source_model}
            </p>
            <p
              className="max-w-[210px] truncate font-mono text-xs text-muted-foreground"
              title={row.original.source_id}
            >
              {row.original.source_id}
            </p>
          </div>
        ),
      },
      {
        id: "context",
        meta: { label: t("evidence.field.context") },
        header: () => t("evidence.field.context"),
        cell: ({ row }) => (
          <div className="min-w-[150px]">
            <p className="max-w-[220px] truncate">
              {row.original.project_name ?? row.original.company_name}
            </p>
            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
              {row.original.archive_category_path.length
                ? row.original.archive_category_path.map((item) => item.name).join(" / ")
                : row.original.actor_name ?? t("common.emptyValue")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "captured_at",
        meta: { label: t("evidence.field.capturedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("evidence.field.capturedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {df.precise(row.original.captured_at)}
          </span>
        ),
      },
      {
        accessorKey: "uploaded_at",
        meta: { label: t("evidence.field.uploadedAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("evidence.field.uploadedAt")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {df.precise(row.original.uploaded_at)}
          </span>
        ),
      },
      {
        id: "gps",
        meta: { label: t("evidence.field.gps") },
        header: () => t("evidence.field.gps"),
        cell: ({ row }) =>
          hasGps(row.original) ? (
            <div
              className="flex min-w-[145px] items-center gap-1.5 text-xs tabular-nums"
              title={`${row.original.latitude}, ${row.original.longitude}`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-success" />
              <span className="truncate">
                {row.original.latitude}, {row.original.longitude}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("common.emptyValue")}
            </span>
          ),
      },
      {
        accessorKey: "sha256",
        meta: { label: t("evidence.field.sha256") },
        header: () => t("evidence.field.sha256"),
        cell: ({ row }) => (
          <code
            className="block max-w-[130px] truncate font-mono text-xs text-muted-foreground"
            title={row.original.sha256}
          >
            {row.original.sha256}
          </code>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary hover:bg-primary/10"
            title={t("evidence.action.view")}
            onClick={() => setViewing(row.original)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [df, t],
  );

  const total = query.data?.count ?? 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("evidence.title")}
        subtitle={
          query.isLoading
            ? t("common.loading")
            : t("evidence.count", { count: total })
        }
      />

      <div className="flex flex-wrap items-end gap-3 border-y bg-card/50 py-3">
        <div className="w-full space-y-1 sm:w-[220px]">
          <Label className="text-xs text-muted-foreground">{t("evidence.filter.project")}</Label>
          <Select
            value={selectedProject || "all"}
            onValueChange={(value) => {
              list.setFilters({
                project: value === "all" ? undefined : value,
                category: undefined,
              });
            }}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(projects.data?.results ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.code} - {project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <QueryFailedNote query={projects} what={t("evidence.what.projects")} />
        </div>
        <div className="w-full space-y-1 sm:w-[220px]">
          <Label className="text-xs text-muted-foreground">{t("evidence.filter.category")}</Label>
          <Select
            disabled={!selectedProject}
            value={list.filters.category || "all"}
            onValueChange={(value) => list.setFilter("category", value === "all" ? undefined : value)}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder={t("evidence.filter.chooseCategory")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(categories.data?.results ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.code} - {category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <QueryFailedNote query={categories} what={t("evidence.what.categories")} />
        </div>
        <DateFilter
          label={t("evidence.filter.capturedFrom")}
          value={list.filters.captured_from ?? ""}
          onChange={(value) =>
            list.setFilter("captured_from", value || undefined)
          }
        />
        <DateFilter
          label={t("evidence.filter.capturedTo")}
          value={list.filters.captured_to ?? ""}
          onChange={(value) =>
            list.setFilter("captured_to", value || undefined)
          }
        />
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={query.isLoading}
        isError={query.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="evidence-archive"
        filterPills={[
          {
            key: "all",
            label: t("common.all"),
            active: !list.hasFilters,
            onSelect: list.clearFilters,
          },
          ...EVIDENCE_KINDS.map((kind) => ({
            key: kind,
            label: t(`evidence.kind.${kind}`),
            active: list.filters.kind === kind,
            onSelect: () => list.setFilter("kind", kind),
          })),
          {
            key: "gps",
            label: t("evidence.filter.withGps"),
            active: list.filters.has_gps === "true",
            onSelect: () => list.setFilter("has_gps", "true"),
          },
          {
            key: "no-gps",
            label: t("evidence.filter.withoutGps"),
            active: list.filters.has_gps === "false",
            onSelect: () => list.setFilter("has_gps", "false"),
          },
        ]}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />

      {viewing && (
        <EvidenceDialog asset={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="date"
        className="w-full sm:w-[180px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function EvidenceDialog({
  asset,
  onClose,
}: {
  asset: EvidenceAsset;
  onClose: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const formatter = useFormatter();
  const integrity = useMutation({
    mutationFn: () => verifyEvidenceIntegrity(asset.id),
  });
  const metadata = Object.entries(asset.metadata ?? {});
  const watermark = Object.entries(asset.watermark ?? {});

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2 pr-8">
            <EvidenceFileIcon kind={asset.kind} />
            <span className="truncate">{asset.original_filename}</span>
          </DialogTitle>
          <DialogDescription>
            {asset.source_model}:{asset.source_id}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[70dvh] space-y-6 overflow-y-auto px-1">
          {asset.kind === "PHOTO" && (asset.watermarked_file || asset.file) && (
            <div className="relative aspect-[16/7] overflow-hidden rounded-md border bg-muted/40">
              <Image
                src={asset.watermarked_file || asset.file}
                alt={asset.original_filename}
                fill
                sizes="(max-width: 768px) 100vw, 800px"
                className="object-contain"
                unoptimized
              />
            </div>
          )}

          <DetailSection title={t("evidence.section.record")}>
            <Detail label={t("evidence.field.kind")}>
              <TypeBadge label={t(`evidence.kind.${asset.kind}`)} />
            </Detail>
            <Detail label={t("evidence.field.company")} value={asset.company_name} />
            <Detail
              label={t("evidence.field.project")}
              value={asset.project_name ?? t("common.emptyValue")}
            />
            <Detail
              label={t("evidence.field.archiveCategory")}
              value={asset.archive_category_path.length
                ? asset.archive_category_path.map((item) => item.name).join(" / ")
                : t("common.emptyValue")}
            />
            <Detail
              label={t("evidence.field.actor")}
              value={asset.actor_name ?? t("common.emptyValue")}
            />
            <Detail label={t("evidence.field.sourceModel")} value={asset.source_model} />
            <Detail label={t("evidence.field.sourceId")} mono value={asset.source_id} />
            <Detail label={t("evidence.field.fieldName")} value={asset.field_name} />
            <Detail
              label={t("evidence.field.supersedes")}
              mono
              value={asset.supersedes ?? t("common.emptyValue")}
            />
          </DetailSection>

          <DetailSection title={t("evidence.section.capture")}>
            <Detail
              label={t("evidence.field.capturedAt")}
              value={df.precise(asset.captured_at)}
            />
            <Detail
              label={t("evidence.field.uploadedAt")}
              value={df.precise(asset.uploaded_at)}
            />
            <Detail
              label={t("evidence.field.deviceId")}
              mono
              value={asset.device_id || t("common.emptyValue")}
            />
            <Detail
              label={t("evidence.field.gps")}
              value={
                hasGps(asset)
                  ? `${asset.latitude}, ${asset.longitude}`
                  : t("common.emptyValue")
              }
            />
            <Detail
              className="sm:col-span-2"
              label={t("evidence.field.watermarkText")}
              value={asset.watermark_text || t("common.emptyValue")}
            />
          </DetailSection>

          <DetailSection title={t("evidence.section.file")}>
            <Detail label={t("evidence.field.contentType")} value={asset.content_type} />
            <Detail
              label={t("evidence.field.size")}
              value={formatBytes(asset.size_bytes, formatter.number)}
            />
            <Detail
              className="sm:col-span-2"
              label={t("evidence.field.sha256")}
              mono
              value={asset.sha256}
            />
          </DetailSection>

          <section className="space-y-3" aria-labelledby="evidence-integrity">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3
                id="evidence-integrity"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {t("evidence.section.integrity")}
              </h3>
              <Button
                size="sm"
                variant="outline"
                disabled={integrity.isPending}
                onClick={() => integrity.mutate()}
              >
                {integrity.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck2 className="h-4 w-4" />
                )}
                {t("evidence.action.verify")}
              </Button>
            </div>

            {integrity.isError && (
              <p className="border-y py-4 text-sm text-destructive">
                {t("evidence.integrity.error")}
              </p>
            )}

            {integrity.data && (
              <div className="space-y-4 border-y py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    label={t(
                      integrity.data.valid
                        ? "evidence.integrity.valid"
                        : "evidence.integrity.invalid",
                    )}
                    tone={integrity.data.valid ? "positive" : "danger"}
                  />
                  <span className="text-xs text-muted-foreground">
                    {t("evidence.integrity.verifiedAt", {
                      value: df.precise(integrity.data.verified_at),
                    })}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <IntegrityCheck
                    label={t("evidence.integrity.hash")}
                    matches={integrity.data.hash_matches}
                  />
                  <IntegrityCheck
                    label={t("evidence.integrity.size")}
                    matches={integrity.data.size_matches}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail
                    label={t("evidence.integrity.storedHash")}
                    mono
                    value={integrity.data.stored_sha256}
                  />
                  <Detail
                    label={t("evidence.integrity.currentHash")}
                    mono
                    value={integrity.data.current_sha256}
                  />
                  <Detail
                    label={t("evidence.integrity.storedSize")}
                    value={formatBytes(
                      integrity.data.stored_size_bytes,
                      formatter.number,
                    )}
                  />
                  <Detail
                    label={t("evidence.integrity.currentSize")}
                    value={formatBytes(
                      integrity.data.current_size_bytes,
                      formatter.number,
                    )}
                  />
                </div>
              </div>
            )}
          </section>

          {(watermark.length > 0 || metadata.length > 0) && (
            <div className="grid gap-5 lg:grid-cols-2">
              {watermark.length > 0 && (
                <JsonSection
                  title={t("evidence.section.watermark")}
                  value={asset.watermark}
                />
              )}
              {metadata.length > 0 && (
                <JsonSection
                  title={t("evidence.section.metadata")}
                  value={asset.metadata}
                />
              )}
            </div>
          )}
          <RevisionHistory asset={asset} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button asChild>
            <a href={asset.file} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t("evidence.action.openOriginal")}
            </a>
          </Button>
          {asset.watermarked_file && (
            <Button asChild>
              <a href={asset.watermarked_file} target="_blank" rel="noreferrer">
                <FileImage className="h-4 w-4" />
                {t("evidence.action.openWatermarked")}
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const REVISION_ACTIONS: EvidenceRevisionAction[] = [
  "HIDE",
  "RESTORE",
  "REPLACE",
  "CORRECT",
];

/**
 * The decisions taken about one piece of evidence, and the form to add one.
 *
 * Nothing here edits the asset. It cannot be edited - its hash is the whole
 * reason it is worth anything in a dispute - so a decision about it is a
 * separate, equally permanent record laid on top: hidden, restored, replaced
 * by a named asset, or corrected. Two consequences shape this panel:
 *
 * * the reason is required, because an unexplained withdrawal leaves the
 *   archive saying a photo was pulled with nobody accountable for pulling it;
 * * REPLACE needs the asset that supersedes it, so that field appears only
 *   for REPLACE and the save button waits for it. The backend refuses a
 *   REPLACE without one, and offering a button that cannot succeed is the
 *   failure this whole review exists to remove.
 */
function RevisionHistory({ asset }: { asset: EvidenceAsset }) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [action, setAction] = useState<EvidenceRevisionAction>("HIDE");
  const [reason, setReason] = useState("");
  const [replacement, setReplacement] = useState("");

  const key = ["evidence-revisions", asset.id];
  const rows = useQuery({
    queryKey: key,
    queryFn: () => getEvidenceRevisions(asset.id),
  });

  const needsReplacement = action === "REPLACE";
  const save = useMutation({
    mutationFn: () =>
      reviseEvidence(asset.id, {
        action,
        reason: reason.trim(),
        ...(needsReplacement ? { replacement: replacement.trim() } : {}),
      }),
    onSuccess: async () => {
      setReason("");
      setReplacement("");
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ["evidence-assets"] });
    },
  });

  return (
    <section className="rounded-lg border">
      <p className="border-b px-4 py-2.5 text-sm font-medium">
        {t("evidence.revision.title")}
      </p>

      {rows.isLoading ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : rows.isError ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="text-sm text-destructive">
            {t("evidence.revision.loadError")}
          </p>
          <Button size="sm" variant="outline" onClick={() => void rows.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : !(rows.data?.results ?? []).length ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {t("evidence.revision.empty")}
        </p>
      ) : (
        <ul className="max-h-56 divide-y overflow-y-auto">
          {(rows.data?.results ?? []).map((row) => (
            <li key={row.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={t(`evidence.revision.action.${row.action}`)}
                  tone={row.action === "RESTORE" ? "positive" : "warning"}
                />
                <span className="text-xs text-muted-foreground">
                  {row.actor_name || "-"} · {df.dateTime(row.created_at)}
                </span>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{row.reason}</p>
              {row.replacement_filename && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("evidence.revision.replacedBy", {
                    name: row.replacement_filename,
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {can("evidence.manage") && (
        <div className="grid gap-3 border-t p-4">
          <FieldWrapper label={t("evidence.revision.field.action")}>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={action}
              onChange={(event) =>
                setAction(event.target.value as EvidenceRevisionAction)
              }
            >
              {REVISION_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`evidence.revision.action.${value}`)}
                </option>
              ))}
            </select>
          </FieldWrapper>

          {needsReplacement && (
            <FieldWrapper
              label={t("evidence.revision.field.replacement")} required={needsReplacement}
              hint={t("evidence.revision.field.replacementHint")}
            >
              <Input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
              />
            </FieldWrapper>
          )}

          <FieldWrapper
            label={t("evidence.revision.field.reason")} required
            hint={t("evidence.revision.field.reasonHint")}
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FieldWrapper>

          <div className="flex justify-end">
            <Button
              size="sm"
              requires={[[reason, t("evidence.revision.field.reason")], [!needsReplacement || replacement, t("evidence.revision.field.replacement")]]}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t("evidence.revision.submit")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function Detail({
  label,
  value,
  children,
  mono = false,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div
        className={`mt-1 break-words text-sm ${mono ? "break-all font-mono text-xs" : ""}`}
      >
        {children ?? value}
      </div>
    </div>
  );
}

function JsonSection({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown>;
}) {
  return (
    <AdvancedTechnicalSettings title={title}>
      <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed sm:col-span-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </AdvancedTechnicalSettings>
  );
}

function IntegrityCheck({
  label,
  matches,
}: {
  label: string;
  matches: boolean;
}) {
  const t = useTranslations();
  const Icon = matches ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        className={`h-4 w-4 ${matches ? "text-success" : "text-destructive"}`}
      />
      <span>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {t(matches ? "evidence.integrity.match" : "evidence.integrity.mismatch")}
      </span>
    </div>
  );
}

function EvidenceFileIcon({ kind }: { kind: EvidenceAsset["kind"] }) {
  const Icon =
    kind === "PHOTO"
      ? FileImage
      : kind === "VIDEO"
        ? Video
        : kind === "SIGNATURE"
          ? PenTool
          : kind === "DOCUMENT"
            ? FileText
            : FileQuestion;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function hasGps(asset: EvidenceAsset): boolean {
  return asset.latitude !== null && asset.longitude !== null;
}

function formatBytes(
  value: number,
  formatNumber: (value: number) => string,
): string {
  if (value < 1024) return `${formatNumber(value)} B`;
  if (value < 1024 ** 2) return `${formatNumber(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${formatNumber(value / 1024 ** 2)} MB`;
  return `${formatNumber(value / 1024 ** 3)} GB`;
}
