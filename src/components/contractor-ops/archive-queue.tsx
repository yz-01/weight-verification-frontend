"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
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
import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { RecordClosurePanel } from "@/components/shared/record-closure";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { canDiscuss } from "@/lib/record-chat";
import { useDateFormat } from "@/lib/dates";
import type {
  ArchiveQueueRow,
  ArchiveRecordKind,
} from "@/interfaces/contractor-ops";
import {
  getArchiveQueue,
  getArchiveRecord,
  markRecordsArchived,
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
 * ## Opening and archiving are two actions
 *
 * Opening a row fetches its detail and does not archive it. Archiving is the
 * button in the sheet. A GET that changed the next reader's list would fire on
 * a refresh, a prefetch or a link preview, and somebody's queue would empty
 * itself without them having read anything.
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
  const formatter = useDateFormat();
  const [state, setState] = useState<"pending" | "archived">("pending");
  const [kind, setKind] = useState<ArchiveRecordKind | "">("");
  const [project, setProject] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ArchiveQueueRow | null>(null);

  const query = useQuery({
    queryKey: ["archive-queue", state, kind, project, page],
    queryFn: () =>
      getArchiveQueue({
        state,
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
      <ListHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Said once, at the top, because it is the thing about this screen a
          reader will otherwise get wrong: their colleague's queue is not
          theirs, and neither list is the site's backlog. */}
      <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
        {t("perPersonHelp")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
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
          {t(state === "pending" ? "emptyPending" : "emptyArchived")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.record")}</TableHead>
                <TableHead>{t("column.module")}</TableHead>
                <TableHead>{t("column.project")}</TableHead>
                <TableHead>{t("column.when")}</TableHead>
                <TableHead>{t("column.status")}</TableHead>
                <TableHead>{t("column.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.kind}:${row.id}`}>
                  <TableCell className="font-medium">
                    {row.reference}
                    {row.detail && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {row.detail}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`kind.${row.kind}`)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.project_name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatter.dateTime(row.submitted_at)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={row.status_label} tone="neutral" />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpen(row)}
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
    </div>
  );
}

/**
 * One queue row, opened.
 *
 * Fetched on open rather than carried in the list: the list merges nine tables
 * and putting every field and photograph of twenty rows into it would make the
 * screen slow for the sake of the one row somebody clicks.
 */
function RecordSheet({
  row,
  onClose,
}: {
  row: ArchiveQueueRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const formatter = useDateFormat();
  const detail = useQuery({
    queryKey: ["archive-queue", "detail", row.kind, row.id],
    queryFn: () => getArchiveRecord(row.kind, row.id),
  });
  const archive = useMutation({
    mutationFn: () => markRecordsArchived([{ kind: row.kind, id: row.id }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archive-queue"] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={row.reference}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-card sm:rounded-xl">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{row.reference}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {t(`archiveQueue.kind.${row.kind}`)} · {row.project_name} ·{" "}
              {formatter.dateTime(row.submitted_at)}
            </p>
          </div>
          {/* 「单独导出」 (T-386), top right beside the close. A day of
              attendance is an aggregate with no single record to print. */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {row.kind !== "ATTENDANCE_DAY" && (
              <RecordExportButton
                kind={row.kind}
                recordId={row.id}
                reference={row.reference}
              />
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X />
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {detail.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("archiveQueue.loading")}
            </p>
          ) : detail.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("archiveQueue.failed")}
            </p>
          ) : (
            <>
              <dl className="divide-y rounded-lg border">
                {detail.data?.fields.map((field) => (
                  <div
                    key={field.key}
                    className="grid grid-cols-3 gap-2 px-3 py-2"
                  >
                    <dt className="text-xs text-muted-foreground">
                      {/* The same catalogue the phone's history sheet uses.
                          One list of field labels, checked against all four
                          locales by a backend test (D-133). */}
                      {t(`mySubmissions.field.${field.key}`)}
                    </dt>
                    <dd className="col-span-2 whitespace-pre-wrap break-words text-sm">
                      {field.value}
                      {field.unit
                        ? ` ${t(`mySubmissions.unit.${field.unit}`)}`
                        : ""}
                    </dd>
                  </div>
                ))}
              </dl>
              {detail.data && detail.data.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {detail.data.photos.map((shot) => (
                    <figure key={shot.url} className="overflow-hidden rounded-lg border">
                      <Image
                        src={shot.url}
                        alt={shot.caption || row.reference}
                        width={320}
                        height={240}
                        unoptimized
                        className="h-32 w-full object-cover"
                      />
                      {shot.caption && (
                        <figcaption className="px-2 py-1 text-xs text-muted-foreground">
                          {shot.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              {/* The same reason the package shortcut sits here (D-154): this
                  sheet is the one place a record of any kind is opened, so one
                  panel here reaches every kind that takes a conversation
                  instead of one copy per module screen. A hazard is not one of
                  them - it keeps its own chat, and two would split its
                  evidence in half. */}
              {canDiscuss(row.kind) && (
                <RecordConversationPanel kind={row.kind} recordId={row.id} />
              )}
              {/* And the one action that ends it (D-234). Here for the same
                  reason as the conversation: this sheet is where a record of
                  any kind is opened, so one panel covers every kind rather
                  than eight copies that would drift. */}
              <RecordClosurePanel kind={row.kind} recordId={row.id} />
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          {/* Said out loud next to the button, because "archive" reads as a
              record-wide action and this one is not (D-106). */}
          <p className="w-full text-xs text-muted-foreground sm:w-auto">
            {t("archiveQueue.archiveHelp")}
          </p>
          {/* From the record rather than from Multi Engine (T-238). This sheet
              is the one place that opens a record of any of the nine kinds, so
              putting the shortcut here reaches all of them without nine copies
              of the same button (D-154). */}
          <AddToPackageButton
            kind={row.kind}
            recordId={row.id}
            projectId={row.project_id}
            reference={row.reference}
          />
          {detail.data?.is_seen ? (
            /* A sentence rather than a greyed-out button: a button that is
               disabled for any reason other than a request in flight has to
               say why it is grey, and "you have already archived this" is
               something to read, not something to click. */
            <p className="ml-auto text-sm font-medium">
              {t("archiveQueue.alreadyArchived")}
            </p>
          ) : (
            <Button
              className="ml-auto"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              {t("archiveQueue.archive")}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
