"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AnnouncementDialog } from "@/components/announcements/announcement-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AnnouncementScope } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getProjects } from "@/services/contractor.service";
import {
  getAnnouncements,
  publishAnnouncement,
} from "@/services/contractor-dashboard.service";

const PAGE_SIZE = 20;

/**
 * 公司公告 (C18): what head office has announced, newest first with
 * 已读 x / 共 y, twenty at a time with 【载入更多】, and 【发布公告】 for a new
 * one. A reader without the publish grant sees the ones sent to them.
 */
export function HeadquartersAnnouncements() {
  const t = useTranslations("headquarters.announcements");
  const df = useDateFormat();
  const { can } = useAuth();
  const [opened, setOpened] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["announcements", "list"],
    queryFn: ({ pageParam }) => getAnnouncements({ page: pageParam, page_size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;

  return (
    <div className="space-y-2" data-headquarters-announcements>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {query.data && (
          <span className="text-xs text-muted-foreground">{t("shown", { shown: rows.length, total })}</span>
        )}
        {can("announcement.publish") && (
          <Button size="sm" onClick={() => setPublishing(true)}>
            <Megaphone />
            {t("publish")}
          </Button>
        )}
      </div>
      {query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-lg border">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpened(row.id)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      row.published_by_name,
                      df.dateTime(row.published_at),
                      row.scope === "PROJECTS" ? row.project_names.join("、") : t(`scope.${row.scope}`),
                    ].join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  {row.withdrawn_at && <StatusBadge label={t("withdrawn")} tone="warning" />}
                  {row.recipient_count !== null && (
                    <span className="tabular-nums text-muted-foreground">
                      {t("readCount", { read: row.read_count ?? 0, total: row.recipient_count })}
                    </span>
                  )}
                  {row.is_recipient && !row.my_read_at && <StatusBadge label={t("unread")} tone="info" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetchingNextPage}
            disabledReason={t("loading")}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Loader2 className="animate-spin" />}
            {t("loadMore")}
          </Button>
        </div>
      )}
      {opened && <AnnouncementDialog id={opened} onClose={() => setOpened(null)} />}
      {publishing && <PublishDialog onClose={() => setPublishing(false)} />}
    </div>
  );
}

/** 全公司 / 全部项目 / 指定项目 (only projects the publisher can see). */
function PublishDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("headquarters.announcements");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<AnnouncementScope>("COMPANY");
  const [chosen, setChosen] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const projects = useInfiniteQuery({
    queryKey: ["projects", "announcement-scope"],
    queryFn: ({ pageParam }) => getProjects({ page: pageParam, page_size: 50, sort_by: "name" }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    enabled: scope === "PROJECTS",
  });
  const projectRows = projects.data?.pages.flatMap((page) => page.results) ?? [];
  const publish = useMutation({
    mutationFn: () =>
      publishAnnouncement({
        title: title.trim(),
        body: body.trim(),
        scope,
        projects: scope === "PROJECTS" ? chosen : [],
        files,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("publishTitle")}</DialogTitle>
          <DialogDescription>{t("publishHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <FieldWrapper label={t("titleLabel")} required>
            <Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("bodyLabel")} required>
            <Textarea rows={6} value={body} onChange={(event) => setBody(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("scopeLabel")} required>
            <div role="radiogroup" aria-label={t("scopeLabel")} className="flex flex-wrap gap-1.5">
              {(["COMPANY", "ALL_PROJECTS", "PROJECTS"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={scope === key}
                  onClick={() => setScope(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    scope === key ? "border-primary bg-primary/10 text-primary" : "bg-card",
                  )}
                >
                  {t(`scope.${key}`)}
                </button>
              ))}
            </div>
          </FieldWrapper>
          {scope === "PROJECTS" && (
            <FieldWrapper label={t("projectsLabel")} required>
              {projects.isError ? (
                <LoadFailed onRetry={() => void projects.refetch()} />
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                  {projectRows.map((project) => (
                    <li key={project.id}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={chosen.includes(project.id)}
                          onChange={(event) =>
                            setChosen((current) =>
                              event.target.checked
                                ? [...current, project.id]
                                : current.filter((value) => value !== project.id),
                            )
                          }
                        />
                        {project.code} · {project.name}
                      </label>
                    </li>
                  ))}
                  {projects.hasNextPage && (
                    <li>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => void projects.fetchNextPage()}
                      >
                        {t("moreProjects")}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </FieldWrapper>
          )}
          <FieldWrapper label={t("filesLabel")} optional={t("optional")}>
            <input
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="block w-full text-sm"
            />
          </FieldWrapper>
          <p className="text-xs text-muted-foreground">{t("fixedHelp")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[
              [title.trim(), t("titleLabel")],
              [body.trim(), t("bodyLabel")],
              [scope !== "PROJECTS" || chosen.length > 0, t("projectsLabel")],
            ]}
            disabled={publish.isPending}
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("publishAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
