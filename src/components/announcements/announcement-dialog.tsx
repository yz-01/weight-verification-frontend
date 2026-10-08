"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompanyAnnouncement } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  getAnnouncement,
  getAnnouncementReaders,
  readAnnouncement,
  withdrawAnnouncement,
} from "@/services/contractor-dashboard.service";

/**
 * One 公司公告 (C18), opened.
 *
 * Opening it as a recipient records the first read - and nothing else: the
 * notice it came from stays where it is until dismissed, and no task or
 * other notice is touched (D04). A withdrawn announcement says so above the
 * words it published, which are never changed. Head office also sees who it
 * reached (已读 x / 共 y, and the two lists) and can withdraw it.
 */
export function AnnouncementDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("headquarters.announcements");
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["announcements", "detail", id],
    queryFn: () => getAnnouncement(id),
  });
  const read = useMutation({
    mutationFn: () => readAnnouncement(id),
    onSuccess: (row) => {
      queryClient.setQueryData(["announcements", "detail", id], row);
      void queryClient.invalidateQueries({ queryKey: ["announcements", "list"] });
      // The reader may be in the list below, loaded before this read landed.
      void queryClient.invalidateQueries({ queryKey: ["announcements", "readers", id] });
    },
  });
  const asked = useRef(false);
  const row = detail.data;
  useEffect(() => {
    if (!row || asked.current || !row.is_recipient || row.my_read_at) return;
    asked.current = true;
    read.mutate();
  }, [read, row]);
  const withdraw = useMutation({
    mutationFn: () => withdrawAnnouncement(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(["announcements", "detail", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["announcements", "list"] });
    },
  });
  const publisher = can("announcement.publish");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-announcement={id}>
        <DialogHeader>
          <DialogTitle>{row?.title ?? t("loading")}</DialogTitle>
          {row && (
            <DialogDescription>
              {[row.published_by_name, df.dateTime(row.published_at), scopeText(row, t)].join(" · ")}
            </DialogDescription>
          )}
        </DialogHeader>
        {detail.isError ? (
          <LoadFailed onRetry={() => void detail.refetch()} />
        ) : !row ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-4">
            {row.withdrawn_at && (
              <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm" data-withdrawn>
                <Ban className="size-4 text-warning" aria-hidden />
                {t("withdrawnNote", {
                  who: row.withdrawn_by_name ?? "—",
                  at: df.dateTime(row.withdrawn_at),
                })}
              </p>
            )}
            <p className={cn("whitespace-pre-wrap text-sm", row.withdrawn_at && "text-muted-foreground")}>
              {row.body}
            </p>
            {row.attachments.length > 0 && (
              <ul className="space-y-1">
                {row.attachments.map((file) => (
                  <li key={file.id}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Paperclip className="size-3.5" aria-hidden />
                      {file.original_name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {row.is_recipient && row.my_read_at && (
              <p className="text-xs text-muted-foreground">
                {t("readAt", { at: df.dateTime(row.my_read_at) })}
              </p>
            )}
            {publisher && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {t("readCount", {
                      read: row.read_count ?? 0,
                      total: row.recipient_count ?? 0,
                    })}
                  </p>
                  {!row.withdrawn_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate()}
                    >
                      <Ban />
                      {t("withdraw")}
                    </Button>
                  )}
                </div>
                <Readers id={row.id} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function scopeText(row: CompanyAnnouncement, t: ReturnType<typeof useTranslations>) {
  if (row.scope === "PROJECTS") return t("scopeProjectsNamed", { projects: row.project_names.join("、") });
  return t(`scope.${row.scope}`);
}

/** Who it reached: read and not yet read, each paged. */
function Readers({ id }: { id: string }) {
  const t = useTranslations("headquarters.announcements");
  const df = useDateFormat();
  const [read, setRead] = useState<"1" | "0">("0");
  const query = useInfiniteQuery({
    queryKey: ["announcements", "readers", id, read],
    queryFn: ({ pageParam }) => getAnnouncementReaders(id, { page: pageParam, page_size: 20, read }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <div className="space-y-2">
      <div role="group" aria-label={t("readers")} className="flex flex-wrap gap-2">
        {(["0", "1"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={read === value}
            onClick={() => setRead(value)}
            className={cn(
              "inline-flex min-h-8 items-center rounded-full border px-3 text-xs transition-colors",
              read === value ? "border-primary bg-primary/10 text-primary" : "bg-card",
            )}
          >
            {value === "1" ? t("readers_read") : t("readers_unread")}
          </button>
        ))}
      </div>
      {query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("nobody")}</p>
      ) : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate">
                {row.full_name}
                {row.role_name && <span className="text-xs text-muted-foreground"> · {row.role_name}</span>}
              </span>
              {row.read_at ? (
                <span className="shrink-0 text-xs text-muted-foreground">{df.dateTime(row.read_at)}</span>
              ) : (
                <StatusBadge label={t("notRead")} tone="neutral" />
              )}
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
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
      )}
    </div>
  );
}
