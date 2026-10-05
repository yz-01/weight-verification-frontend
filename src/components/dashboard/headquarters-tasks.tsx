"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldTaskSheet } from "@/components/dashboard/field-task-sheet";
import { useAuth } from "@/components/providers/auth-provider";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getProjectAssignments } from "@/services/contractor.service";
import { createFieldTask, getFieldTasks } from "@/services/contractor-ops.service";

type Pile = "open" | "done" | "overdue";
const PAGE_SIZE = 20;

/**
 * 总部任务 (C17): what head office has set the projects' people, in the three
 * piles it watches - 未完成, 已完成, 已逾期 (the same 逾期 as the company
 * figure: past due and not confirmed) - with 内容、期限、负责人、结果 and the
 * conversation one click away, and 【发布任务】 for a new one.
 */
export function HeadquartersTasks() {
  const t = useTranslations("headquarters.tasks");
  const ops = useTranslations("contractorOps");
  const df = useDateFormat();
  const { can } = useAuth();
  const [pile, setPile] = useState<Pile>("open");
  const [project, setProject] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["field-tasks", "headquarters", pile, project],
    queryFn: ({ pageParam }) =>
      getFieldTasks({
        origin: "HQ",
        [pile]: "1",
        project: project || undefined,
        page: pageParam,
        page_size: PAGE_SIZE,
        sort_by: "due_at",
        sort_order: pile === "done" ? "desc" : "asc",
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;

  return (
    <div className="space-y-2" data-headquarters-tasks>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("piles")} className="flex gap-1">
            {(["open", "done", "overdue"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={pile === key}
                onClick={() => setPile(key)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  pile === key ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted/40",
                )}
              >
                {t(`pile.${key}`)}
              </button>
            ))}
          </div>
          <ProjectPicker
            value={project || "all"}
            onValueChange={(next) => setProject(next === "all" ? "" : next)}
            placeholder={t("allProjects")}
            allowAll
            allLabel={t("allProjects")}
            className="w-full sm:w-56"
          />
        </div>
        {can("field_task.manage") && (
          <Button size="sm" onClick={() => setPublishing(true)}>
            <Plus />
            {t("publish")}
          </Button>
        )}
      </div>
      {query.data && (
        <p className="text-xs text-muted-foreground">{t("shown", { shown: rows.length, total })}</p>
      )}
      {query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t(`empty.${pile}`)}</p>
      ) : (
        <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-lg border">
          {rows.map((row) => {
            const late = !!row.is_overdue;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpened(row.id)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[row.project_name, row.assigned_to_name, row.due_at ? t("dueAt", { at: df.dateTime(row.due_at) }) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {row.result_note && (
                      <span className="block truncate text-xs">{t("resultShort", { result: row.result_note })}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge
                      label={ops(`taskStatus.${row.status}`)}
                      tone={row.status === "ACCEPTED" ? "positive" : row.status === "SUBMITTED" ? "info" : "neutral"}
                    />
                    {late && <StatusBadge label={t("overdue")} tone="danger" />}
                  </span>
                </button>
              </li>
            );
          })}
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
      {opened && <FieldTaskSheet id={opened} onClose={() => setOpened(null)} />}
      {publishing && <PublishTaskDialog onClose={() => setPublishing(false)} />}
    </div>
  );
}

/** 选择项目 → 指定负责人 → 内容 → 截止时间 → 发布 (C17). */
function PublishTaskDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("headquarters.tasks");
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [assignee, setAssignee] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [due, setDue] = useState("");
  const team = useQuery({
    queryKey: ["project-assignments", project],
    queryFn: () => getProjectAssignments(project),
    enabled: Boolean(project),
  });
  const publish = useMutation({
    mutationFn: () =>
      createFieldTask({
        project,
        title: title.trim(),
        task_type: "OTHER",
        instructions: content.trim(),
        assigned_to: assignee,
        due_at: new Date(due).toISOString(),
        priority: "NORMAL",
        evidence_required: 0,
        origin: "HQ",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["field-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["contractor-dashboard"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("publishTitle")}</DialogTitle>
          <DialogDescription>{t("publishHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <FieldWrapper label={t("project")} required>
            <ProjectPicker
              value={project}
              onValueChange={(next) => {
                setProject(next);
                setAssignee("");
              }}
              placeholder={t("chooseProject")}
              className="w-full"
            />
          </FieldWrapper>
          <FieldWrapper label={t("assignee")} required>
            <Select value={assignee || undefined} onValueChange={setAssignee} disabled={!project}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("chooseAssignee")} />
              </SelectTrigger>
              <SelectContent>
                {(team.data?.results ?? []).map((item) => (
                  <SelectItem key={item.user} value={item.user}>
                    {item.user_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={team} what={t("projectPeople")} />
          </FieldWrapper>
          <FieldWrapper label={t("taskTitle")} required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("content")} required>
            <Textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("due")} required>
            <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[
              [project, t("project")],
              [assignee, t("assignee")],
              [title.trim(), t("taskTitle")],
              [content.trim(), t("content")],
              [due, t("due")],
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
