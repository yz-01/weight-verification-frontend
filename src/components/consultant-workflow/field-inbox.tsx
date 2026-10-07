"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, FilePlus2, Loader2, MapPin, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { FieldTask } from "@/interfaces/contractor-ops";
import { consultantTaskTitle } from "@/lib/consultant-task-title";
import { useDateFormat } from "@/lib/dates";
import { getFieldTasks } from "@/services/contractor-ops.service";

/**
 * Where the new application goes when the office presses 「整理成顾问申请」:
 * the create form, prefilled from the submission, carrying only the ticked
 * photos. The server links exactly those to the draft (C1).
 */
export function organizeHref(taskId: string, photoIds: readonly string[]) {
  const query = new URLSearchParams({ source_field_task: taskId });
  if (photoIds.length) query.set("photos", photoIds.join(","));
  return `/consultant-applications/create?${query.toString()}`;
}

/** One tick on or off, keeping the order the photos were taken in. */
export function toggleTicked(
  ticked: readonly string[],
  id: string,
  order: readonly string[],
): string[] {
  const next = new Set(ticked);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return order.filter((value) => next.has(value));
}

/**
 * 「待整理现场资料」 - the 顾问申请 page's tab for what the site sent in and
 * nobody has made into an application yet (2026-10 C1, Q2).
 *
 * It replaces the separate 「现场资料收件箱」 menu entry: the inbox is the
 * first step of an application, so it lives on the applications page. Cards
 * and thumbnails are small - a page of submissions is a list, not a wall of
 * photographs - and each photo is ticked straight on its thumbnail; the
 * magnifier opens the shared viewer to read it first.
 */
export function ConsultantFieldInbox({
  project,
  focusedTaskId = null,
}: {
  project: string;
  /** A notification links here with ?task=: that one is shown first, marked. */
  focusedTaskId?: string | null;
}) {
  const t = useTranslations("consultantWorkflow.inbox");
  const askFor = useTranslations("fieldStaffPwa.consultantCapture");
  const df = useDateFormat();
  const router = useRouter();
  const [ticked, setTicked] = useState<Record<string, string[]>>({});
  const [viewing, setViewing] = useState<{ task: FieldTask; index: number } | null>(null);
  const rows = useQuery({
    queryKey: ["field-tasks", "to-organize", project],
    queryFn: () =>
      getFieldTasks({ to_organize: "1", project: project || undefined, page_size: 100 }),
  });
  const typeLabel = (code: string) =>
    askFor.has(`askOption.${code}`) ? askFor(`askOption.${code}` as never) : null;

  if (rows.isLoading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }
  if (rows.isError) {
    return <QueryFailedNote query={rows} what={t("what")} />;
  }
  const tasks = [...(rows.data?.results ?? [])].sort((a, b) =>
    a.id === focusedTaskId ? -1 : b.id === focusedTaskId ? 1 : 0,
  );
  if (!tasks.length) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/15 p-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      <div className="grid gap-2 lg:grid-cols-2">
        {tasks.map((task) => {
          const order = task.photos.map((photo) => photo.id);
          const chosen = ticked[task.id] ?? [];
          const allTicked = chosen.length === order.length && order.length > 0;
          return (
            <article
              key={task.id}
              data-testid="field-inbox-card"
              className={`rounded-lg border bg-card p-3 shadow-sm ${
                task.id === focusedTaskId ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {consultantTaskTitle(task, typeLabel)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {task.project_name}
                    {task.created_by_name ? ` · ${task.created_by_name}` : ""}
                    {task.submitted_at ? ` · ${df.dateTime(task.submitted_at)}` : ""}
                  </p>
                </div>
                {order.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() =>
                      setTicked((current) => ({
                        ...current,
                        [task.id]: allTicked ? [] : order,
                      }))
                    }
                  >
                    {t(allTicked ? "untickAll" : "tickAll")}
                  </Button>
                ) : null}
              </div>
              {task.work_location ? (
                <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0" />
                  {task.work_location}
                </p>
              ) : null}
              {task.instructions ? (
                <p className="mt-1 line-clamp-2 text-xs">{task.instructions}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {task.photos.map((photo, index) => {
                  const on = chosen.includes(photo.id);
                  const url = photo.watermarked || photo.image;
                  return (
                    <div key={photo.id} className="relative size-16 shrink-0">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={t("tickPhoto", { number: index + 1 })}
                        data-photo-tick={photo.id}
                        onClick={() =>
                          setTicked((current) => ({
                            ...current,
                            [task.id]: toggleTicked(current[task.id] ?? [], photo.id, order),
                          }))
                        }
                        className={`block size-16 overflow-hidden rounded-md border-2 ${
                          on ? "border-primary" : "border-transparent"
                        } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                      >
                        <Image
                          src={url}
                          alt=""
                          width={128}
                          height={128}
                          unoptimized
                          className="size-full object-cover"
                        />
                        <span
                          className={`absolute left-1 top-1 grid size-4 place-items-center rounded-sm border ${
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white bg-black/30"
                          }`}
                        >
                          {on ? <Check className="size-3" /> : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t("viewPhoto", { number: index + 1 })}
                        onClick={() => setViewing({ task, index })}
                        className="absolute right-0.5 bottom-0.5 grid size-5 place-items-center rounded-full bg-background/85 text-foreground shadow-sm"
                      >
                        <ZoomIn className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("ticked", { count: chosen.length, total: order.length })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  data-slot="organize-application"
                  disabled={!chosen.length}
                  disabledReason={t("tickFirst")}
                  onClick={() => router.push(organizeHref(task.id, chosen))}
                >
                  <FilePlus2 />
                  {t("organize")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {viewing ? (
        <PhotoViewer
          photos={viewing.task.photos.map(
            (photo, index): ShellPhoto => ({
              id: photo.id,
              url: photo.watermarked || photo.image,
              label: `${index + 1} / ${viewing.task.photos.length}`,
              takenAt: photo.captured_at,
              latitude: photo.latitude,
              longitude: photo.longitude,
            }),
          )}
          index={viewing.index}
          reference={consultantTaskTitle(viewing.task, typeLabel)}
          onIndex={(index) => setViewing({ task: viewing.task, index })}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
