"use client";

/**
 * 批量新增人员 (JB61-1): a whole page for ten, twenty or two thousand people.
 *
 * The client, 2026-10-28: 「一个一个这么填太麻烦…一下填写10个20人，利用整个
 * 电脑的页面」; Lucas: the office may have one or two thousand foreign
 * workers' passports in hand. And: 「他是老人家确保他会用」 - so one page, the
 * steps written on it, big plain buttons, and every refusal saying what to do.
 *
 * 1. Choose the project and the company once (or continue a batch not
 *    finished).
 * 2. Fill one table, any way: phones scanning the QR code photograph
 *    passports, passport photos / PDFs uploaded here, the Excel template, or
 *    typing and pasting into the table. Passport photos are read on the
 *    server (the MRZ); a photo not read with every check digit right is
 *    yellow, with the photo beside it.
 * 3. Each row's problems are written beside it, red. 「全部保存」 saves every
 *    row with none and keeps the rest: 「成功 N 人，要处理 M 人」.
 *
 * The table is kept on the server as the office types (a second after the
 * typing stops), so phones can add to it and a closed tab loses nothing.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Smartphone,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, QueryBoundary, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { BulkTable, type CellFocus } from "@/components/site-workers/bulk-table";
import { CapturePanel, RowCheckDialog } from "@/components/site-workers/bulk-panels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { ApiError } from "@/interfaces/api";
import type { BatchDetail, BatchRowProblem, SiteWorkerBatch } from "@/interfaces/site-workers";
import { useDateFormat } from "@/lib/dates";
import {
  BLANK_ROWS,
  PAGE_ROWS,
  blankRows,
  filledCount,
  hasUnsynced,
  mergeIncoming,
  planSync,
  pollSince,
  rowFromServer,
  settleSync,
  withBlankTail,
  type BulkRow,
} from "@/lib/site-workers-bulk";
import {
  closeBatch,
  createBatch,
  downloadBatchTemplate,
  getBatch,
  getBatchRows,
  getOpenBatches,
  getWorkerCompanyOptions,
  importBatchExcel,
  saveBatchChunk,
  syncBatchRows,
  updateBatch,
  uploadBatchPhoto,
} from "@/services/site-workers.service";

const NONE = "__none__";
/** Passport photos read at the same time (each takes the server a few seconds). */
const UPLOADS_AT_ONCE = 3;

export function WorkerBulk() {
  const params = useSearchParams();
  const batch = params.get("batch");
  return (
    <div className="flex flex-col gap-4">
      {batch ? <BulkBatch batchId={batch} /> : <BulkStart defaultProject={params.get("project") ?? ""} />}
    </div>
  );
}

function BackToRoster() {
  const bulk = useTranslations("siteWorkers.bulk");
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit">
      <Link href="/site-workers">
        <ArrowLeft className="h-4 w-4" />
        {bulk("back")}
      </Link>
    </Button>
  );
}

/** 「所属公司」: from the company list, or typed when it is not on it. */
function CompanyChoice({
  supplier,
  supplierName,
  note,
  onSupplier,
  onNote,
}: {
  supplier: string;
  supplierName: string;
  note: string;
  onSupplier: (value: string, label: string) => void;
  onNote: (value: string) => void;
}) {
  const t = useTranslations("siteWorkers");
  const common = useTranslations("common");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const companies = useQuery({
    queryKey: ["site-workers", "company-options", "list", search],
    queryFn: () => getWorkerCompanyOptions(search ? { search } : {}),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const options = [
    { value: NONE, label: t("form.noCompany") },
    ...(companies.data ?? []).map((option) => ({ value: option.value, label: option.label })),
  ];
  return (
    <>
      <FieldWrapper label={t("field.company")} optional={common("optional")}>
        <OptionCombobox
          value={supplier || NONE}
          onChange={(value) => {
            const picked = options.find((option) => option.value === value);
            onSupplier(value === NONE ? "" : value, value === NONE ? "" : (picked?.label ?? ""));
          }}
          options={options}
          onSearch={setTerm}
          selectedLabel={supplier ? supplierName : t("form.noCompany")}
          placeholder={t("form.pickCompany")}
          searchPlaceholder={t("form.searchCompany")}
          emptyLabel={t("form.noCompanyMatch")}
          ariaLabel={t("field.company")}
        />
        <QueryFailedNote query={companies} what={t("what.companies")} />
      </FieldWrapper>
      {!supplier && (
        <FieldWrapper
          label={t("field.companyNote")}
          optional={common("optional")}
          hint={t("form.companyNoteHint")}
        >
          <Input value={note} onChange={(event) => onNote(event.target.value)} />
        </FieldWrapper>
      )}
    </>
  );
}

// --- Step 1: the project and the company, once ---------------------------------

function BulkStart({ defaultProject }: { defaultProject: string }) {
  const t = useTranslations("siteWorkers");
  const bulk = useTranslations("siteWorkers.bulk");
  const df = useDateFormat();
  const router = useRouter();
  const [project, setProject] = useState(defaultProject);
  const [supplier, setSupplier] = useState({ value: "", label: "" });
  const [note, setNote] = useState("");

  const open = useQuery({
    queryKey: ["site-workers", "batches", "open"],
    queryFn: () => getOpenBatches(),
  });
  const start = useMutation({
    mutationFn: () =>
      createBatch({ project, supplier: supplier.value || null, company_note: supplier.value ? "" : note }),
    onSuccess: (batch) => router.replace(`/site-workers/bulk?batch=${batch.id}`),
  });

  return (
    <>
      <BackToRoster />
      <h1 className="text-2xl font-semibold">{bulk("title")}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">{bulk("startIntro")}</p>
      <section className="grid max-w-xl gap-4 rounded-lg border bg-card p-4">
        <h2 className="panel-title">{bulk("step1")}</h2>
        <FieldWrapper label={t("field.project")} required>
          <ProjectPicker value={project} onValueChange={setProject} placeholder={t("filter.project")} />
        </FieldWrapper>
        <CompanyChoice
          supplier={supplier.value}
          supplierName={supplier.label}
          note={note}
          onSupplier={(value, label) => setSupplier({ value, label })}
          onNote={setNote}
        />
        <p className="text-xs text-muted-foreground">{bulk("companyHint")}</p>
        <Button
          size="lg"
          className="w-fit"
          onClick={() => start.mutate()}
          disabled={start.isPending}
          requires={[[project, t("field.project")]]}
        >
          {start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {bulk("start")}
        </Button>
      </section>

      <section className="max-w-3xl space-y-2">
        <h2 className="panel-title">{bulk("continueTitle")}</h2>
        <QueryFailedNote query={open} what={bulk("what.batches")} />
        {open.data && open.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{bulk("noOpenBatches")}</p>
        )}
        {(open.data ?? []).length > 0 && (
          <ul className="divide-y rounded-lg border">
            {(open.data ?? []).map((batch) => (
              <li key={batch.id}>
                <Link
                  href={`/site-workers/bulk?batch=${batch.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm hover:bg-muted/40"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{batch.project_name}</span>
                    {batch.company_name ? ` · ${batch.company_name}` : ""}
                    <span className="block text-xs text-muted-foreground">
                      {bulk("openBatchLine", {
                        at: df.dateTime(batch.created_at),
                        rows: batch.row_count,
                        saved: batch.saved_count,
                      })}
                    </span>
                  </span>
                  <span className="font-medium text-primary">{bulk("continue")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// --- Step 2 and 3: the table ---------------------------------------------------

function BulkBatch({ batchId }: { batchId: string }) {
  const bulk = useTranslations("siteWorkers.bulk");
  const detail = useQuery({
    queryKey: ["site-workers", "batch", batchId],
    queryFn: () => getBatch(batchId),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <QueryBoundary query={detail} what={bulk("what.batch")}>
      {detail.data ? <BatchEditor key={batchId} initial={detail.data} /> : null}
    </QueryBoundary>
  );
}

interface UploadProgress {
  total: number;
  done: number;
  failures: { name: string; message: string }[];
}

type Filter = "all" | "problems";

function BatchEditor({ initial }: { initial: BatchDetail }) {
  const t = useTranslations("siteWorkers");
  const bulk = useTranslations("siteWorkers.bulk");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const batchId = initial.batch.id;

  const [batch, setBatch] = useState<SiteWorkerBatch>(initial.batch);
  const [rows, setRowsState] = useState<BulkRow[]>(() =>
    initial.rows.length > 0
      ? withBlankTail(initial.rows.map(rowFromServer))
      : blankRows(BLANK_ROWS),
  );
  const rowsRef = useRef(rows);
  const deletedRef = useRef<string[]>([]);
  const syncingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sinceRef = useRef(pollSince(initial.now));
  const [problems, setProblems] = useState<Record<string, BatchRowProblem[]>>(initial.problems);
  const [fills, setFills] = useState<Record<string, { name: string }>>(initial.fills ?? {});
  const [savedCount, setSavedCount] = useState(initial.saved_count);
  const [syncState, setSyncState] = useState<"saved" | "saving" | "failed">("saved");
  const [closed, setClosed] = useState(initial.batch.status === "DONE");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [result, setResult] = useState<{ saved: number; problems: number; filled: number } | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<CellFocus | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const excelInput = useRef<HTMLInputElement>(null);

  const commit = useCallback((next: BulkRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  const applyState = useCallback(
    (state: {
      problems: Record<string, BatchRowProblem[]>;
      fills?: Record<string, { name: string }>;
      saved_count: number;
    }) => {
      setProblems(state.problems);
      setFills(state.fills ?? {});
      setSavedCount(state.saved_count);
    },
    [],
  );

  /** Send what changed, one sync at a time, until nothing is left. */
  /** False when the server could not be reached or refused. */
  const runSync = useCallback(async (): Promise<boolean> => {
    if (syncingRef.current) return true;
    syncingRef.current = true;
    try {
      for (let round = 0; round < 20; round += 1) {
        const plan = planSync(rowsRef.current);
        const deleted = deletedRef.current.splice(0);
        if (plan.rows.length === 0 && deleted.length === 0) break;
        setSyncState("saving");
        try {
          const answer = await syncBatchRows(batchId, plan.rows, deleted);
          const settled = settleSync(rowsRef.current, plan, answer);
          // A row removed while its first sync was out: remove it there too.
          const keys = new Set(settled.map((row) => row.key));
          for (const [key, id] of Object.entries(answer.ids)) {
            if (!keys.has(key)) deletedRef.current.push(id);
          }
          commit(settled);
          applyState(answer);
        } catch (error) {
          deletedRef.current.unshift(...deleted);
          setSyncState("failed");
          if (error instanceof ApiError && error.code === "worker_batch_closed") setClosed(true);
          return false;
        }
      }
      setSyncState("saved");
      return true;
    } finally {
      syncingRef.current = false;
    }
  }, [applyState, batchId, commit]);

  const scheduleSync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSync(), 800);
  }, [runSync]);


  /** Everything typed is on the server (before 「全部保存」). */
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    for (let round = 0; round < 40; round += 1) {
      if (!syncingRef.current && !hasUnsynced(rowsRef.current, deletedRef.current)) return true;
      if (!syncingRef.current) {
        if (!(await runSync())) return false;
        if (!hasUnsynced(rowsRef.current, deletedRef.current)) return true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    return false;
  }, [runSync]);

  const edit = useCallback(
    (next: BulkRow[]) => {
      commit(next);
      setResult(null);
      scheduleSync();
    },
    [commit, scheduleSync],
  );

  // Rows phones (and other uploads) add, and everybody's problems.
  const busy = captureOpen || uploads !== null;
  useEffect(() => {
    if (closed) return;
    let stopped = false;
    const poll = async () => {
      if (stopped || document.hidden || saving !== null) return;
      try {
        const answer = await getBatchRows(batchId, sinceRef.current);
        if (stopped) return;
        sinceRef.current = pollSince(answer.now);
        const merged = mergeIncoming(rowsRef.current, answer.rows);
        if (merged !== rowsRef.current) commit(merged);
        if (!syncingRef.current && !hasUnsynced(rowsRef.current, deletedRef.current)) applyState(answer);
        if (answer.status === "DONE") setClosed(true);
      } catch {
        // The next poll tries again; the table keeps working meanwhile.
      }
    };
    const every = busy ? 3000 : 15_000;
    const timer = setInterval(() => void poll(), every);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [applyState, batchId, busy, closed, commit, saving]);

  // Leaving with typing not yet sent: the browser asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsynced(rowsRef.current, deletedRef.current)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // --- What the table shows ---------------------------------------------------
  const problemIndexes = useMemo(
    () => rows.flatMap((row, index) => (row.id && problems[row.id]?.length ? [index] : [])),
    [problems, rows],
  );
  const visible = useMemo(
    () => (filter === "problems" ? problemIndexes : rows.map((_, index) => index)),
    [filter, problemIndexes, rows],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_ROWS));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = visible.slice(currentPage * PAGE_ROWS, (currentPage + 1) * PAGE_ROWS);
  const filled = filledCount(rows);
  const phoneRows = rows.filter((row) => row.source === "PHONE").length;

  const goTo = useCallback(
    (cell: CellFocus) => {
      const at = visible.indexOf(cell.row);
      if (at >= 0) setPage(Math.floor(at / PAGE_ROWS));
      setFocus(cell);
    },
    [visible],
  );

  const addRows = (from?: CellFocus) => {
    const next = [...rowsRef.current, ...blankRows(BLANK_ROWS)];
    commit(next);
    setFilter("all");
    if (from) {
      const row = from.row + 1;
      setPage(Math.floor(row / PAGE_ROWS));
      setFocus({ row, column: from.column });
    } else {
      setPage(Math.floor((next.length - 1) / PAGE_ROWS));
    }
  };

  const remove = (index: number) => {
    const row = rowsRef.current[index];
    if (row?.id) deletedRef.current.push(row.id);
    edit(withBlankTail(rowsRef.current.filter((_, at) => at !== index)));
  };

  // --- Photos, Excel ------------------------------------------------------------
  const uploadPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    const progress: UploadProgress = { total: files.length, done: 0, failures: [] };
    setUploads({ ...progress });
    const queue = files.slice();
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          const answer = await uploadBatchPhoto(batchId, file);
          commit(mergeIncoming(rowsRef.current, [answer.row]));
          if (!hasUnsynced(rowsRef.current, deletedRef.current)) applyState(answer);
        } catch (error) {
          progress.failures.push({
            name: file.name,
            message: error instanceof Error ? error.message : bulk("uploadFailed"),
          });
        }
        progress.done += 1;
        setUploads({ ...progress, failures: progress.failures.slice() });
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOADS_AT_ONCE, files.length) }, worker));
    setUploads(progress.failures.length > 0 ? { ...progress } : null);
  };

  const excel = useMutation({
    mutationFn: (file: File) => importBatchExcel(batchId, file),
    onSuccess: (answer) => {
      commit(mergeIncoming(rowsRef.current, answer.rows));
      applyState(answer);
      setFilter("all");
    },
  });
  const template = useMutation({ mutationFn: () => downloadBatchTemplate(locale) });

  // --- 全部保存 -----------------------------------------------------------------
  const saveAll = async () => {
    setResult(null);
    setSaveBlocked(false);
    setSaving(0);
    try {
      if (!(await flush())) {
        setSaveBlocked(true);
        return;
      }
      let after = 0;
      let saved = 0;
      let filled = 0;
      let problemCount = 0;
      for (let round = 0; round < 100; round += 1) {
        const answer = await saveBatchChunk(batchId, after);
        saved += answer.saved;
        filled += answer.filled ?? 0;
        problemCount += answer.problem_count;
        const done = new Set([...answer.saved_ids, ...(answer.filled_ids ?? [])]);
        commit(withBlankTail(rowsRef.current.filter((row) => !row.id || !done.has(row.id))));
        applyState(answer);
        setSaving(saved);
        after = answer.last;
        if (answer.done) break;
      }
      setResult({ saved, problems: problemCount, filled });
      setFilter(problemCount > 0 ? "problems" : "all");
      setPage(0);
      void queryClient.invalidateQueries({ queryKey: ["site-workers", "list"] });
    } catch (error) {
      if (error instanceof ApiError && error.code === "worker_batch_closed") setClosed(true);
    } finally {
      setSaving(null);
    }
  };

  const finish = useMutation({
    mutationFn: () => closeBatch(batchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["site-workers"] });
      router.push("/site-workers");
    },
  });

  const checkingRow = checking !== null ? (rows[checking] ?? null) : null;
  const unsaved = hasUnsynced(rows, []);

  return (
    <>
      <BackToRoster />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{bulk("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {batch.project_name}
            {" · "}
            {batch.company_name || t("form.noCompany")}
            {!closed && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-1.5 py-0"
                onClick={() => setEditingCompany(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {bulk("changeCompany")}
              </Button>
            )}
          </p>
        </div>
        <p className="text-sm">
          {bulk("counts", { rows: filled, saved: savedCount })}
          <span className={syncState === "failed" ? "ml-2 text-xs text-destructive" : "ml-2 text-xs text-muted-foreground"}>
            {syncState === "failed"
              ? bulk("draftFailed")
              : syncState === "saving" || unsaved
                ? bulk("draftSaving")
                : bulk("draftSaved")}
          </span>
        </p>
      </div>

      {closed ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {bulk("closedNote")}
        </p>
      ) : (
        <p className="max-w-4xl text-sm text-muted-foreground">{bulk("howTo")}</p>
      )}

      {!closed && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={captureOpen ? "secondary" : "outline"} onClick={() => setCaptureOpen((open) => !open)}>
            <Smartphone className="h-4 w-4" />
            {captureOpen ? bulk("hidePhones") : bulk("usePhones")}
          </Button>
          <input
            ref={photoInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void uploadPhotos(files);
            }}
          />
          <Button
            variant="outline"
            onClick={() => photoInput.current?.click()}
            disabled={uploads !== null && uploads.done < uploads.total}
            disabledReason={bulk("uploadBusy")}
          >
            <ImagePlus className="h-4 w-4" />
            {bulk("uploadPhotos")}
          </Button>
          <Button variant="outline" onClick={() => template.mutate()} disabled={template.isPending}>
            {template.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {bulk("downloadTemplate")}
          </Button>
          <input
            ref={excelInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) excel.mutate(file);
            }}
          />
          <Button variant="outline" onClick={() => excelInput.current?.click()} disabled={excel.isPending}>
            {excel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {bulk("uploadExcel")}
          </Button>
          <Button variant="outline" onClick={() => addRows()}>
            <Plus className="h-4 w-4" />
            {bulk("addRows")}
          </Button>
        </div>
      )}

      {captureOpen && !closed && (
        <CapturePanel
          batchId={batchId}
          phoneCount={phoneRows}
          onStopped={() => {
            setCaptureOpen(false);
            void queryClient.removeQueries({ queryKey: ["site-workers", "batch", batchId, "capture-link"] });
          }}
        />
      )}

      {uploads && (
        <div className="rounded-lg border bg-card px-3 py-2 text-sm">
          {uploads.done < uploads.total ? (
            <p className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {bulk("reading", { done: uploads.done, total: uploads.total })}
            </p>
          ) : (
            <p>{bulk("readDone", { total: uploads.total, failed: uploads.failures.length })}</p>
          )}
          {uploads.failures.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-destructive">
              {uploads.failures.map((failure, index) => (
                <li key={`${failure.name}-${index}`}>
                  {failure.name}: {failure.message}
                </li>
              ))}
            </ul>
          )}
          {uploads.done >= uploads.total && (
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setUploads(null)}>
              {common("close")}
            </Button>
          )}
        </div>
      )}

      {result && (
        <div
          className={
            result.problems > 0
              ? "rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
              : "rounded-lg border border-success/40 bg-success/10 px-3 py-2"
          }
        >
          <p className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            {bulk("result", { saved: result.saved, problems: result.problems })}
          </p>
          {result.filled > 0 && <p className="text-sm">{bulk("resultFilled", { count: result.filled })}</p>}
          {result.problems > 0 && <p className="text-sm">{bulk("resultProblems")}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => { setFilter("all"); setPage(0); }}>
          {bulk("filterAll", { count: filled })}
        </Button>
        <Button
          size="sm"
          variant={filter === "problems" ? "secondary" : "ghost"}
          onClick={() => { setFilter("problems"); setPage(0); }}
        >
          {bulk("filterProblems", { count: problemIndexes.length })}
        </Button>
        {pageCount > 1 && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={currentPage === 0} disabledReason={bulk("firstPage")} onClick={() => setPage(currentPage - 1)}>
              {bulk("prevPage")}
            </Button>
            {bulk("page", { page: currentPage + 1, pages: pageCount })}
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= pageCount - 1}
              disabledReason={bulk("lastPage")}
              onClick={() => setPage(currentPage + 1)}
            >
              {bulk("nextPage")}
            </Button>
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <BulkTable
          rows={rows}
          shown={shown}
          problems={problems}
          fills={fills}
          companyPlaceholder={batch.company_name || t("form.noCompany")}
          focus={focus}
          onRows={edit}
          onFocusDone={() => setFocus(null)}
          onNeedMoreRows={(from) => addRows(from)}
          onMoveTo={goTo}
          onRemove={remove}
          onCheck={setChecking}
        />
      </div>
      {filter === "problems" && problemIndexes.length === 0 && (
        <p className="text-sm text-muted-foreground">{bulk("noProblems")}</p>
      )}

      {!closed && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background py-3">
          <Button
            size="lg"
            onClick={() => void saveAll()}
            disabled={saving !== null || filled === 0}
            disabledReason={filled === 0 ? bulk("nothingToSave") : undefined}
          >
            {saving !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving !== null ? bulk("savingProgress", { saved: saving }) : bulk("saveAll")}
          </Button>
          {saveBlocked ? (
            <span className="text-sm text-destructive">{bulk("saveBlocked")}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{bulk("saveHint")}</span>
          )}
          <Button variant="ghost" className="ml-auto" onClick={() => setConfirmClose(true)}>
            <Square className="h-4 w-4" />
            {bulk("finish")}
          </Button>
        </div>
      )}

      <RowCheckDialog
        row={checkingRow}
        number={(checking ?? 0) + 1}
        onChange={(row) => {
          if (checking === null) return;
          const next = rowsRef.current.slice();
          next[checking] = row;
          edit(next);
        }}
        onClose={() => setChecking(null)}
      />

      <CompanyDialog
        open={editingCompany}
        batch={batch}
        onClose={() => setEditingCompany(false)}
        onSaved={(next) => {
          setBatch(next);
          setEditingCompany(false);
        }}
      />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={bulk("finishTitle")}
        description={
          filled > 0 ? bulk("finishBodyLeft", { count: filled }) : bulk("finishBody")
        }
        confirmLabel={bulk("finish")}
        confirmIcon={Square}
        variant="default"
        isPending={finish.isPending}
        onConfirm={() => finish.mutate()}
      />
    </>
  );
}

function CompanyDialog({
  open,
  batch,
  onClose,
  onSaved,
}: {
  open: boolean;
  batch: SiteWorkerBatch;
  onClose: () => void;
  onSaved: (batch: SiteWorkerBatch) => void;
}) {
  const bulk = useTranslations("siteWorkers.bulk");
  const common = useTranslations("common");
  const [supplier, setSupplier] = useState({ value: batch.supplier ?? "", label: batch.supplier_name });
  const [note, setNote] = useState(batch.company_note);
  const save = useMutation({
    mutationFn: () =>
      updateBatch(batch.id, { supplier: supplier.value || null, company_note: supplier.value ? "" : note }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bulk("changeCompany")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <CompanyChoice
            supplier={supplier.value}
            supplierName={supplier.label}
            note={note}
            onSupplier={(value, label) => setSupplier({ value, label })}
            onNote={setNote}
          />
          <p className="text-xs text-muted-foreground">{bulk("companyHint")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
