"use client";

/**
 * 日报告 (2026-10 B17): the list 「日报名称｜日期｜查看」, the report opened in
 * full with the photographs chosen for it, and the form that writes one.
 *
 * Written by the site manager (`progress.manage`), read by everybody who can
 * read progress. A report is usually started from 现场照片 with the day's
 * photographs already ticked; it can also be started here and the
 * photographs picked from the report's day.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  DayRange,
  Pager,
  PhotoGrid,
  PhotoTile,
  ProgressPhotoPicker,
  localDay,
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
import type { DailyReport, ProgressPhoto } from "@/interfaces/progress-reports";
import { useDateFormat } from "@/lib/dates";
import {
  createDailyReport,
  deleteDailyReport,
  getDailyReports,
  updateDailyReport,
} from "@/services/progress-reports.service";

const PAGE = 20;

export function DailyReportsTab() {
  const t = useTranslations("progressPage");
  const df = useDateFormat();
  const { can } = useAuth();
  const list = useListQuery(["project", "date_from", "date_to"]);
  const project = list.filters.project ?? "";
  const rows = useQuery({
    queryKey: ["daily-reports", list.filters, list.page],
    queryFn: () =>
      getDailyReports({ ...list.filters, page: list.page, page_size: PAGE }),
  });
  const [writing, setWriting] = useState(false);
  const [viewing, setViewing] = useState<DailyReport | null>(null);
  const shown = viewing
    ? (rows.data?.results.find((row) => row.id === viewing.id) ?? viewing)
    : null;
  const total = rows.data?.count ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ProjectListFilter list={list} />
        <DayRange
          from={list.filters.date_from ?? ""}
          to={list.filters.date_to ?? ""}
          onChange={(next) => list.setFilters(next)}
        />
        {can("progress.manage") && (
          <Button size="sm" className="ml-auto rounded-full px-4" onClick={() => setWriting(true)}>
            <Pencil />
            {t("reports.write")}
          </Button>
        )}
      </div>
      <QueryFailedNote query={rows} what={t("tabs.reports")} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reports.name")}</TableHead>
              <TableHead className="w-36">{t("reports.date")}</TableHead>
              <TableHead className="w-20 text-right">{t("reports.view")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (rows.data?.results ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  {rows.isError ? "—" : t("reports.empty")}
                </TableCell>
              </TableRow>
            ) : (
              (rows.data?.results ?? []).map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setViewing(row)}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        project ? null : row.project_name,
                        row.author_name,
                        t("reports.photoCount", { count: row.photo_count }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell className="tabular">{df.date(row.report_date)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-primary"
                      aria-label={t("reports.view")}
                      title={t("reports.view")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewing(row);
                      }}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > PAGE && (
        <Pager page={list.page} pages={Math.ceil(total / PAGE)} onPage={list.setPage} />
      )}

      {shown && (
        <DailyReportView report={shown} onClose={() => setViewing(null)} />
      )}
      {writing && (
        <DailyReportDialog
          project={project}
          onClose={() => setWriting(false)}
          onSaved={(saved) => {
            setWriting(false);
            setViewing(saved);
          }}
        />
      )}
    </div>
  );
}

/** One report opened: the whole text and the photographs chosen for it. */
export function DailyReportView({
  report,
  onClose,
}: {
  report: DailyReport;
  onClose: () => void;
}) {
  const t = useTranslations("progressPage");
  const df = useDateFormat();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const viewer = usePhotoViewer(report.photos, report.name);
  if (editing) {
    return (
      <DailyReportDialog
        project={report.project}
        report={report}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
        onRemoved={onClose}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{report.name}</DialogTitle>
          <DialogDescription>
            {[df.date(report.report_date), report.project_name, report.author_name]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {report.body || t("reports.noBody")}
        </p>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("reports.photos")} · {report.photos.length}
          </h3>
          {report.photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reports.noPhotos")}</p>
          ) : (
            <PhotoGrid>
              {report.photos.map((photo, index) => (
                <PhotoTile key={photo.id} photo={photo} onOpen={() => viewer.open(index)} />
              ))}
            </PhotoGrid>
          )}
        </section>
        {can("progress.manage") && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              {t("reports.edit")}
            </Button>
          </DialogFooter>
        )}
        {viewer.viewer}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Write a daily report, or correct one.
 *
 * `photos` arrive ticked when it was started from 现场照片; the report's day
 * is then the day they were taken.
 */
export function DailyReportDialog({
  project: initialProject,
  report,
  photos: initialPhotos,
  onClose,
  onSaved,
  onRemoved,
}: {
  project: string;
  report?: DailyReport;
  photos?: ProgressPhoto[];
  onClose: () => void;
  onSaved: (report: DailyReport) => void;
  onRemoved?: () => void;
}) {
  const t = useTranslations("progressPage");
  const qc = useQueryClient();
  const firstDay = initialPhotos?.length ? localDay(initialPhotos[0].captured_at) : localDay(null);
  const [project, setProject] = useState(report?.project ?? initialPhotos?.[0]?.project ?? initialProject);
  const [day, setDay] = useState(report?.report_date ?? firstDay);
  const [name, setName] = useState(report?.name ?? t("reports.defaultName", { date: firstDay }));
  const [body, setBody] = useState(report?.body ?? "");
  const [photos, setPhotos] = useState<ProgressPhoto[]>(report?.photos ?? initialPhotos ?? []);
  const projectLocked = Boolean(report) || Boolean(initialPhotos?.length);
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        body,
        report_date: day,
        photo_ids: photos.map((photo) => photo.id),
      };
      return report
        ? updateDailyReport(report.id, payload)
        : createDailyReport({ ...payload, project });
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["daily-reports"] });
      onSaved(saved);
    },
  });
  // Removing one written by mistake: a switch, then the button (spec rule 8).
  const [removeArmed, setRemoveArmed] = useState(false);
  const [refusal, setRefusal] = useState("");
  const removal = useMutation({
    mutationFn: () => deleteDailyReport(report!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-reports"] });
      (onRemoved ?? onClose)();
    },
    onError: (error) =>
      setRefusal(error instanceof ApiError ? error.message : t("removeFailed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{report ? t("reports.editTitle") : t("reports.write")}</DialogTitle>
          <DialogDescription>{t("reports.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("project")} required>
            {projectLocked ? (
              <p className="py-2 text-sm font-medium">
                {report?.project_name ?? initialPhotos?.[0]?.project_name}
              </p>
            ) : (
              <ProjectPicker
                value={project}
                onValueChange={(next) => {
                  setProject(next);
                  setPhotos([]);
                }}
                placeholder={t("chooseProject")}
              />
            )}
          </FieldWrapper>
          <FieldWrapper label={t("reports.date")} required>
            <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label={t("reports.name")} required>
          <Input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("reports.body")}>
          <Textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("reports.photos")}>
          <ProgressPhotoPicker
            key={`${project}:${day}`}
            project={project}
            day={day}
            selected={photos}
            onChange={setPhotos}
          />
        </FieldWrapper>
        {report && (
          <div className="space-y-2 rounded-md border border-destructive/20 p-3">
            <label className="flex items-start gap-3">
              <Switch
                checked={removeArmed}
                onCheckedChange={(next) => {
                  setRemoveArmed(next);
                  setRefusal("");
                }}
                aria-label={t("reports.remove.switch")}
              />
              <span>
                <span className="block text-sm font-medium">{t("reports.remove.switch")}</span>
                <span className="block text-xs text-muted-foreground">{t("reports.remove.hint")}</span>
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
                {t("reports.remove.confirm")}
              </Button>
            )}
            {refusal && (
              <p role="alert" className="text-sm text-destructive">
                {refusal}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[
              [project, t("project")],
              [day, t("reports.date")],
              [name.trim(), t("reports.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
