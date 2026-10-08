"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Inbox, ListTree } from "lucide-react";
import { useTranslations } from "next-intl";
import { recordKindKey } from "@/lib/record-kind";
import { PhotoThumb, recordKindIcon, recordPhotos } from "@/components/shared/photo-thumb";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
} from "@/components/shared/record-detail-shell";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
import { useOnProjectChange, usePageProject } from "@/components/providers/current-project-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { DrillNote } from "@/components/shared/drill-note";
import { useRecordOpener } from "@/components/shared/record-opener";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordClosurePanel } from "@/components/shared/record-closure";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { RecordNo } from "@/components/shared/record-no";
import { ManufacturerCell } from "@/components/shared/manufacturer-picker";
import { canConfirmClosure, canDiscuss, isQueueKind } from "@/lib/record-chat";
import { recordStatusLabel } from "@/lib/record-status";
import { useDateFormat } from "@/lib/dates";
import type {
  ArchiveQueueDetail,
  ArchiveQueueRow,
  ArchiveRecordKind,
  RecordSheetKind,
} from "@/interfaces/contractor-ops";
import {
  getArchiveQueue,
  getArchiveRecord,
  isExportableKind,
  markRecordsSeen,
} from "@/services/contractor-ops.service";

/**
 * 总栏目 - everything finished that this reader has not looked at yet (T-233).
 *
 * The customer's sentence is the whole specification: 「全部都是属于未归档需要
 * 查看了之后才可以归档，总栏目里面是放所有归档的东西」.
 *
 * ## Unarchived is per person, and that is not a detail (D-106, D-063)
 *
 * The same delivery is waiting for the project manager and for head office at
 * the same time. Whichever of them opens it archives it *for themselves*; the
 * other's list is untouched. So this screen never says "3 records left" about
 * a site - it says how many are left for whoever is signed in, and two people
 * looking at the same project will honestly see different numbers.
 *
 * ## Why this is not the category management screen
 *
 * That screen (`category-management.tsx`) lists category *definitions* and its
 * status column means active/inactive. This one lists *records* and its two
 * halves mean unarchived/archived. Putting them on one screen would give one
 * column two meanings, which is what D-125 forbids - a reader would deactivate
 * a column believing they were archiving a delivery.
 *
 * ## Read-only (2026-10 C4, X10)
 *
 * This screen looks; it does not decide. 【确认归档】 lives on each module's
 * own detail page, where 「等你处理」 leads, and the sheet here has no button
 * that changes a record. A hazard shows whether it is closed (已闭环 /
 * 未闭环): its raiser's 确认完成 closes it, not a confirmation.
 *
 * 「未看 / 已看」 stays each reader's own (D-063) and is still read by Claim
 * Engine's 已查看 count, so it is kept: clicking a row to open it is the
 * look, and the screen sends that mark with the click. Not on the GET that
 * loads the record - a GET that changed the next reader's list would fire on
 * a refresh, a prefetch or a link preview.
 */

const KINDS: ArchiveRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "HAZARD",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
  "ATTENDANCE_DAY",
];

const PAGE_SIZE = 20;

export function ArchiveQueue() {
  const t = useTranslations("archiveQueue");
  const root = useTranslations();
  const formatter = useDateFormat();
  const { user } = useAuth();
  const canManageCategories = user?.features.includes("project_categories") ?? false;
  const [state, setState] = useState<"pending" | "archived">("pending");
  // The second question on this screen (T-391): archived for everybody, by a
  // named person - not whether *this reader* has looked, which is `state`.
  const [closure, setClosure] = useState<"" | "open" | "closed">("");
  const [kind, setKind] = useState<ArchiveRecordKind | "">("");
  const searchParams = useSearchParams();
  // The dashboard's 「等你处理」 card (B8) opens this screen with
  // `?waiting=1&project=`: what waits for this reader's 【确认】, counted the
  // way the card was. A row then opens on its module's page, where the
  // confirm is (C4), not in the read-only sheet.
  const waiting = searchParams.get("waiting") === "1";
  const confirmOpener = useRecordOpener({ confirm: true });
  // The top bar's 「当前项目」 (B13); the card's `?project=` moves it.
  const [project, setProject] = usePageProject(searchParams.get("project") ?? "");
  const [page, setPage] = useState(1);
  useOnProjectChange(project, () => setPage(1));
  const [open, setOpen] = useState<ArchiveQueueRow | null>(null);
  const queryClient = useQueryClient();
  // Opening a row is this reader's look (D-063): marked with the click, for
  // them only, and the 未看 / 已看 lists refetched - not the open record.
  const markSeen = useMutation({
    mutationFn: (row: ArchiveQueueRow) => markRecordsSeen([{ kind: row.kind, id: row.id }]),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["archive-queue"],
        predicate: (entry) => entry.queryKey[1] !== "detail",
      }),
  });
  const openRow = (row: ArchiveQueueRow) => {
    if (
      waiting &&
      confirmOpener.open(row.kind, row.id, {
        reference: row.reference,
        project_id: row.project_id,
        project_name: row.project_name,
        submitted_at: row.submitted_at,
        photo: row.photo,
      })
    ) {
      return;
    }
    setOpen(row);
    if (!row.seen_at && isQueueKind(row.kind)) markSeen.mutate(row);
  };

  const query = useQuery({
    queryKey: ["archive-queue", state, closure, kind, project, page, waiting],
    queryFn: () =>
      getArchiveQueue({
        state,
        closure: closure || undefined,
        waiting: waiting ? "1" : undefined,
        kind: kind || undefined,
        project: project || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
  });

  // Only the kinds this account may read come back, so a tab never offers a
  // module the reader would be refused on opening.
  const available = query.data?.kinds ?? [];
  const counts = query.data?.counts ?? {};
  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reset = (next: () => void) => {
    next();
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          // B05: 「分类管理可以做在总栏目右上角，有一个分类管理的 button 点了直接
          // 去到分类管理页面」. Only for whoever may open that page.
          canManageCategories ? (
            <Button asChild variant="outline" size="sm" className="rounded-full px-4">
              <Link href="/category-management">
                <ListTree className="h-4 w-4" />
                {t("categoryManagement")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Said once, at the top, because it is the thing about this screen a
          reader will otherwise get wrong: their colleague's queue is not
          theirs, and neither list is the site's backlog. */}
      {waiting ? (
        <DrillNote
          label={t("waiting.only")}
          clearLabel={t("waiting.showAll")}
          params={["waiting"]}
        />
      ) : (
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("perPersonHelp")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* 未看 / 已看 and 未归档 / 已归档 do not apply to 「等你处理」: that
            pile is defined by the confirmation alone. */}
        {!waiting && (
        <div className="flex rounded-lg border p-0.5">
          {(["pending", "archived"] as const).map((half) => (
            <button
              key={half}
              type="button"
              onClick={() => reset(() => setState(half))}
              aria-current={state === half ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${
                state === half
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {t(`state.${half}`)}
            </button>
          ))}
        </div>
        )}
        {!waiting && (
        <div className="flex rounded-lg border p-0.5" aria-label={t("closure.label")}>
          {(["", "open", "closed"] as const).map((value) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => reset(() => setClosure(value))}
              aria-current={closure === value ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${
                closure === value
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {t(`closure.${value || "all"}`)}
            </button>
          ))}
        </div>
        )}
        <ProjectFilter value={project} onChange={(next) => reset(() => setProject(next))} />
      </div>

      <nav aria-label={t("modules")} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => reset(() => setKind(""))}
          aria-current={kind === "" ? "true" : undefined}
          className={`rounded-full border px-3 py-1 text-xs ${
            kind === "" ? "border-primary bg-primary/10 text-primary" : "bg-card"
          }`}
        >
          {t("allModules")}
        </button>
        {KINDS.filter((row) => available.includes(row)).map((row) => (
          <button
            key={row}
            type="button"
            onClick={() => reset(() => setKind(row))}
            aria-current={kind === row ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-xs ${
              kind === row
                ? "border-primary bg-primary/10 text-primary"
                : "bg-card hover:bg-muted/40"
            }`}
          >
            {t(`kind.${row}`)}
            {/* The count beside the name, because "where do I start" is the
                question this screen exists to answer. */}
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {counts[row] ?? 0}
            </span>
          </button>
        ))}
      </nav>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          <Inbox className="size-4" />
          {waiting
            ? t("waiting.empty")
            : t(state === "pending" ? "emptyPending" : "emptyArchived")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[58rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.record")}</TableHead>
                <TableHead>{t("column.module")}</TableHead>
                <TableHead>{t("column.project")}</TableHead>
                <TableHead>{t("column.when")}</TableHead>
                <TableHead>{t("column.status")}</TableHead>
                <TableHead>{t("column.archived")}</TableHead>
                <TableHead>{t("column.seen")}</TableHead>
                <TableHead>{t("column.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.kind}:${row.id}`}>
                  {/* Photo first (B06): the site's picture and a short
                      summary in the list; everything else in the record. */}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {/* The record's photograph, every photo of it on click (E3). */}
                      <PhotoThumb
                        coverUrl={row.cover_photo_url}
                        count={row.photo_count}
                        icon={recordKindIcon(row.kind)}
                        reference={row.reference}
                        photos={recordPhotos(row.kind, row.id, row.reference)}
                      />
                      <span className="min-w-0">
                        {/* Short number big, project small (2026-10 D4). */}
                        <RecordNo value={row.reference} projectCode={row.project_code} />
                        {row.detail && (
                          <span className="block max-w-[16rem] truncate text-xs font-normal text-muted-foreground">
                            {row.detail}
                          </span>
                        )}
                        {/* Who sold it and whose make (2026-10 D1): material
                            receipts and returns carry both. */}
                        {(row.supplier_name || row.manufacturer_name) && (
                          <span className="flex max-w-[18rem] flex-wrap items-center gap-1 text-xs font-normal">
                            {row.supplier_name && <span className="truncate">{row.supplier_name}</span>}
                            {row.supplier_name && row.manufacturer_name && <span aria-hidden>·</span>}
                            {row.manufacturer_name && (
                              <ManufacturerCell name={row.manufacturer_name} offList={row.manufacturer_off_list} />
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`kind.${recordKindKey(row)}` as never)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.project_name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatter.dateTime(row.submitted_at)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={recordStatusLabel(root, row)} tone="neutral" />
                  </TableCell>
                  {/* Who archived it and when (T-391): 「每项都要写上是谁归档的，
                      什么时间」. */}
                  <TableCell className="text-xs">
                    {!row.archivable ? (
                      <span className="text-muted-foreground">{t("closure.notApplicable")}</span>
                    ) : row.archived ? (
                      <span className="block">
                        <span className="font-medium text-success">{t("closure.closed")}</span>
                        <span className="block text-muted-foreground">
                          {row.archived.by}
                          {row.archived.at ? ` · ${formatter.dateTime(row.archived.at)}` : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-warning">{t("closure.open")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.seen_at ? (
                      <span className="block">
                        <span className="font-medium">{t("state.archived")}</span>
                        <span className="block text-muted-foreground">
                          {formatter.dateTime(row.seen_at)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("state.pending")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRow(row)}
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages: lastPage })}
          </span>
          <div className="flex gap-2">
            {/* Greyed with a reason, not just greyed: a button that will not
                respond and says nothing is the complaint this platform's own
                probe exists to catch. */}
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

      {open && <RecordSheet row={open} onClose={() => setOpen(null)} />}
      {confirmOpener.sheet}
    </div>
  );
}

/**
 * One queue row, opened.
 *
 * Fetched on open rather than carried in the list: the list merges nine tables
 * and putting every field and photograph of twenty rows into it would make the
 * screen slow for the sake of the one row somebody clicks.
 *
 * Also the detail Category Management opens for a column's record (T-396,
 * D-276): 「与总栏目同一个详情」. That list holds kinds the queue does not
 * (a delivery note, a site record, a machine, a document, a period claim) and
 * unfinished records the queue's own door will not open, so it passes its own
 * `fetchRecord`; the queue leaves it out. Each part below is drawn only for
 * the kinds its endpoint serves, so a wider kind gets fewer parts, never a
 * part that can only fail.
 */
export function RecordSheet<K extends RecordSheetKind = ArchiveRecordKind>({
  row,
  onClose,
  fetchRecord,
  actions,
  confirm = false,
}: {
  row: ArchiveQueueRow<K>;
  onClose: () => void;
  fetchRecord?: (kind: K, id: string) => Promise<ArchiveQueueDetail<K>>;
  /**
   * The record's own decision buttons, from the module that owns them - the
   * 总部 approval list (C16) opens a record here and decides it with the
   * module's own approve / return, not a copy.
   */
  actions?: React.ReactNode;
  /**
   * Offer this record's 【确认归档】 (2026-10 C4). Only for a 「等你处理」 row
   * whose module has no detail page of its own yet (progress, an equipment
   * movement): the confirm belongs on the business page, and this sheet
   * stands in for one. Everywhere else - 现场记录中心, a category's records
   * (B4: 分类里不做验收), a dashboard photo (F9) - the sheet only reads: no
   * confirmation, no 「我看过了」, no adding to a package. A delivery still
   * waiting for acceptance links to the receipt, where it is accepted.
   */
  confirm?: boolean;
}) {
  const t = useTranslations();
  const formatter = useDateFormat();
  const detail = useQuery({
    queryKey: [
      "archive-queue",
      "detail",
      fetchRecord ? "column" : "queue",
      row.kind,
      row.id,
    ],
    queryFn: (): Promise<ArchiveQueueDetail<RecordSheetKind>> =>
      fetchRecord
        ? fetchRecord(row.kind, row.id)
        : isQueueKind(row.kind)
          ? getArchiveRecord(row.kind, row.id)
          : Promise.reject(new Error(`${row.kind} is not an archive queue kind`)),
  });
  // A delivery waiting for acceptance is accepted on its own page (B4).
  const pendingReceipt =
    row.kind === "MATERIAL_RECEIPT" && row.status === "PENDING";
  // A hazard closes by its raiser's 确认完成 (X10), so it is said, not offered.
  const hazardClosure =
    row.kind === "HAZARD" ? (row.archived ?? detail.data?.archived ?? null) : undefined;
  // The record's own parts are drawn once it has loaded, as before; the
  // caller's buttons and the way to the receipt are there from the start.
  const loaded = !detail.isLoading && !detail.isError && Boolean(detail.data);
  const offersConfirm = confirm && canConfirmClosure(row.kind);
  const hasActions = Boolean(
    actions || pendingReceipt || (loaded && (hazardClosure !== undefined || offersConfirm)),
  );
  // The status in the words the list uses (T-391); a sheet opened from
  // elsewhere without one reads it from the record once loaded.
  const statusLabel = recordStatusLabel(t, detail.data ?? row);

  return (
    <RecordDetailDialog
      title={row.reference}
      // A company-wide document has no project, so the empty part is
      // dropped rather than printed as a double dot.
      description={[
        t(`archiveQueue.kind.${recordKindKey(row) as RecordSheetKind}`),
        row.project_name,
        formatter.dateTime(row.submitted_at),
      ]
        .filter(Boolean)
        .join(" · ")}
      status={statusLabel ? <StatusBadge label={statusLabel} tone="neutral" /> : null}
      // 「单独导出」 (T-386), top right. A day of attendance is an aggregate
      // with no single record to print, and a column's delivery note, site
      // record, machine, document or period claim is not a kind the export
      // endpoint prints.
      headerActions={
        isExportableKind(row.kind) && (
          <RecordExportButton
            kind={row.kind}
            recordId={row.id}
            reference={row.reference}
          />
        )
      }
      onClose={onClose}
    >
      <RecordDetailShell
        reference={row.reference}
        notices={
          detail.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("archiveQueue.loading")}
            </p>
          ) : detail.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("archiveQueue.failed")}
            </p>
          ) : null
        }
        facts={
          loaded
            ? (detail.data?.fields ?? []).map((field) => ({
                // The same catalogue the phone's history sheet uses. One list
                // of field labels, checked against all four locales by a
                // backend test (D-133).
                label: t(`mySubmissions.field.${field.key}`),
                value: (
                  <span className="whitespace-pre-wrap">
                    {field.value}
                    {field.unit ? ` ${t(`mySubmissions.unit.${field.unit}`)}` : ""}
                  </span>
                ),
                wide: field.value.length > 60 || field.value.includes("\n"),
              }))
            : []
        }
        // The stamped copies, each opened full size (B06).
        photos={
          loaded && detail.data
            ? detail.data.photos.map((shot, index) => ({
                id: `${index}:${shot.url}`,
                url: shot.url,
                label: shot.caption || row.reference,
              }))
            : undefined
        }
        // 记录人 (E8): who recorded it, with a number to call. A day of
        // attendance is a count of people, recorded by nobody in particular.
        recorder={
          loaded && detail.data && row.kind !== "ATTENDANCE_DAY" ? (
            <RecordRecorder record={detail.data} />
          ) : undefined
        }
        actions={
          hasActions ? (
            <>
              {actions}
              {/* Nothing here changes the record (C4): adding to a package
                  and the confirm are on the module's own page. */}
              {pendingReceipt && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/receipts/${row.id}`}>
                    <ExternalLink />
                    {t("archiveQueue.goToReceipt")}
                  </Link>
                </Button>
              )}
              {loaded && hazardClosure !== undefined && (
                <HazardClosureLine closure={hazardClosure} />
              )}
              {/* The one action that ends a record (D-234) is on its module's
                  page (C4). Here only for a 「等你处理」 row whose module has
                  no detail page yet, so the reader is not sent somewhere
                  nothing can be confirmed. */}
              {loaded && confirm && canConfirmClosure(row.kind) && (
                <RecordClosurePanel kind={row.kind} recordId={row.id} />
              )}
            </>
          ) : undefined
        }
        // The same reason the package shortcut sits here (D-154): this sheet
        // is the one place a record of any kind is opened, so one panel here
        // reaches every kind that takes a conversation instead of one copy
        // per module screen. A hazard is not one of them - it keeps its own
        // chat, and two would split its evidence in half. The conversation
        // alone, as this sheet always had it (no attachments panel added).
        chat={
          loaded &&
          canDiscuss(row.kind) && (
            <RecordConversationPanel kind={row.kind} recordId={row.id} />
          )
        }
      />
    </RecordDetailDialog>
  );
}

/**
 * 已闭环 / 未闭环 for a hazard (2026-10 C4, X10). A hazard is closed by its
 * raiser's 确认完成 (VERIFIED) on the hazard page, so the sheet says which it
 * is and who closed it, with no button.
 */
export function HazardClosureLine({
  closure,
}: {
  closure: { by: string; at: string | null } | null;
}) {
  const t = useTranslations("archiveQueue.hazardClosure");
  const formatter = useDateFormat();
  return closure ? (
    <p
      className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm"
      data-hazard-closure="closed"
    >
      <span className="font-semibold text-success">{t("closed")}</span>
      {closure.by && (
        <span className="ml-2 text-muted-foreground">
          {closure.by}
          {closure.at ? ` · ${formatter.dateTime(closure.at)}` : ""}
        </span>
      )}
    </p>
  ) : (
    <p
      className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
      data-hazard-closure="open"
    >
      <span className="font-semibold text-warning">{t("open")}</span>
      <span className="ml-2 text-muted-foreground">{t("openHelp")}</span>
    </p>
  );
}
