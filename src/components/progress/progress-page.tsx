"use client";

/**
 * 工程进度 as one page with five tabs (2026-10 B17):
 * 施工分类 | 现场照片 | 日报告 | 施工计划 | 项目进度摘要.
 *
 * The boss opens one page and finds the site's photographs, the daily
 * reports written from them, the schedule, and a summary the project
 * manager arranges himself. The tab is in the address (`?tab=`), and the
 * project chosen (`?project=`) travels from one tab to the next.
 *
 * 施工计划 is `SchedulePlanningWorkspace` itself. `/schedule` still opens it
 * on its own; the left menu no longer lists it (Q9) - this tab is the way in.
 *
 * 现场照片 opens on the photographs; 「进度记录」 beside it is the record list
 * the page used to be (detail, remarks, upload, conversation, 确认归档,
 * export), unchanged.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2, PenLine, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { SiteProgressOffice } from "@/components/contractor-ops/office-module-lists";
import { DailyReportDialog, DailyReportView, DailyReportsTab } from "@/components/progress/daily-reports";
import { PhaseTab } from "@/components/progress/phase-tab";
import {
  DayRange,
  Pager,
  PhotoGrid,
  PhotoTile,
  usePhotoViewer,
} from "@/components/progress/progress-photos";
import { ProgressSummaryTab } from "@/components/progress/progress-summary";
import { useAuth } from "@/components/providers/auth-provider";
import { FilterSelect, ProjectListFilter } from "@/components/shared/module-records-table";
import { ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { SchedulePlanningWorkspace } from "@/components/schedule-planning/schedule-planning-workspace";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListQuery } from "@/hooks/use-list-query";
import type { DailyReport, ProgressPhoto } from "@/interfaces/progress-reports";
import { cn } from "@/lib/utils";
import { getConstructionPhases } from "@/services/contractor-ops.service";
import { getProgressPhotos } from "@/services/progress-reports.service";

export const PROGRESS_TABS = ["phases", "photos", "reports", "schedule", "summary"] as const;
export type ProgressTab = (typeof PROGRESS_TABS)[number];

/** The tab a reader opens on: the photographs, as `/progress` always did. */
export const DEFAULT_PROGRESS_TAB: ProgressTab = "photos";

/** The tabs this reader has: 施工计划 only with the schedule feature. */
export function progressTabsFor(features: readonly string[] | undefined): ProgressTab[] {
  return PROGRESS_TABS.filter(
    (tab) => tab !== "schedule" || (features ?? []).includes("schedule"),
  );
}

/** The parameters that survive a change of tab: which site, nothing else. */
export function progressTabHref(tab: ProgressTab, params: URLSearchParams): string {
  const next = new URLSearchParams();
  next.set("tab", tab);
  const project = params.get("project");
  if (project) next.set("project", project);
  return `/progress?${next.toString()}`;
}

function useProgressTab() {
  const { user } = useAuth();
  const params = useSearchParams();
  const tabs = progressTabsFor(user?.features);
  const asked = params.get("tab") as ProgressTab | null;
  const active: ProgressTab =
    asked && tabs.includes(asked) ? asked : DEFAULT_PROGRESS_TAB;
  return { tabs, active, params };
}

/** The five tabs, under the page title. Scrolls sideways on a phone. */
export function ProgressTabStrip() {
  const t = useTranslations("progressPage.tabs");
  const router = useRouter();
  const { tabs, active, params } = useProgressTab();
  return (
    <Tabs
      value={active}
      onValueChange={(next) =>
        router.replace(progressTabHref(next as ProgressTab, params), { scroll: false })
      }
      className="max-w-full"
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList aria-label={t("label")}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="px-3">
              {t(tab)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

export function ProgressPage() {
  const tNav = useTranslations("nav.submodule");
  const t = useTranslations("progressPage");
  const { active, params } = useProgressTab();
  const title = tNav("progressRecords");

  // The record list keeps its own header (title, count, add, export); the
  // tabs and the photo / record switch sit under it.
  if (active === "photos" && params.get("view") === "records") {
    return (
      <SiteProgressOffice
        above={
          <>
            <ProgressTabStrip />
            <PhotoViewSwitch />
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <ListHeader title={title} subtitle={t(`subtitle.${active}`)} />
      <ProgressTabStrip />
      {active === "phases" && <PhaseTab />}
      {active === "photos" && <SitePhotosTab />}
      {active === "reports" && <DailyReportsTab />}
      {active === "schedule" && <ScheduleTab />}
      {active === "summary" && <ProgressSummaryTab />}
    </div>
  );
}

/**
 * 施工计划: the schedule workspace on the project the other four tabs use
 * (`?project=`), so switching tabs keeps the site (B4 audit #7).
 */
function ScheduleTab() {
  const list = useListQuery(["project"]);
  return (
    <SchedulePlanningWorkspace
      project={list.filters.project ?? ""}
      onProjectChange={(project) => list.setFilters({ project })}
    />
  );
}

/** 照片 | 进度记录: the same photographs, as a wall or as their records. */
function PhotoViewSwitch() {
  const t = useTranslations("progressPage.photos");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "records" ? "records" : "wall";
  const go = (next: "wall" | "records") => {
    const query = new URLSearchParams();
    query.set("tab", "photos");
    if (next === "records") query.set("view", "records");
    for (const key of ["project", "phase", "date_from", "date_to"]) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs" role="group" aria-label={t("viewLabel")}>
      {(["wall", "records"] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          onClick={() => go(key)}
          className={cn(
            "rounded px-2.5 py-1 font-medium",
            view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {t(key === "wall" ? "viewWall" : "viewRecords")}
        </button>
      ))}
    </div>
  );
}

const WALL_PAGE = 48;

/**
 * 现场照片: every progress photograph, newest first, found by day and
 * 施工分类. Tick some and 「填写日报告」 writes that day's report with them.
 */
export function SitePhotosTab() {
  const t = useTranslations("progressPage");
  const { can } = useAuth();
  const list = useListQuery(["project", "phase", "date_from", "date_to"]);
  const project = list.filters.project ?? "";
  const photos = useQuery({
    queryKey: ["progress-photos", "wall", list.filters, list.page],
    queryFn: () =>
      getProgressPhotos({ ...list.filters, page: list.page, page_size: WALL_PAGE }),
  });
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () => getConstructionPhases({ project: project || undefined, page_size: 200 }),
  });
  const rows = photos.data?.results ?? [];
  const total = photos.data?.count ?? 0;
  const [selected, setSelected] = useState<ProgressPhoto[]>([]);
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState<DailyReport | null>(null);
  const [mixed, setMixed] = useState(false);
  const viewer = usePhotoViewer(rows, t("tabs.photos"));
  const chosen = new Set(selected.map((photo) => photo.id));
  const canWrite = can("progress.manage");
  const toggle = (photo: ProgressPhoto) => {
    if (chosen.has(photo.id)) {
      setSelected(selected.filter((row) => row.id !== photo.id));
      setMixed(false);
      return;
    }
    // One report is about one site: photographs of two projects cannot go
    // into it together.
    if (selected.length && selected[0].project !== photo.project) {
      setMixed(true);
      return;
    }
    setMixed(false);
    setSelected([...selected, photo]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PhotoViewSwitch />
        <ProjectListFilter list={list} />
        <FilterSelect
          list={list}
          param="phase"
          allLabel={t("photos.allPhases")}
          options={(phases.data?.results ?? []).map((phase) => ({
            value: phase.id,
            label: project ? phase.name : `${phase.name} · ${phase.project_name ?? ""}`,
          }))}
        />
        <DayRange
          from={list.filters.date_from ?? ""}
          to={list.filters.date_to ?? ""}
          onChange={(next) => list.setFilters(next)}
        />
      </div>
      <QueryFailedNote query={photos} what={t("tabs.photos")} />
      <QueryFailedNote query={phases} what={t("tabs.phases")} />

      {canWrite && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            selected.length ? "border-primary/40 bg-primary/5" : "border-dashed bg-muted/20",
          )}
        >
          <span className="text-muted-foreground">
            {selected.length
              ? t("photos.selected", { count: selected.length })
              : t("photos.selectHint")}
          </span>
          {mixed && (
            <span role="alert" className="text-xs text-destructive">
              {t("photos.oneProject")}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {selected.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                <X />
                {t("photos.clear")}
              </Button>
            )}
            <Button size="sm" className="rounded-full px-4" onClick={() => setWriting(true)}>
              <PenLine />
              {t("reports.write")}
            </Button>
          </div>
        </div>
      )}

      {photos.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {photos.isError ? "—" : t("photos.empty")}
        </p>
      ) : (
        <PhotoGrid>
          {rows.map((photo, index) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              onOpen={() => viewer.open(index)}
              {...(canWrite
                ? {
                    selected: chosen.has(photo.id),
                    onToggle: () => toggle(photo),
                    toggleLabel: chosen.has(photo.id) ? t("photos.unselect") : t("photos.select"),
                  }
                : {})}
            />
          ))}
        </PhotoGrid>
      )}
      {total > WALL_PAGE && (
        <Pager page={list.page} pages={Math.ceil(total / WALL_PAGE)} onPage={list.setPage} />
      )}
      {viewer.viewer}

      {writing && (
        <DailyReportDialog
          project={project}
          photos={selected}
          onClose={() => setWriting(false)}
          onSaved={(report) => {
            setWriting(false);
            setSelected([]);
            setWritten(report);
          }}
        />
      )}
      {written && (
        <DailyReportView
          report={written}
          onClose={() => setWritten(null)}
          onSaved={setWritten}
        />
      )}
    </div>
  );
}
