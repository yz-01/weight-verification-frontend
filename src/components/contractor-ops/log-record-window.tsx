"use client";

/**
 * The record an 操作记录 row names, in a window over the list (JB183, 客户
 * 11-13 事项 1、2): 「完整记录页面提供「X」关闭按钮」「点击「X」或返回箭头，必须
 * 返回原来的「报表历史记录 → 操作记录」页面」.
 *
 * Which window is `logRowTarget`'s choice (`src/lib/log-record-open.ts`);
 * this draws it. Every one is the module's own window - the same ones a
 * report preview, 分类管理's 「查看记录」 and the dashboard's cards open - with
 * its X; closing it (X, outside, Esc, the browser's back) is the caller's
 * `onClose`, and the list under it never moved.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AnnouncementDialog } from "@/components/announcements/announcement-dialog";
import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import { PackageSheet } from "@/components/contractor-ops/multi-engine";
import { ViewDispatch } from "@/components/dispatches/view-dispatch";
import { IncidentThreadDetail } from "@/components/incident-reporting/incident-thread-detail";
import { DailyReportBook } from "@/components/progress/daily-reports";
import { ProgressSummaryWindow } from "@/components/progress/progress-summary";
import { ViewProject } from "@/components/projects/view-project";
import { ViewSettlement } from "@/components/settlements/view-settlement";
import { FormSurfaceProvider } from "@/components/shared/form-surface";
import { InPlaceRecord } from "@/components/shared/in-place-record";
import { RecordDetailDialog } from "@/components/shared/record-detail-shell";
import { RecordWindowFailure } from "@/components/shared/record-window-failure";
import { GateIncidentDetailDialog } from "@/components/site-access/gate-records";
import { PassDetail } from "@/components/site-access/site-access-workspace";
import { VisitorArrivalDialog } from "@/components/site-access/visitor-arrival";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ViewWeighSession } from "@/components/weighing/view-weigh-session";
import type { ArchiveQueueRow, CategoryRecordKind, RecordSheetKind } from "@/interfaces/contractor-ops";
import type { LogWindowOpener } from "@/lib/log-record-open";
import { withFileFetch } from "@/services/api-client";
import { getCategoryRecord, recordPdfFile, type RecordPdfKind } from "@/services/contractor-ops.service";
import { signsFileActions } from "@/services/file-action.service";
import { getSiteAccessPass } from "@/services/site-access.service";

/** What the row says of its record, for a window's heading before it loads. */
export interface LogRecordHeading {
  /** The row's subject: 「完整证据 · EQ0001-ENTRY」, a report's name. */
  reference: string;
  project_id: string | null;
  project_name: string;
}

const NO_HEADING: LogRecordHeading = { reference: "", project_id: null, project_name: "" };

export function LogRecordWindow({
  opener,
  kind,
  id,
  heading = NO_HEADING,
  onClose,
}: {
  opener: LogWindowOpener;
  kind: string;
  id: string;
  heading?: LogRecordHeading;
  onClose: () => void;
}) {
  switch (opener) {
    case "inPlace":
      return <InPlaceRecord kind={kind} id={id} onClose={onClose} />;
    case "dailyReport":
      return <DailyReportBook report={id} onClose={onClose} />;
    case "progressSummary":
      return <ProgressSummaryWindow id={id} onClose={onClose} />;
    case "package":
      return <PackageSheet id={id} onClose={onClose} />;
    case "categorySheet":
      return (
        <RecordSheet
          row={sheetRow(kind as CategoryRecordKind, id, heading)}
          fetchRecord={getCategoryRecord}
          onClose={onClose}
        />
      );
    case "archiveSheet":
      return <RecordSheet row={sheetRow(kind as RecordSheetKind, id, heading)} onClose={onClose} />;
    case "gateIncident":
      return <GateIncidentDetailDialog id={id} onClose={onClose} />;
    case "visitorArrival":
      return <VisitorArrivalDialog id={id} onClose={onClose} />;
    case "announcement":
      return <AnnouncementDialog id={id} onClose={onClose} />;
    case "dispatch":
      return <ViewDispatch id={id} presentation="dialog" onClose={onClose} />;
    case "weighSession":
      return (
        <PageInWindow onClose={onClose}>
          <ViewWeighSession id={id} />
        </PageInWindow>
      );
    case "settlement":
      return (
        <PageInWindow onClose={onClose}>
          <ViewSettlement id={id} />
        </PageInWindow>
      );
    case "project":
      return (
        <PageInWindow onClose={onClose}>
          <ViewProject id={id} />
        </PageInWindow>
      );
    case "incidentThread":
      return <IncidentThreadDetail threadId={id} onClose={onClose} />;
    case "pass":
      return <PassWindow id={id} heading={heading} onClose={onClose} />;
    case "recordPdf":
      return <RecordPdfWindow kind={kind} id={id} heading={heading} onClose={onClose} />;
    default: {
      // A new opener in `log-record-open.ts` must be drawn here.
      const unknown: never = opener;
      return unknown;
    }
  }
}

/** The read-only sheet's row, as `useRecordOpener` builds it. */
function sheetRow<K extends RecordSheetKind>(kind: K, id: string, heading: LogRecordHeading): ArchiveQueueRow<K> {
  return {
    id,
    kind,
    reference: heading.reference,
    detail: "",
    project_id: heading.project_id,
    project_name: heading.project_name,
    submitted_at: "",
    status: "",
    status_label: "",
    photo: null,
    seen_at: null,
    archivable: false,
    archived: null,
  };
}

/**
 * A record page drawn in a window over the list, as the `@modal` routes draw
 * `/weighing/<id>`, `/settlements/<id>` and `/projects/<id>` (T-243): the
 * page's header becomes the window's title, and the window's X is the way
 * out - here back to the list, never a navigation.
 */
function PageInWindow({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <FormSurfaceProvider value="dialog">
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          data-slot="log-record-page-window"
          className="h-[calc(100dvh-2rem)] max-h-none overflow-y-auto p-3 sm:max-w-[min(96vw,90rem)]"
        >
          {children}
        </DialogContent>
      </Dialog>
    </FormSurfaceProvider>
  );
}

/** 通行证: read by its id, then its own window (`PassDetail`). */
function PassWindow({ id, heading, onClose }: { id: string; heading: LogRecordHeading; onClose: () => void }) {
  const w = useTranslations("contractorReports.history.window");
  const pass = useQuery({ queryKey: ["site-access-pass", id], queryFn: () => getSiteAccessPass(id) });
  if (pass.data) return <PassDetail row={pass.data} onClose={onClose} />;
  return (
    <RecordDetailDialog title={heading.reference || w("record")} description={heading.project_name || undefined} onClose={onClose}>
      {pass.isError ? (
        <RecordWindowFailure query={pass} what={heading.reference || w("record")} />
      ) : (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      )}
    </RecordDetailDialog>
  );
}

/**
 * 考勤 (one clock-in or -out) and 设备工时 (one start-to-stop) have no window
 * and no page that opens one: the record frame with their 完整证据 - the PDF
 * that was printed or sent - shown in it, and the house's one set of buttons
 * (预览 · 打印 · 导出 · 发送) and 发送记录 for this record.
 */
function RecordPdfWindow({
  kind,
  id,
  heading,
  onClose,
}: {
  kind: string;
  id: string;
  heading: LogRecordHeading;
  onClose: () => void;
}) {
  const w = useTranslations("contractorReports.history.window");
  const reference = heading.reference || id;
  return (
    <RecordDetailDialog
      title={heading.reference || w("record")}
      description={heading.project_name || undefined}
      exportRecord={{ kind: kind as RecordPdfKind, recordId: id, reference }}
      onClose={onClose}
    >
      <RecordPdfFrame kind={kind as RecordPdfKind} id={id} reference={reference} />
    </RecordDetailDialog>
  );
}

/** The record's 完整证据, read as a preview (no PIN, no log row), in the page. */
function RecordPdfFrame({ kind, id, reference }: { kind: RecordPdfKind; id: string; reference: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    withFileFetch(signsFileActions() ? { preview: true } : null, () => recordPdfFile(kind, id, reference))
      .then((file) => {
        made = URL.createObjectURL(file);
        if (alive) setUrl(made);
        else URL.revokeObjectURL(made);
      })
      .catch((error: unknown) => {
        if (alive) setFailure({ error });
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [kind, id, reference]);
  if (failure) {
    return <RecordWindowFailure query={{ isError: true, error: failure.error }} what={reference} />;
  }
  if (!url) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  return (
    <iframe
      src={url}
      title={reference}
      data-slot="log-record-pdf"
      className="h-[70dvh] w-full rounded-md border bg-paper"
    />
  );
}
