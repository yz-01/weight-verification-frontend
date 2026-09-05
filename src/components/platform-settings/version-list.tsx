"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Edit3, Loader2, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormat } from "@/lib/dates";
import {
  addChangelog,
  createVersion,
  getVersion,
  getVersions,
  setCurrentVersion,
  updateVersion,
  type AppVersion,
  type CreateVersionPayload,
  type VersionDetail,
} from "@/services/version.service";
import { LoadFailed } from "@/components/shared/page-primitives";

export function VersionList() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const versions = useQuery({
    queryKey: ["app-versions"],
    queryFn: getVersions,
  });
  const detail = useQuery({
    queryKey: ["app-version", editor.id],
    queryFn: () => getVersion(editor.id ?? ""),
    enabled: editor.open && Boolean(editor.id),
  });
  const current = useMutation({
    mutationFn: setCurrentVersion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-versions"] }),
  });

  const columns = useMemo<ColumnDef<AppVersion, unknown>[]>(
    () => [
      {
        accessorKey: "version",
        meta: { label: t("versions.field.version") },
        header: ({ column }) => (
          <SortableHeader
            label={t("versions.field.version")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <span className="font-medium tabular-nums">v{row.original.version}</span>,
      },
      {
        accessorKey: "release_name",
        meta: { label: t("versions.field.releaseName") },
        header: () => <span className="text-xs font-semibold uppercase text-muted-foreground">{t("versions.field.releaseName")}</span>,
        cell: ({ row }) => row.original.release_name || t("common.emptyValue"),
      },
      {
        accessorKey: "released_on",
        meta: { label: t("versions.field.releasedOn") },
        header: ({ column }) => (
          <SortableHeader
            label={t("versions.field.releasedOn")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <span className="text-muted-foreground">{df.date(row.original.released_on)}</span>,
      },
      {
        accessorKey: "rollout_percentage",
        meta: { label: t("versions.field.rollout") },
        header: () => <span className="text-xs font-semibold uppercase text-muted-foreground">{t("versions.field.rollout")}</span>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.rollout_percentage}%</span>,
      },
      {
        accessorKey: "is_current",
        meta: { label: t("versions.field.isCurrent") },
        header: () => <span className="text-xs font-semibold uppercase text-muted-foreground">{t("versions.field.isCurrent")}</span>,
        cell: ({ row }) => row.original.is_current ? (
          <StatusBadge label={t("versions.current")} tone="positive" />
        ) : row.original.force_update ? (
          <StatusBadge label={t("versions.forceUpdateOn")} tone="warning" />
        ) : null,
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            {!row.original.is_current && (
              <Button
                size="icon-sm"
                variant="ghost"
                title={t("versions.setCurrent")}
                disabled={current.isPending}
                onClick={() => current.mutate(row.original.id)}
              >
                <CheckCircle2 />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              title={t("common.edit")}
              onClick={() => setEditor({ open: true, id: row.original.id })}
            >
              <Edit3 />
            </Button>
          </div>
        ),
      },
    ],
    [current, df, t],
  );
  const rows = versions.data ?? [];

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("versions.title")}
        subtitle={versions.isLoading ? t("common.loading") : t("versions.count", { count: rows.length })}
        action={(
          <Button onClick={() => setEditor({ open: true, id: null })}>
            <Plus />
            {t("versions.create")}
          </Button>
        )}
      />
      <DataTable
        columns={columns}
        rows={rows}
        totalCount={rows.length}
        page={1}
        pageSize={rows.length || 20}
        isLoading={versions.isLoading}
        isError={versions.isError}
        hasFilters={false}
        search=""
        sortBy="released_on"
        sortOrder="desc"
        storageKey="app-versions"
        onSearchChange={() => undefined}
        onSortChange={() => undefined}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onClearFilters={() => undefined}
      />
      <Dialog
        open={editor.open}
        onOpenChange={(open) => {
          if (!open) setEditor({ open: false, id: null });
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {editor.id && detail.isError ? (
              <LoadFailed onRetry={() => void detail.refetch()} />
            ) : detail.isLoading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <VersionEditor
              key={`${editor.id ?? "new"}:${detail.data?.version ?? ""}`}
              initial={editor.id ? detail.data : undefined}
              onClose={() => setEditor({ open: false, id: null })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VersionEditor({
  initial,
  onClose,
}: {
  initial?: VersionDetail;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateVersionPayload & { is_active: boolean }>({
    version: initial?.version ?? "",
    release_name: initial?.release_name ?? "",
    release_notes: initial?.release_notes ?? "",
    release_notes_zh: initial?.release_notes_zh ?? "",
    release_notes_ms: initial?.release_notes_ms ?? "",
    released_on: initial?.released_on ?? new Date().toISOString().slice(0, 10),
    min_supported_version: initial?.min_supported_version ?? "",
    force_update: initial?.force_update ?? false,
    rollout_percentage: initial?.rollout_percentage ?? 100,
    is_active: initial?.is_active ?? true,
  });
  const [change, setChange] = useState({ module: "", change_type: "NEW", description: "" });
  const save = useMutation({
    mutationFn: () => initial
      ? updateVersion(initial.id, form)
      : createVersion(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["app-versions"] });
      onClose();
    },
  });
  const addChange = useMutation({
    mutationFn: () => addChangelog(initial?.id ?? "", { ...change, sort_order: initial?.changelog.length ?? 0 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["app-version", initial?.id] });
      setChange({ module: "", change_type: "NEW", description: "" });
    },
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(initial ? "versions.edit" : "versions.create")}</DialogTitle>
        <DialogDescription>{t("versions.editorSubtitle")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper label={t("versions.field.version")} required>
          <Input value={form.version} disabled={Boolean(initial)} onChange={(event) => set("version", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("versions.field.releaseName")}>
          <Input value={form.release_name} onChange={(event) => set("release_name", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("versions.field.releasedOn")} required>
          <Input type="date" value={form.released_on} disabled={Boolean(initial)} onChange={(event) => set("released_on", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("versions.field.minSupportedVersion")}>
          <Input value={form.min_supported_version} onChange={(event) => set("min_supported_version", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("versions.field.rollout")}>
          <Input type="number" min={0} max={100} value={form.rollout_percentage} onChange={(event) => set("rollout_percentage", Number(event.target.value))} />
        </FieldWrapper>
        <div className="flex items-end gap-6 pb-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={Boolean(form.force_update)} onCheckedChange={(checked) => set("force_update", checked)} />
            {t("versions.field.forceUpdate")}
          </label>
          {initial && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={form.is_active} onCheckedChange={(checked) => set("is_active", checked)} />
              {t("versions.field.active")}
            </label>
          )}
        </div>
        <FieldWrapper className="sm:col-span-2" label={t("versions.field.releaseNotes")} required>
          <Textarea rows={4} value={form.release_notes} onChange={(event) => set("release_notes", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("versions.field.releaseNotesZh")}>
          <Textarea rows={3} value={form.release_notes_zh} onChange={(event) => set("release_notes_zh", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("versions.field.releaseNotesMs")}>
          <Textarea rows={3} value={form.release_notes_ms} onChange={(event) => set("release_notes_ms", event.target.value)} />
        </FieldWrapper>
      </div>

      {initial && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">{t("versions.changelog")}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
            <Input placeholder={t("versions.changeModule")} value={change.module} onChange={(event) => setChange((current) => ({ ...current, module: event.target.value }))} />
            <select className="h-8 rounded-md border bg-background px-2 text-sm" value={change.change_type} onChange={(event) => setChange((current) => ({ ...current, change_type: event.target.value }))}>
              {["NEW", "IMPROVED", "FIXED", "REMOVED", "SECURITY"].map((type) => <option key={type} value={type}>{t(`versions.changeType.${type}`)}</option>)}
            </select>
          </div>
          <Textarea placeholder={t("versions.changeDescription")} value={change.description} onChange={(event) => setChange((current) => ({ ...current, description: event.target.value }))} />
          <Button variant="outline" requires={[[change.module, t("versions.changeModule")], [change.description, t("versions.changeDescription")]]}
                                    disabled={addChange.isPending} onClick={() => addChange.mutate()}>
            {addChange.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("versions.addChange")}
          </Button>
          {initial.changelog.map((entry) => (
            <div key={entry.id} className="grid gap-1 border-t py-2 text-sm sm:grid-cols-[120px_1fr]">
              <span className="font-medium">{t(`versions.changeType.${entry.change_type}`)}</span>
              <span>{entry.module}: {entry.description}</span>
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button requires={[[form.version, t("versions.field.version")], [form.release_notes, t("versions.field.releaseNotes")]]}
                disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("common.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
