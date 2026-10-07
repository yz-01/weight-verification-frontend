"use client";

/**
 * 项目进度摘要 (2026-10 B17): a page about the project that the project
 * manager arranges himself.
 *
 * A summary is an ordered list of blocks - text, a group of progress
 * photographs, a number card, a small bar or line chart with figures typed
 * in by hand. He adds and removes them, drags them (or uses up / down) into
 * the order he wants, and that order is what everybody sees. Nothing is
 * required but a title. Written with `progress.confirm` (project manager),
 * read by everybody who can read progress.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  GripVertical,
  Hash,
  Images,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Fragment, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  PhotoGrid,
  PhotoTile,
  ProgressPhotoPicker,
  usePhotoViewer,
} from "@/components/progress/progress-photos";
import { useAuth } from "@/components/providers/auth-provider";
import { ProjectListFilter } from "@/components/shared/module-records-table";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type {
  ProgressPhoto,
  ProgressSummary,
  SummaryBlock,
  SummaryBlockType,
  SummaryChartBlock,
  SummaryNumberBlock,
  SummaryPhotosBlock,
} from "@/interfaces/progress-reports";
import { useDateFormat } from "@/lib/dates";
import {
  SUMMARY_BLOCK_TYPES,
  blocksForSave,
  chartData,
  moveBlock,
  moveBlockTo,
  newBlock,
  removeBlock,
  replaceBlock,
} from "@/lib/progress-summary-blocks";
import { cn } from "@/lib/utils";
import {
  createProgressSummary,
  deleteProgressSummary,
  getProgressSummaries,
  updateProgressSummary,
} from "@/services/progress-reports.service";

const BLOCK_ICON: Record<SummaryBlockType, typeof Type> = {
  text: Type,
  photos: Images,
  number: Hash,
  chart: BarChart3,
};

export function ProgressSummaryTab() {
  const t = useTranslations("progressPage.summary");
  const tPage = useTranslations("progressPage");
  const df = useDateFormat();
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const list = useListQuery(["project"]);
  const project = list.filters.project ?? "";
  const summaries = useQuery({
    queryKey: ["progress-summaries", project],
    queryFn: () => getProgressSummaries({ project: project || undefined, page_size: 100 }),
  });
  const rows = summaries.data?.results ?? [];
  const chosenId = params.get("summary");
  const shown = rows.find((row) => row.id === chosenId) ?? rows[0] ?? null;
  const [editing, setEditing] = useState<ProgressSummary | "new" | null>(null);
  const canWrite = can("progress.confirm");
  const choose = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("summary", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (editing) {
    return (
      <SummaryEditor
        project={editing === "new" ? project : editing.project}
        summary={editing === "new" ? undefined : editing}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          if (saved) choose(saved.id);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ProjectListFilter list={list} />
        {canWrite && (
          <Button
            size="sm"
            className="ml-auto rounded-full px-4"
            onClick={() => setEditing("new")}
          >
            <Plus />
            {t("new")}
          </Button>
        )}
      </div>
      <QueryFailedNote query={summaries} what={tPage("tabs.summary")} />
      {summaries.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {summaries.isError ? "—" : t("empty")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label={tPage("tabs.summary")} className="flex gap-1 overflow-x-auto lg:flex-col">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => choose(row.id)}
                aria-current={shown?.id === row.id ? "true" : undefined}
                className={cn(
                  "min-w-[160px] rounded-md border px-3 py-2 text-left text-sm lg:min-w-0",
                  shown?.id === row.id ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50",
                )}
              >
                <span className="block truncate font-medium">{row.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {project ? df.date(row.updated_at) : `${row.project_name} · ${df.date(row.updated_at)}`}
                </span>
              </button>
            ))}
          </nav>
          {shown && (
            <article className="min-w-0 space-y-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{shown.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t("updated", {
                      time: df.dateTime(shown.updated_at),
                      name: shown.updated_by_name ?? shown.author_name ?? "—",
                    })}
                  </p>
                </div>
                {canWrite && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(shown)}>
                    <Pencil />
                    {t("edit")}
                  </Button>
                )}
              </header>
              <SummaryBlocksView summary={shown} />
            </article>
          )}
        </div>
      )}
    </div>
  );
}

/** A summary as everybody reads it: its blocks, in the order saved. */
export function SummaryBlocksView({ summary }: { summary: ProgressSummary }) {
  const t = useTranslations("progressPage.summary");
  if (summary.blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noBlocks")}</p>;
  }
  // Number cards side by side; everything else full width.
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summary.blocks.map((block) => (
        <div
          key={block.id}
          data-block={block.type}
          className={block.type === "number" ? undefined : "sm:col-span-2 xl:col-span-4"}
        >
          <BlockView block={block} reference={summary.title} />
        </div>
      ))}
    </div>
  );
}

function BlockView({ block, reference }: { block: SummaryBlock; reference: string }) {
  switch (block.type) {
    case "text":
      return block.text ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.text}</p>
      ) : null;
    case "number":
      return <NumberCard block={block} />;
    case "chart":
      return <SummaryChart block={block} />;
    case "photos":
      return <PhotoGroup block={block} reference={reference} />;
  }
}

function NumberCard({ block }: { block: SummaryNumberBlock }) {
  return (
    <section className="h-full rounded-lg border bg-card px-4 py-3 shadow-sm">
      <p className="truncate text-xs text-muted-foreground">{block.label || "—"}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-3xl font-semibold text-foreground">{block.value || "—"}</span>
        {block.unit && <span className="text-sm text-muted-foreground">{block.unit}</span>}
      </p>
      {block.note && <p className="mt-1 text-xs text-muted-foreground">{block.note}</p>}
    </section>
  );
}

function PhotoGroup({ block, reference }: { block: SummaryPhotosBlock; reference: string }) {
  const t = useTranslations("progressPage.summary");
  const photos = block.photos ?? [];
  const viewer = usePhotoViewer(photos, reference);
  return (
    <section className="space-y-2">
      {block.caption && <h3 className="text-sm font-medium">{block.caption}</h3>}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>
      ) : (
        <PhotoGrid>
          {photos.map((photo, index) => (
            <PhotoTile key={photo.id} photo={photo} onOpen={() => viewer.open(index)} />
          ))}
        </PhotoGrid>
      )}
      {viewer.viewer}
    </section>
  );
}

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize: "0.8125rem",
  color: "var(--popover-foreground)",
};

/** A bar or line chart of the figures typed into the block. */
export function SummaryChart({ block }: { block: SummaryChartBlock }) {
  const t = useTranslations("progressPage.summary");
  const data = chartData(block);
  const name = block.series || t("value");
  return (
    <section className="surface-panel rounded-xl p-3">
      {block.title && <h3 className="mb-2 text-sm font-medium">{block.title}</h3>}
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("chartEmpty")}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {block.chart === "line" ? (
              <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={name}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--chart-1)" }}
                >
                  <LabelList dataKey="value" position="top" style={{ fill: "var(--foreground)", fontSize: 11 }} />
                </Line>
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" name={name} fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fill: "var(--foreground)", fontSize: 11 }} />
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/**
 * Build or rearrange a summary: add, remove, drag or step blocks, then save.
 * Exported for the reorder test.
 */
export function SummaryEditor({
  project: initialProject,
  summary,
  onCancel,
  onSaved,
}: {
  project: string;
  summary?: ProgressSummary;
  onCancel: () => void;
  onSaved: (summary: ProgressSummary | null) => void;
}) {
  const t = useTranslations("progressPage.summary");
  const tPage = useTranslations("progressPage");
  const qc = useQueryClient();
  const [project, setProject] = useState(summary?.project ?? initialProject);
  const [title, setTitle] = useState(summary?.title ?? "");
  const [blocks, setBlocks] = useState<SummaryBlock[]>(summary?.blocks ?? []);
  const [dragging, setDragging] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), blocks: blocksForSave(blocks) };
      return summary
        ? updateProgressSummary(summary.id, payload)
        : createProgressSummary({ ...payload, project });
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["progress-summaries"] });
      onSaved(saved);
    },
  });
  const [removeArmed, setRemoveArmed] = useState(false);
  const [refusal, setRefusal] = useState("");
  const removal = useMutation({
    mutationFn: () => deleteProgressSummary(summary!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["progress-summaries"] });
      onSaved(null);
    },
    onError: (error) =>
      setRefusal(error instanceof ApiError ? error.message : tPage("removeFailed")),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldWrapper label={tPage("project")} required>
          {summary ? (
            <p className="py-2 text-sm font-medium">{summary.project_name}</p>
          ) : (
            <ProjectPicker
              value={project}
              onValueChange={(next) => {
                setProject(next);
                // A photo group holds one project's photographs.
                setBlocks((current) =>
                  current.map((block) =>
                    block.type === "photos" ? { ...block, photo_ids: [], photos: [] } : block,
                  ),
                );
              }}
              placeholder={tPage("chooseProject")}
            />
          )}
        </FieldWrapper>
        <FieldWrapper label={t("title")} required>
          <Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </FieldWrapper>
      </div>

      {blocks.length === 0 && (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          {t("noBlocksYet")}
        </p>
      )}
      <ol className="space-y-3" aria-label={t("blocks")}>
        {blocks.map((block, index) => {
          const Icon = BLOCK_ICON[block.type];
          return (
            <li
              key={block.id}
              data-block-editor={block.type}
              draggable
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) setBlocks((current) => moveBlockTo(current, dragging, index));
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={cn(
                "surface-panel rounded-xl",
                dragging === index && "opacity-50",
              )}
            >
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                <GripVertical
                  className="size-4 cursor-grab text-muted-foreground"
                  aria-label={t("drag")}
                />
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t(`type.${block.type}`)}</span>
                <div className="ml-auto flex items-center gap-0.5">
                  {/* The first has no 上移 and the last no 下移: absent, not grey. */}
                  {index > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={t("moveUp")}
                      title={t("moveUp")}
                      onClick={() => setBlocks((current) => moveBlock(current, index, -1))}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="size-7" />
                  )}
                  {index < blocks.length - 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={t("moveDown")}
                      title={t("moveDown")}
                      onClick={() => setBlocks((current) => moveBlock(current, index, 1))}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="size-7" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    aria-label={t("removeBlock")}
                    title={t("removeBlock")}
                    onClick={() => setBlocks((current) => removeBlock(current, block.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="p-3">
                <BlockFields
                  block={block}
                  project={project}
                  onChange={(next) => setBlocks((current) => replaceBlock(current, next))}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("addBlock")}</span>
        {SUMMARY_BLOCK_TYPES.map((type) => {
          const Icon = BLOCK_ICON[type];
          return (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => setBlocks((current) => [...current, newBlock(type)])}
            >
              <Icon />
              {t(`type.${type}`)}
            </Button>
          );
        })}
      </div>

      {summary && (
        <div className="space-y-2 rounded-md border border-destructive/20 p-3">
          <label className="flex items-start gap-3">
            <Switch
              checked={removeArmed}
              onCheckedChange={(next) => {
                setRemoveArmed(next);
                setRefusal("");
              }}
              aria-label={t("remove.switch")}
            />
            <span>
              <span className="block text-sm font-medium">{t("remove.switch")}</span>
              <span className="block text-xs text-muted-foreground">{t("remove.hint")}</span>
            </span>
          </label>
          {removeArmed && (
            <Button
              variant="destructive"
              className="w-full"
              disabled={removal.isPending || save.isPending}
              onClick={() => removal.mutate()}
            >
              {removal.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t("remove.confirm")}
            </Button>
          )}
          {refusal && (
            <p role="alert" className="text-sm text-destructive">
              {refusal}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onCancel}>
          {tPage("cancel")}
        </Button>
        <Button
          requires={[
            [project, tPage("project")],
            [title.trim(), t("title")],
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {tPage("save")}
        </Button>
      </div>
    </div>
  );
}

/** The fields of one block, by its type. Every one may stay empty. */
function BlockFields({
  block,
  project,
  onChange,
}: {
  block: SummaryBlock;
  project: string;
  onChange: (block: SummaryBlock) => void;
}) {
  const t = useTranslations("progressPage.summary");
  const [picking, setPicking] = useState(false);
  switch (block.type) {
    case "text":
      return (
        <Textarea
          rows={4}
          aria-label={t("type.text")}
          placeholder={t("textPlaceholder")}
          value={block.text}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
        />
      );
    case "number":
      return (
        <div className="grid gap-2 sm:grid-cols-4">
          <FieldWrapper label={t("label")}>
            <Input value={block.label} maxLength={120} onChange={(event) => onChange({ ...block, label: event.target.value })} />
          </FieldWrapper>
          <FieldWrapper label={t("number")}>
            <Input value={block.value} maxLength={40} onChange={(event) => onChange({ ...block, value: event.target.value })} />
          </FieldWrapper>
          <FieldWrapper label={t("unit")}>
            <Input value={block.unit} maxLength={20} onChange={(event) => onChange({ ...block, unit: event.target.value })} />
          </FieldWrapper>
          <FieldWrapper label={t("note")}>
            <Input value={block.note} maxLength={200} onChange={(event) => onChange({ ...block, note: event.target.value })} />
          </FieldWrapper>
        </div>
      );
    case "chart":
      return <ChartFields block={block} onChange={onChange} />;
    case "photos": {
      const photos = block.photos ?? [];
      const setPhotos = (next: ProgressPhoto[]) =>
        onChange({ ...block, photos: next, photo_ids: next.map((photo) => photo.id) });
      return (
        <div className="space-y-2">
          <FieldWrapper label={t("caption")}>
            <Input value={block.caption} maxLength={200} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
          </FieldWrapper>
          {photos.length > 0 && (
            <PhotoGrid>
              {photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  selected
                  onToggle={() => setPhotos(photos.filter((row) => row.id !== photo.id))}
                  toggleLabel={t("unpickPhoto")}
                />
              ))}
            </PhotoGrid>
          )}
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Images />
            {t("pickPhotos")}
          </Button>
          {picking && (
            <Dialog open onOpenChange={(open) => !open && setPicking(false)}>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{t("pickPhotos")}</DialogTitle>
                  <DialogDescription>{t("pickHelp")}</DialogDescription>
                </DialogHeader>
                <ProgressPhotoPicker project={project} selected={photos} onChange={setPhotos} />
                <DialogFooter>
                  <Button onClick={() => setPicking(false)}>{t("done")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      );
    }
  }
}

function ChartFields({
  block,
  onChange,
}: {
  block: SummaryChartBlock;
  onChange: (block: SummaryBlock) => void;
}) {
  const t = useTranslations("progressPage.summary");
  const setPoint = (index: number, key: "label" | "value", value: string) =>
    onChange({
      ...block,
      points: block.points.map((point, at) => (at === index ? { ...point, [key]: value } : point)),
    });
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <FieldWrapper label={t("chartKind")}>
          <div className="inline-flex rounded-md border p-0.5 text-xs" role="group">
            {(["bar", "line"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={block.chart === kind}
                onClick={() => onChange({ ...block, chart: kind })}
                className={cn(
                  "rounded px-2.5 py-1 font-medium",
                  block.chart === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`chart.${kind}`)}
              </button>
            ))}
          </div>
        </FieldWrapper>
        <FieldWrapper label={t("chartTitle")}>
          <Input value={block.title} maxLength={120} onChange={(event) => onChange({ ...block, title: event.target.value })} />
        </FieldWrapper>
        <FieldWrapper label={t("series")}>
          <Input value={block.series} maxLength={60} onChange={(event) => onChange({ ...block, series: event.target.value })} />
        </FieldWrapper>
      </div>
      <div className="grid max-w-md grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">{t("pointLabel")}</span>
        <span className="text-xs font-medium text-muted-foreground">{t("pointValue")}</span>
        <span />
        {block.points.map((point, index) => (
          <Fragment key={index}>
            <Input
              className="h-8"
              aria-label={t("pointLabel")}
              maxLength={40}
              value={point.label}
              onChange={(event) => setPoint(index, "label", event.target.value)}
            />
            <Input
              className="h-8"
              inputMode="decimal"
              aria-label={t("pointValue")}
              value={String(point.value ?? "")}
              onChange={(event) => setPoint(index, "value", event.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("removePoint")}
              title={t("removePoint")}
              onClick={() =>
                onChange({ ...block, points: block.points.filter((_, at) => at !== index) })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </Fragment>
        ))}
      </div>
      {block.points.length < 40 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...block, points: [...block.points, { label: "", value: "" }] })}
        >
          <Plus />
          {t("addPoint")}
        </Button>
      )}
      <SummaryChart block={block} />
    </div>
  );
}
