"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileText,
  Inbox,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
import { useAuth } from "@/components/providers/auth-provider";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useOnProjectChange, usePageProject } from "@/components/providers/current-project-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import { EmptyState, FieldWrapper, FilterBar, ListHeader, LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shell } from "@/components/contractor-ops/package-shell";
import { useDateFormat } from "@/lib/dates";
import type {
  ArchiveRecordKind,
  EvidencePackageDetail,
  EvidencePackageRow,
  PackageItem,
  PackagePart,
  PackageSelection,
} from "@/interfaces/contractor-ops";
import {
  addPackageItems,
  confirmEvidencePackage,
  createEvidencePackage,
  deleteEvidencePackage,
  evidencePackageFile,
  previewEvidencePackage,
  downloadPackageItem,
  getEvidencePackage,
  getEvidencePackages,
  getPackageCandidates,
  getPackageRecordParts,
  removePackageItem,
  reorderPackageItems,
  sendPackageForReview,
  updateEvidencePackage,
  updatePackageItem,
} from "@/services/contractor-ops.service";

/**
 * Multi Engine - gather evidence from several columns into one PDF (T-235).
 *
 * Lucas 转述客户：「用来 export pdf 的，就是可以把文件整合在一起然后打包成 PDF」.
 *
 * ## This is not the archive queue
 *
 * 总栏目 (`archive-queue.tsx`) answers "what has nobody looked at yet", and
 * every record is in it whether anyone wants it or not. A package exists
 * because somebody deliberately chose these records - the choosing is the
 * content. Both list records; they mean completely different things, and
 * putting them on one screen would be the D-125 mistake again.
 *
 * ## A draft and a confirmed package are different objects
 *
 * A draft can be edited and deleted. A confirmed one cannot: it is the record
 * of why these documents were put together (D-138, D-142). So the screen never
 * draws an edit or delete control on a confirmed package and then refuses it -
 * it draws what is true for that package. `can_delete` and `can_return` come
 * from the server for exactly this reason.
 */

/** Columns a package can draw from. Attendance is a grouping, not a record. */
const KINDS: ArchiveRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "HAZARD",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
];

const PAGE_SIZE = 20;

export function MultiEngineWorkspace() {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const { can } = useAuth();
  // The top bar's 「当前项目」 (B13): 「Multi Engine 又要选一次项目」 was the
  // client's complaint, so the list is on it and has no project box.
  const [project, setProject] = usePageProject();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  // Page 1 of the next project, and the one open on the last project closes
  // (B13 audit #8).
  useOnProjectChange(project, () => {
    setPage(1);
    setOpenId(null);
  });
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ["evidence-packages", project, search, page],
    queryFn: () =>
      getEvidencePackages({
        project: project || undefined,
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
  });

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          can("package.manage") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <ProjectFilter
          value={project}
          onChange={(next) => {
            setProject(next);
            setPage(1);
          }}
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full sm:w-72"
        />
      </FilterBar>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("empty")} />
      ) : (
        <div className="surface-panel overflow-hidden rounded-xl">
          <Table className="min-w-[52rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.name")}</TableHead>
                <TableHead>{t("column.project")}</TableHead>
                <TableHead className="text-right tabular">{t("column.items")}</TableHead>
                <TableHead>{t("column.state")}</TableHead>
                <TableHead>{t("column.review")}</TableHead>
                <TableHead>{t("column.when")}</TableHead>
                <TableHead className="text-right">{t("column.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.name}
                    {row.remarks && (
                      <span className="block max-w-88 truncate text-xs font-normal text-muted-foreground">
                        {row.remarks}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.project_name}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {row.item_count}
                    {row.returned_count > 0 && (
                      <span className="ml-1.5 text-xs text-destructive">
                        {t("returnedCount", { count: row.returned_count })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(`state.${row.state}`)}
                      tone={row.state === "CONFIRMED" ? "positive" : "neutral"}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`review.${row.review_state}`)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatter.dateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(row.id)}
                    >
                      {t("open")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages: lastPage })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              disabledReason={t("firstPage")}
              onClick={() => setPage((current) => current - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= lastPage}
              disabledReason={t("lastPage")}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      )}

      {creating && (
        <NewPackageDialog
          onClose={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            setOpenId(row.id);
          }}
        />
      )}
      {openId && (
        <PackageSheet id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function NewPackageDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: EvidencePackageDetail) => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => createEvidencePackage({ project, name }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
      onCreated(row);
    },
  });

  return (
    <Shell title={t("newTitle")} onClose={onClose}>
      <div className="space-y-4 p-4">
        {/* The project is chosen once and cannot move afterwards, because the
            records inside come from this project's columns (D-143). Said here
            rather than discovered when adding a record is refused. */}
        <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("oneProjectHelp")}
        </p>
        <FieldWrapper label={t("field.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("field.selectProject")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.name")} required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("field.namePlaceholder")}
          />
        </FieldWrapper>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[
            [project, t("field.project")],
            [name.trim(), t("field.name")],
          ]}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {common("create")}
        </Button>
      </footer>
    </Shell>
  );
}

/**
 * One package, opened: its records, and what can still be done to it.
 *
 * Everything on this panel is decided by the package's own state rather than
 * by the person's role, because the state is what actually governs: a
 * confirmed package refuses edits from everyone, including the person who made
 * it.
 */
function PackageSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const formatter = useDateFormat();
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const [ticking, setTicking] = useState<PackageItem | null>(null);
  const [remarks, setRemarks] = useState("");
  const [consultant, setConsultant] = useState("");
  /*
   * `null` rather than `""` until somebody types: the box shows the package's
   * own name until then, and an empty string here would read as "the name was
   * cleared" and grey out Save on a box that visibly has text in it.
   */
  const [name, setName] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["evidence-packages", "detail", id],
    queryFn: () => getEvidencePackage(id),
  });
  const data = detail.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
  };

  const remove = useMutation({
    mutationFn: (item: string) => removePackageItem(id, item),
    onSuccess: refresh,
  });
  /*
   * The order the records appear in the merged PDF. Two buttons rather than
   * drag-and-drop: this is used on a laptop in a site office and occasionally
   * on a tablet, and a drag target that is a few pixels off is a reorder
   * nobody can undo once the package is confirmed.
   */
  const reorder = useMutation({
    mutationFn: (order: string[]) => reorderPackageItems(id, order),
    onSuccess: refresh,
  });

  const move = (index: number, delta: number) => {
    const order = (data?.items ?? []).map((entry) => entry.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    reorder.mutate(order);
  };
  /*
   * The name is typed in the create dialog, before the package contains
   * anything - so what it turned out to be is only known later. Without this
   * the only way to fix a name is to delete the package and pick every record
   * again, which is why the endpoint is reachable from here rather than from
   * nowhere.
   */
  const rename = useMutation({
    mutationFn: () => updateEvidencePackage(id, { name: (name ?? data?.name ?? "").trim() }),
    onSuccess: () => {
      setName(null);
      refresh();
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmEvidencePackage(id, remarks || data?.remarks || ""),
    onSuccess: refresh,
  });
  const send = useMutation({
    mutationFn: () => sendPackageForReview(id, consultant),
    onSuccess: refresh,
  });
  const drop = useMutation({
    mutationFn: () => deleteEvidencePackage(id),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const isDraft = data?.state === "DRAFT";

  return (
    <Shell title={data?.name ?? t("title")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : detail.isLoadingError || !data ? (
          <p role="alert" className="text-sm text-destructive">
            {t("failed")}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {data.project_name} · {t(`state.${data.state}`)} ·{" "}
              {t(`review.${data.review_state}`)} ·{" "}
              {formatter.dateTime(data.created_at)}
            </p>

            {data.merge_report.length > 0 && (
              /* Named, not counted. A package that quietly lost two pages is
                 handed on as complete (D-141). */
              <div
                role="alert"
                className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
              >
                <p className="font-medium">{t("mergeReportTitle")}</p>
                <ul className="list-inside list-disc text-xs">
                  {data.merge_report.map((note) => (
                    <li key={`${note.item_id}:${note.reason}`}>
                      {note.reference} — {t(`mergeReason.${note.reason}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <FieldWrapper label={t("field.records")} required={isDraft}>
              {data.items.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  {t("noItems")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.items.map((item, index) => (
                    <li key={item.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {item.reference || t(`kind.${item.record_kind}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(`kind.${item.record_kind}`)} ·{" "}
                            {t("partsSummary", {
                              fields: item.fields.length,
                              photos: item.photos.length,
                              documents: item.documents.length,
                              files: (item.files ?? []).length,
                            })}
                          </p>
                          {item.source_missing && (
                            <p className="text-xs text-destructive">
                              {t("sourceMissing")}
                            </p>
                          )}
                          {item.review_state === "RETURNED" && (
                            <p className="mt-1 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                              {t("returnedWithReason", {
                                reason: item.returned_reason,
                              })}
                            </p>
                          )}
                          {item.review_state === "ACCEPTED" && (
                            <p className="mt-1 text-xs text-primary">
                              {t("itemAccepted")}
                            </p>
                          )}
                        </div>
                        {isDraft && can("package.manage") && (
                          <div className="flex gap-2">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("moveUp")}
                              disabled={index === 0 || reorder.isPending}
                              disabledReason={t("alreadyFirst")}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("moveDown")}
                              disabled={
                                index === data.items.length - 1 || reorder.isPending
                              }
                              disabledReason={t("alreadyLast")}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTicking(item)}
                            >
                              {t("choose")}
                            </Button>
                            {/* One record on its own (T-348). 客户举例「DO 可以
                                直接 export」 - the whole bundle download below is
                                untouched; this is for the case where sending
                                forty pages and naming a page number was the only
                                way to hand over one delivery order. */}
                            <ExportButton
                              size="sm"
                              formats={["pdf"]}
                              label={t("exportOne")}
                              title={item.reference}
                              onExport={() =>
                                downloadPackageItem(id, item.id, item.reference)
                              }
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(item.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </FieldWrapper>

            {isDraft && can("package.manage") && (
              <>
                <FieldWrapper label={t("field.name")} required hint={t("renameHelp")}>
                  <div className="flex gap-2">
                    <Input
                      value={name ?? data.name}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <Button
                      variant="outline"
                      requires={[[(name ?? data.name).trim(), t("field.name")]]}
                      disabled={rename.isPending}
                      onClick={() => rename.mutate()}
                    >
                      {t("rename")}
                    </Button>
                  </div>
                </FieldWrapper>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="size-4" />
                  {t("addRecords")}
                </Button>
                {/* Asked at Confirm and not at creation: at creation nobody
                    knows yet what the bundle turned out to be, and a
                    required field answered before the answer exists is
                    answered with anything. */}
                <FieldWrapper label={t("field.remarks")} required hint={t("remarksHelp")}>
                  <Textarea
                    rows={3}
                    value={remarks || data.remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                  />
                </FieldWrapper>
              </>
            )}

            {!isDraft && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("confirmedHelp")}
                </p>
                <p className="break-all font-mono text-2xs text-muted-foreground">
                  {t("digest", { digest: data.pdf_sha256 })}
                </p>
                {data.exported_at && (
                  /* D-148: once the PDF is outside, nothing here can call it
                     back. Said as a sentence, not as a greyed-out button. */
                  <p className="text-xs">{t("exportedHelp")}</p>
                )}
                {data.review_state === "NOT_SENT" && can("package.manage") && (
                  /* Consultants only (D-150). The owner is not an account
                     type this platform has, so there is no option for one
                     rather than an option nobody can be chosen from. */
                  <FieldWrapper label={t("field.consultant")} required hint={t("consultantOnlyHelp")}>
                    <Input
                      value={consultant}
                      onChange={(event) => setConsultant(event.target.value)}
                      placeholder={t("field.consultantPlaceholder")}
                    />
                  </FieldWrapper>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {data && !isDraft && (
          <>
            {/* 预览 · 打印 · 导出 · 发送 (PDF 统一操作规则). Previewing and
                printing do not count as the package having left; 导出 and
                发送 do, as the download always has (D-148). */}
            <FileActionButtons
              source={{
                load: () => previewEvidencePackage(data.id, data.name),
                loadToSend: () => evidencePackageFile(data.id, data.name),
                title: data.name,
              }}
            />
          </>
        )}
        {data && !isDraft && data.review_state === "NOT_SENT" &&
          can("package.manage") && (
            <Button
              variant="outline"
              requires={[[consultant.trim(), t("field.consultant")]]}
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              <Send className="size-4" />
              {t("send")}
            </Button>
          )}
        {data && isDraft && can("package.manage") && (
          <>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={drop.isPending}
              onClick={() => drop.mutate()}
            >
              {common("remove")}
            </Button>
            <Button
              className="ml-auto"
              requires={[
                [data.items.length > 0, t("field.records")],
                [(remarks || data.remarks).trim(), t("field.remarks")],
              ]}
              disabled={confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              <FileText className="size-4" />
              {t("confirm")}
            </Button>
          </>
        )}
      </footer>

      {adding && data && (
        <AddRecordsDialog
          packageId={data.id}
          project={data.project}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {ticking && data && (
        <TickPartsDialog
          packageId={data.id}
          item={ticking}
          onClose={() => setTicking(null)}
          onSaved={() => {
            setTicking(null);
            refresh();
          }}
        />
      )}
    </Shell>
  );
}

/** Pick records of one column, in this package's project, to add. */
function AddRecordsDialog({
  packageId,
  project,
  onClose,
  onAdded,
}: {
  packageId: string;
  project: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const [kind, setKind] = useState<ArchiveRecordKind>("MATERIAL_RECEIPT");
  const [picked, setPicked] = useState<string[]>([]);
  // D12: 「打包人自行勾选照片、DO、文件、沟通…不默认把所有非照片全加」 - the
  // packer says what the records carry; photographs start ticked, the rest
  // do not. Each record can still be opened and re-ticked afterwards.
  const [include, setInclude] = useState<PackagePart[]>(["photos"]);
  const [preview, setPreview] = useState<{ kind: ArchiveRecordKind; id: string; reference: string } | null>(null);

  // Page by page, so an older record is one 【Load more】 away rather than
  // cut off at the newest fifty.
  const query = useInfiniteQuery({
    queryKey: ["evidence-packages", "candidates", kind, project],
    queryFn: ({ pageParam }) =>
      getPackageCandidates({ kind, project, page: pageParam, page_size: 50 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const add = useMutation({
    mutationFn: () => addPackageItems(packageId, kind, picked, include),
    onSuccess: onAdded,
  });

  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;

  return (
    <Shell title={t("addRecords")} onClose={onClose}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <nav aria-label={t("columns")} className="flex flex-wrap gap-1.5">
          {KINDS.map((row) => (
            <button
              key={row}
              type="button"
              onClick={() => {
                setKind(row);
                setPicked([]);
              }}
              aria-current={kind === row ? "true" : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-10 ${
                kind === row
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`kind.${row}`)}
            </button>
          ))}
        </nav>

        <FieldWrapper label={t("field.records")} required>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : query.isError ? (
            <LoadFailed what={t("what.candidates")} onRetry={() => void query.refetch()} />
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-panel-border p-4 text-center text-sm text-muted-foreground">
              {t("noCandidates")}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={picked.includes(row.id)}
                    onCheckedChange={(next) =>
                      setPicked((current) =>
                        next
                          ? [...current, row.id]
                          : current.filter((value) => value !== row.id),
                      )
                    }
                    aria-label={row.reference}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.reference}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.detail} · {formatter.dateTime(row.submitted_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("open")}
                    onClick={() => setPreview({ kind, id: row.id, reference: row.reference })}
                  >
                    <Eye className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("loadMore", { shown: rows.length, total })}
            </Button>
          )}
        </FieldWrapper>

        <FieldWrapper label={t("include.title")} hint={t("include.hint")}>
          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3">
            {/* No chat box (E7, Q25): 「全部的 PDF…都不需要聊天记录」. The chat
                stays on the record in the system; no package prints it. */}
            {(["photos", "documents", "files"] as const).map((part) => (
              <label key={part} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={include.includes(part)}
                  aria-label={t(`group.${part}`)}
                  onCheckedChange={(next) =>
                    setInclude((current) =>
                      next ? [...current, part] : current.filter((value) => value !== part),
                    )
                  }
                />
                {t(`group.${part}`)}
              </label>
            ))}
          </div>
        </FieldWrapper>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[[picked.length > 0, t("field.records")]]}
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          {t("addSelected", { count: picked.length })}
        </Button>
      </footer>
      {preview && (
        <RecordPreviewDialog
          kind={preview.kind}
          id={preview.id}
          reference={preview.reference}
          onClose={() => setPreview(null)}
        />
      )}
    </Shell>
  );
}

function RecordPreviewDialog({
  kind,
  id,
  reference,
  onClose,
}: {
  kind: ArchiveRecordKind;
  id: string;
  reference: string;
  onClose: () => void;
}) {
  const t = useTranslations("multiEngine");
  const labels = useTranslations("mySubmissions");
  const formatter = useDateFormat();
  const detail = useQuery({
    queryKey: ["evidence-packages", "record-preview", kind, id],
    queryFn: () => getPackageRecordParts(kind, id),
  });
  const data = detail.data;

  return (
    <Shell title={reference || t(`kind.${kind}`)} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : detail.isLoadingError || !data ? (
          <p role="alert" className="text-sm text-destructive">{t("failed")}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {data.project_name} · {formatter.dateTime(data.submitted_at)}
            </p>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("group.fields")}
              </h3>
              <dl className="divide-y rounded-lg border">
                {data.fields.map((field) => (
                  <div key={field.key} className="grid gap-1 p-2.5 sm:grid-cols-[11rem_1fr]">
                    <dt className="text-xs text-muted-foreground">{labels(`field.${field.key}`)}</dt>
                    <dd className="break-words text-sm">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {data.photos.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("group.photos")}
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.photos.map((photo) => (
                    <a key={photo.id ?? photo.url} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
                      <Image src={photo.url} alt={photo.caption || reference} width={320} height={240} unoptimized className="h-28 w-full object-cover" />
                      <span className="block truncate px-2 py-1.5 text-xs text-muted-foreground">{photo.caption || t("group.photos")}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}
            {(data.files ?? []).length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("group.files")}</h3>
                <ul className="divide-y rounded-lg border">
                  {(data.files ?? []).map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {file.uploaded_by_name} · {formatter.dateTime(file.uploaded_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.documents.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("group.documents")}</h3>
                <ul className="divide-y rounded-lg border">
                  {data.documents.map((document) => (
                    <li key={document.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                      <span className="truncate">{document.caption}</span>
                      <a href={document.url} target="_blank" rel="noreferrer" className="shrink-0 text-primary underline">{t("open")}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

/**
 * Tick which parts of one record this package carries (D-149).
 *
 * 客户：「勾选的时候，最好可以选择照片或者字段，DO 等」. The boxes start as the
 * record was added: its fields and whatever groups were ticked when adding it
 * - photographs only, unless the packer said otherwise (D12).
 */
function TickPartsDialog({
  packageId,
  item,
  onClose,
  onSaved,
}: {
  packageId: string;
  item: PackageItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("multiEngine");
  const labels = useTranslations("mySubmissions");
  const common = useTranslations("common");
  // Every part of the record, not only the ones already ticked: the member
  // row carries the ticked subset, and building the boxes from it meant a part
  // unticked once could never be ticked again.
  const parts = useQuery({
    queryKey: ["package-record-parts", item.record_kind, item.record_id],
    queryFn: () => getPackageRecordParts(item.record_kind, item.record_id),
  });
  const all = parts.data ?? item;
  // A group the stored selection does not mention is the whole group; an
  // empty list is none (D-162). A record added since D12 stores an empty
  // list for every group that was not ticked when it was added.
  const initial = (group: keyof PackageSelection, ids: string[]) =>
    group in item.selection ? (item.selection[group] ?? []) : ids;
  const [edited, setSelection] = useState<PackageSelection | null>(null);
  const selection: PackageSelection = edited ?? {
    fields: initial("fields", all.fields.map((field) => field.key)),
    photos: initial("photos", all.photos.map((shot) => shot.id ?? "")),
    documents: initial("documents", all.documents.map((doc) => doc.id)),
    files: initial("files", (all.files ?? []).map((file) => file.id)),
  };

  const save = useMutation({
    mutationFn: () => updatePackageItem(packageId, item.id, selection),
    onSuccess: onSaved,
  });

  const toggle = (group: keyof PackageSelection, value: string) =>
    setSelection(() => {
      const current = selection;
      const list = current[group] ?? [];
      return {
        ...current,
        [group]: list.includes(value)
          ? list.filter((entry) => entry !== value)
          : [...list, value],
      };
    });

  return (
    <Shell title={item.reference || t("choose")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Without the full record only the parts already ticked are listed,
            so a part unticked earlier cannot be seen or ticked again. */}
        <QueryFailedNote query={parts} what={t("what.recordParts")} />
        <section className="space-y-2">
          {/*
            Every part can be ticked (D-236): 「资料包里的资料**全部都要能由当事人
            自己勾选**」. What starts ticked changed with D12: 「不默认把所有非照片
            全加」 - a record joins with its fields and photographs, and the
            packer ticks the DO and the files in. The conversation is no longer
            a part at all (E7, Q25): no PDF prints the chat.
          */}
          <h3 className="panel-title">
            {t("group.fields")}
          </h3>
          <ul className="divide-y rounded-lg border">
            {all.fields.map((field) => (
              <li key={field.key} className="flex items-start gap-3 p-2.5">
                <Checkbox
                  checked={(selection.fields ?? []).includes(field.key)}
                  onCheckedChange={() => toggle("fields", field.key)}
                  aria-label={labels(`field.${field.key}`)}
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {labels(`field.${field.key}`)}
                  </p>
                  <p className="break-words text-sm">{field.value}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {all.photos.length > 0 && (
          <section className="space-y-2">
            <h3 className="panel-title">
              {t("group.photos")}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {all.photos.map((shot) => (
                <label
                  key={shot.id ?? shot.url}
                  className="overflow-hidden rounded-lg border"
                >
                  <Image
                    src={shot.url}
                    alt={shot.caption || item.reference}
                    width={320}
                    height={240}
                    unoptimized
                    className="h-28 w-full object-cover"
                  />
                  <span className="flex items-center gap-2 px-2 py-1.5">
                    <Checkbox
                      checked={(selection.photos ?? []).includes(shot.id ?? "")}
                      onCheckedChange={() => toggle("photos", shot.id ?? "")}
                      aria-label={shot.caption || t("group.photos")}
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {shot.caption || t("group.photos")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {all.documents.length > 0 && (
          <section className="space-y-2">
            <h3 className="panel-title">
              {t("group.documents")}
            </h3>
              <ul className="divide-y rounded-lg border">
              {all.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 p-2.5">
                  <Checkbox
                    checked={(selection.documents ?? []).includes(doc.id)}
                    onCheckedChange={() => toggle("documents", doc.id)}
                    aria-label={doc.caption}
                  />
                  <span className="truncate text-sm">{doc.caption}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(all.files ?? []).length > 0 && (
          <section className="space-y-2">
            <h3 className="panel-title">
              {t("group.files")}
            </h3>
            <ul className="divide-y rounded-lg border">
              {(all.files ?? []).map((file) => (
                <li key={file.id} className="flex items-center gap-3 p-2.5">
                  <Checkbox
                    checked={(selection.files ?? []).includes(file.id)}
                    onCheckedChange={() => toggle("files", file.id)}
                    aria-label={file.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{file.uploaded_by_name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {common("save")}
        </Button>
      </footer>
    </Shell>
  );
}

/* -------------------------------------------------------------------------
 * The consultant's side (D-147, D-150, D-151)
 * ---------------------------------------------------------------------- */

/**
 * Packages a consultant has been sent, and the per-item decision.
 *
 * Per item, not per package: 客户「如果顾问或业主不接受其中某一项，可以点击退回
 * 给申请者」. Returning the whole bundle because one delivery order is illegible
 * sends nineteen correct records back with it.
 */
export function PackageReviewWorkspace() {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["package-reviews"],
    queryFn: () =>
      import("@/services/contractor-ops.service").then((module) =>
        module.getPackagesToReview({ page: 1, page_size: PAGE_SIZE }),
      ),
  });
  const rows = query.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ListHeader title={t("reviewTitle")} subtitle={t("reviewSubtitle")} />

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <LoadFailed what={t("what.packagesToReview")} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("reviewEmpty")} />
      ) : (
        <ul className="surface-panel divide-y divide-panel-border overflow-hidden rounded-xl">
          {rows.map((row: EvidencePackageRow) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.project_name} · {t("itemCount", { count: row.item_count })}{" "}
                  · {formatter.dateTime(row.sent_at ?? row.created_at)}
                </p>
              </div>
              <StatusBadge
                label={t(`review.${row.review_state}`)}
                tone={row.review_state === "REVIEWED" ? "positive" : "warning"}
              />
              <Button size="sm" variant="outline" onClick={() => setOpenId(row.id)}>
                {t("open")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <ReviewSheet id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function ReviewSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("multiEngine");
  const queryClient = useQueryClient();
  const [returning, setReturning] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const detail = useQuery({
    queryKey: ["package-reviews", "detail", id],
    queryFn: () =>
      import("@/services/contractor-ops.service").then((module) =>
        module.getPackageToReview(id),
      ),
  });
  const decide = useMutation({
    mutationFn: (input: {
      item: string;
      decision: "ACCEPTED" | "RETURNED";
      reason: string;
    }) =>
      import("@/services/contractor-ops.service").then((module) =>
        module.reviewPackageItem(id, input.item, input.decision, input.reason),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package-reviews"] });
      setReturning(null);
      setReason("");
    },
  });

  const data = detail.data;

  return (
    <Shell title={data?.name ?? t("reviewTitle")} onClose={onClose}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : detail.isLoadingError || !data ? (
          <LoadFailed what={t("what.package")} onRetry={() => void detail.refetch()} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{data.remarks}</p>
            {!data.can_return && (
              /* D-148: the package left the platform, so there is nothing to
                 return through. A sentence, not a dead button. */
              <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs">
                {t("exportedNoReturn")}
              </p>
            )}
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li key={item.id} className="rounded-lg border p-3">
                  <p className="font-medium">
                    {item.reference || t(`kind.${item.record_kind}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`kind.${item.record_kind}`)} ·{" "}
                    {t("partsSummary", {
                      fields: item.fields.length,
                      photos: item.photos.length,
                      documents: item.documents.length,
                      files: (item.files ?? []).length,
                    })}
                  </p>

                  {item.review_state === "RETURNED" ? (
                    <p className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      {t("returnedWithReason", { reason: item.returned_reason })}
                    </p>
                  ) : item.review_state === "ACCEPTED" ? (
                    <p className="mt-2 text-xs text-primary">
                      {t("itemAccepted")}
                    </p>
                  ) : returning === item.id ? (
                    <div className="mt-2 space-y-2">
                      <FieldWrapper label={t("field.returnReason")} required hint={t("returnReasonHelp")}>
                        <Textarea
                          rows={2}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </FieldWrapper>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReturning(null)}
                        >
                          {t("cancelReturn")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          requires={[[reason.trim(), t("field.returnReason")]]}
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              item: item.id,
                              decision: "RETURNED",
                              reason,
                            })
                          }
                        >
                          {t("returnItem")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({
                            item: item.id,
                            decision: "ACCEPTED",
                            reason: "",
                          })
                        }
                      >
                        {t("acceptItem")}
                      </Button>
                      {data.can_return && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReturning(item.id);
                            setReason("");
                          }}
                        >
                          {t("returnItem")}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Shell>
  );
}
