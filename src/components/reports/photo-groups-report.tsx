"use client";

/**
 * 照片报表 (J8, Q8): one row per business record, its photographs side by side.
 *
 * The client, 10-20: 「一条完整业务记录 = 一行，这一行就是横排的照片缩略图」 -
 * not one photograph per row with its file name, device and coordinates. On
 * the left a few words (the record's number and module, project, date, who);
 * on the right every photograph as an equal square that scrolls sideways.
 * A photograph opens the viewer (zoom, turn, download the original, its time
 * and GPS), with 「打开原记录」 for the whole record and 「证据报表」 for the
 * record's complete evidence report (J8-5) - single photographs stay, but
 * never instead of it (J8-6). The row itself carries no buttons (J43): its
 * words and its photographs only; those two wait in the viewer.
 */

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ImageIcon, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { useRecordOpener } from "@/components/shared/record-opener";
import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
import { RecordExportButton } from "@/components/shared/record-export-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListQuery } from "@/hooks/use-list-query";
import type { ContractorReportFilters, PhotoGroup } from "@/interfaces/contractor-report";
import { useDateFormat } from "@/lib/dates";
import { getCategoryRecord, recordPdfKindFor } from "@/services/contractor-ops.service";
import { getPhotoGroups } from "@/services/contractor-report.service";
import { sheetKindOf } from "@/components/shared/photo-thumb";

const PAGE_SIZE = 20;

export function PhotoGroupsReport({ filters }: { filters: ContractorReportFilters }) {
  const t = useTranslations("contractorReports.photoGroups");
  // The page is in the address with the report's filters (JB29, 客户 10-26:
  // 「查看原始记录后返回，必须回到之前的报表页面，并保留原有筛选条件」): a
  // record that opens on its module's page comes back here, on this page. A
  // new filter starts from page 1 (`useListQuery`).
  const { page, setPage } = useListQuery();
  const groups = useQuery({
    queryKey: ["contractor-reports", "photo-groups", filters, page],
    queryFn: () => getPhotoGroups({ ...filters, page, page_size: PAGE_SIZE }),
  });
  if (groups.isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (groups.isError) {
    return <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>;
  }
  const data = groups.data;
  if (!data || data.results.length === 0) {
    return <p className="p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <div data-photo-groups>
      <ul className="divide-y divide-panel-border">
        {data.results.map((group) => (
          <PhotoGroupRow key={group.key} group={group} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-panel-border px-4 py-3 text-xs text-muted-foreground sm:px-6">
        <span>
          {t("count", { count: data.count })}
          {data.truncated ? ` · ${t("truncated")}` : ""}
        </span>
        {data.total_pages > 1 ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} disabledReason={t("first")} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </Button>
            <span className="tabular-nums">
              {page} / {data.total_pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.total_pages}
              disabledReason={t("last")}
              onClick={() => setPage(page + 1)}
            >
              {t("next")}
            </Button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The whole record under the photograph (J8-3): every field it was filed
 * with, as its own sheet lists them, read through the sheet's door.
 */
function RecordFacts({ kind, id }: { kind: string; id: string }) {
  const t = useTranslations();
  const sheet = sheetKindOf(kind);
  const detail = useQuery({
    queryKey: ["photo-report", "record", kind, id],
    queryFn: () => getCategoryRecord(sheet!, id),
    enabled: Boolean(sheet),
    staleTime: 60_000,
  });
  if (!sheet) return null;
  if (detail.isLoading) return <p className="text-xs text-muted-foreground">{t("archiveQueue.loading")}</p>;
  if (detail.isError || !detail.data) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {t("archiveQueue.failed")}
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-xs" data-photo-record-facts>
      {detail.data.fields.map((field) => (
        <div key={field.key} className="contents">
          <dt className="text-muted-foreground">{t(`mySubmissions.field.${field.key}` as never)}</dt>
          <dd className="whitespace-pre-wrap break-words">
            {field.value}
            {field.unit ? ` ${t(`mySubmissions.unit.${field.unit}` as never)}` : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PhotoGroupRow({ group }: { group: PhotoGroup }) {
  const t = useTranslations("contractorReports.photoGroups");
  const kinds = useTranslations("headquarters.recordKind");
  const df = useDateFormat();
  const opener = useRecordOpener();
  const [open, setOpen] = useState<number | null>(null);
  const moduleName = group.kind
    ? kinds.has(group.kind)
      ? kinds(group.kind)
      : t(`kind.${group.kind === "ATTENDANCE" ? "ATTENDANCE" : "OTHER"}`)
    : t("noRecord");
  const title = [group.reference, moduleName].filter(Boolean).join(" · ");
  const photos: ShellPhoto[] = group.photos.map((photo) => ({
    id: photo.id,
    url: photo.url || photo.thumbnail_url || "",
    thumbnailUrl: photo.thumbnail_url,
    label: title,
    takenAt: photo.captured_at,
    latitude: photo.latitude,
    longitude: photo.longitude,
  }));
  const pdfKind = group.export_kind ? recordPdfKindFor(group.export_kind) : null;
  const openRecord =
    group.kind && group.record_id
      ? () =>
          opener.open(group.kind, group.record_id, {
            reference: title,
            project_id: group.project_id,
            project_name: group.project,
            submitted_at: group.date,
          })
      : null;
  // Not on the row (J43, Lucas 10-22: the row is its words and its
  // photographs only) - in the photo viewer's one row of actions, after the
  // photo's own (JB29).
  const actions = (
    <>
      {/* 「完整证据 PDF ▾」「修改前原单 ▾」 in the same row (JB29). */}
      {pdfKind && group.record_id ? (
        <RecordExportButton
          kind={pdfKind}
          recordId={group.record_id}
          reference={group.reference || title}
          layout="menu"
        />
      ) : null}
      {openRecord ? (
        <Button size="sm" variant="outline" onClick={openRecord}>
          <ExternalLink className="size-4" />
          {t("openRecord")}
        </Button>
      ) : null}
    </>
  );
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6" data-photo-group={group.key}>
      <div className="min-w-0 space-y-0.5 sm:w-60 sm:shrink-0">
        <p className="truncate text-sm font-semibold" title={title}>
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[group.project, group.date ? df.dateTime(group.date) : ""].filter(Boolean).join(" · ")}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {[group.uploaded_by, t("photos", { count: group.photo_count })].filter(Boolean).join(" · ")}
          {group.has_gps ? <MapPin className="size-3 shrink-0 text-success" aria-label={t("hasGps")} /> : null}
        </p>
      </div>
      {/* Equal landscape tiles (4:3, JB34 - the client's 图 8) cut to fill
          from the bottom so the stamped strip stays, side by side; the row
          scrolls when there are more than fit (J8-2). On a phone they wrap. */}
      <ul className="flex min-w-0 flex-1 gap-1.5 max-sm:flex-wrap sm:overflow-x-auto sm:pb-1">
        {group.photos.map((photo, index) => (
          <li key={photo.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={t("openPhoto", { index: index + 1, reference: title })}
              className="relative block aspect-4/3 w-24 overflow-hidden rounded-lg bg-muted ring-1 ring-panel-border transition hover:ring-primary/60 sm:w-32"
            >
              {photo.thumbnail_url ? (
                <Image src={photo.thumbnail_url} alt="" fill sizes="128px" className="object-cover object-bottom" unoptimized />
              ) : (
                <ImageIcon className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && photos[open] ? (
        <PhotoViewer
          photos={photos}
          index={open}
          reference={group.reference || title}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          extraActions={actions}
          details={
            group.kind && group.record_id ? <RecordFacts kind={group.kind} id={group.record_id} /> : undefined
          }
        />
      ) : null}
      {opener.sheet}
    </li>
  );
}
