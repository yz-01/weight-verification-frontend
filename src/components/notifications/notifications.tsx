"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, BellPlus, Check, Loader2, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import { officeNotificationHref } from "@/lib/office-notification";
import {
  getProjectAssignments,
  getProjects,
} from "@/services/contractor.service";
import {
  getNotifications,
  dismissNotification,
  confirmNotificationDone,
  getOutstandingNotificationCount,
  sendProjectNotification,
} from "@/services/platform-ops.service";

/**
 * The notification centre, and - narrowed to one card - My Tasks (D-207).
 *
 * One component rather than two. My Tasks is this list with `card=ACTION`:
 * the same rows, the same confirm button, the same counts. Writing a second
 * screen over a second query would give the two of them two chances to
 * disagree about the same pile, which is the F-229 bug in a new place.
 *
 * What the narrowed view drops is everything that belongs to *reading* mail
 * rather than *doing* work: composing a notice, and the category filter.
 */
export function Notifications({
  card,
  titleKey = "notifications.title",
}: {
  card?: "ACTION";
  titleKey?: string;
} = {}) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const list = useListQuery(["category", "today"]);
  const [composeOpen, setComposeOpen] = useState(
    searchParams.get("create") === "1" && can("notification.send"),
  );
  const query = useQuery({
    queryKey: ["notifications", card ?? "all", list.query],
    queryFn: () => getNotifications(card ? { ...list.query, card } : list.query),
    refetchInterval: 30_000,
  });

  /**
   * The two group sizes shown on the filter pills (D-206).
   *
   * Taken from the same endpoint the bell uses rather than counted off this
   * page's current filter, so the pills say the same thing as the red dot.
   * A pill that reports the size of the group you are already looking at is
   * no help in deciding whether to look at the other one.
   */
  const counts = useQuery({
    queryKey: ["notifications", "outstanding-count"],
    queryFn: () => getOutstandingNotificationCount({ silent: true }),
    refetchInterval: 30_000,
  });
  // A failed count is not a zero (F-222): the pill shows a dash instead.
  const pillCount = (value: number | undefined) =>
    counts.isError ? t("common.emptyValue") : (value ?? 0);

  const confirm = useMutation({
    mutationFn: confirmNotificationDone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const dismiss = useMutation({
    mutationFn: dismissNotification,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const columns = useMemo<ColumnDef<NotificationRow, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        meta: { label: t("notifications.field.time") },
        header: ({ column }) => (
          <SortableHeader
            label={t("notifications.field.time")}
            isSorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {df.dateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "kind",
        meta: { label: t("notifications.field.kind") },
        header: () => t("notifications.field.kind"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`notifications.kind.${notificationKindKey(row.original.kind)}`)}
            tone={row.original.kind === "EXCEPTION" ? "danger" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "title",
        meta: { label: t("notifications.field.notification") },
        header: () => t("notifications.field.notification"),
        cell: ({ row }) => (
          <div className="max-w-xl">
            <p className="font-semibold">{row.original.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {row.original.message}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        meta: { label: t("notifications.field.status") },
        header: () => t("notifications.field.status"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`notifications.state.${row.original.state}`)}
            tone={row.original.state === "PENDING" ? "info" : "neutral"}
          />
        ),
      },
      {
        id: "actions",
        meta: { label: t("common.actions") },
        header: () => null,
        cell: ({ row }) => {
          // The same destination the pop-up card opens, so this list is not a
          // dead end for the cards that fall back to it.
          const href = officeNotificationHref(row.original.data);
          return (
            <div className="flex items-center justify-end gap-0.5">
              {href && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-primary"
                  title={t("notifications.actionCards.open")}
                >
                  <Link href={href} aria-label={t("notifications.actionCards.open")}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              {row.original.is_outstanding && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t("notifications.confirmDone")}
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(row.original.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                title={t("notifications.remove")}
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(row.original.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [confirm, df, dismiss, t],
  );

  const count = query.data?.count ?? 0;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t(titleKey)}
        subtitle={
          query.isLoading
            ? t("common.loading")
            : t("notifications.count", { count })
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!card && can("notification.send") && (
              <Button size="sm" onClick={() => setComposeOpen(true)}>
                <BellPlus className="h-4 w-4" />
                {t("notifications.compose.action")}
              </Button>
            )}
          </div>
        }
      />
      <DataTable
        columns={columns}
        rows={query.data?.results ?? []}
        totalCount={count}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={query.isLoading}
        isError={query.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="notifications"
        filterPills={[
          {
            key: "all",
            label: t("notifications.filter.allOutstanding", {
              // Narrowed to one card, "all outstanding" means all of *that*
              // card. Showing the whole pile's size above a list that holds
              // part of it is how the two halves start disagreeing (F-229).
              count: pillCount(
                card === "ACTION" ? counts.data?.action : counts.data?.total,
              ),
            }),
            active: !list.filters.today,
            onSelect: () => list.setFilter("today", undefined),
          },
          // 今天新增 / 之前未完成 belong to the centre (D-206). Their counts
          // come from the whole pile, so a narrowed list would show numbers
          // that are not about the rows under them - better absent than wrong.
          ...(card
            ? []
            : [
                {
                  key: "today",
                  label: t("notifications.filter.newToday", {
                    count: pillCount(counts.data?.today),
                  }),
                  active: list.filters.today === "true",
                  onSelect: () => list.setFilter("today", "true"),
                },
                {
                  key: "earlier",
                  label: t("notifications.filter.stillOpen", {
                    count: pillCount(counts.data?.earlier),
                  }),
                  active: list.filters.today === "false",
                  onSelect: () => list.setFilter("today", "false"),
                },
              ]),
        ]}
        toolbarActions={
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            <QueryFailedNote query={counts} what={t("notifications.what.counts")} className="basis-full justify-end" />
            {/* Categorising mail is a reading job, not a working one. */}
            {card ? null : (
            <Select
              value={list.filters.category ?? "all"}
              onValueChange={(value) =>
                list.setFilter("category", value === "all" ? undefined : value)
              }
            >
              <SelectTrigger
                className="h-9 min-w-32 rounded-full"
                aria-label={t("notifications.filter.category")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("notifications.filter.allCategories")}</SelectItem>
                <SelectItem value="BILLING">{t("notifications.filter.billing")}</SelectItem>
                <SelectItem value="WEIGHING">{t("notifications.filter.weighing")}</SelectItem>
                <SelectItem value="ORDER">{t("notifications.filter.order")}</SelectItem>
                <SelectItem value="SYSTEM">{t("notifications.filter.system")}</SelectItem>
              </SelectContent>
            </Select>
            )}
          </div>
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
      {composeOpen && (
        <ProjectNotificationDialog
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }}
        />
      )}
    </div>
  );
}

function notificationKindKey(kind: string): string {
  if (kind === "PLATFORM_ANNOUNCEMENT") return "ANNOUNCEMENT";
  if (kind.startsWith("DRIVER_TASK")) return "DRIVER_TASK";
  if (kind.startsWith("waste.") || kind === "ORDER") return "DISPATCH";
  if (kind.includes("WEIGH")) return "WEIGHING";
  if (kind.includes("BILL") || kind.includes("PAYMENT") || kind.includes("COMMISSION")) {
    return "BILLING";
  }
  if (kind.includes("SUBSCRIPTION")) return "SUBSCRIPTION";
  if (kind.includes("PARTNER")) return "PARTNERSHIP";
  if (kind.includes("SAFETY") || kind.startsWith("incident.")) return "SAFETY";
  if (kind.includes("ACCESS")) return "ACCESS";
  if (kind.includes("ASSET")) return "ASSET";
  const known = new Set([
    "SYSTEM",
    "APPROVAL",
    "EVENT",
    "REMINDER",
    "EXCEPTION",
    "PROJECT_NOTICE",
    "COMPANY",
    "DISPATCH",
  ]);
  return known.has(kind) ? kind : "EVENT";
}

function ProjectNotificationDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useTranslations("notifications.compose");
  const [project, setProject] = useState("");
  const [recipientScope, setRecipientScope] = useState<"ALL" | "ROLE" | "PEOPLE">("ALL");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientRoles, setRecipientRoles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const projects = useQuery({
    queryKey: ["projects", "notification-compose"],
    queryFn: () =>
      getProjects({ page_size: 100, status: "ACTIVE", sort_by: "name" }),
  });
  const members = useQuery({
    queryKey: ["project-assignments", project, "notification-compose"],
    queryFn: () => getProjectAssignments(project),
    enabled: Boolean(project),
  });
  const memberRows = members.data?.results ?? [];
  const roleRows = Array.from(
    memberRows.reduce((rows, member) => {
      const current = rows.get(member.role_code);
      rows.set(member.role_code, {
        code: member.role_code,
        name: member.role_name,
        count: (current?.count ?? 0) + 1,
      });
      return rows;
    }, new Map<string, { code: string; name: string; count: number }>()),
  ).map(([, row]) => row);

  const save = useMutation({
    mutationFn: () =>
      sendProjectNotification({
        project_id: project,
        recipient_scope: recipientScope,
        recipient_ids: recipients,
        recipient_role_codes: recipientRoles,
        title: title.trim(),
        message: message.trim(),
      }),
    onSuccess: () => {
      onSent();
      onClose();
    },
  });

  const allSelected =
    memberRows.length > 0 && recipients.length === memberRows.length;
  const toggleRecipient = (id: string, checked: boolean) => {
    setRecipients((current) =>
      checked
        ? Array.from(new Set([...current, id]))
        : current.filter((value) => value !== id),
    );
  };
  const toggleRole = (code: string, checked: boolean) => {
    setRecipientRoles((current) =>
      checked
        ? Array.from(new Set([...current, code]))
        : current.filter((value) => value !== code),
    );
  };
  const recipientsReady =
    memberRows.length > 0 &&
    (recipientScope === "ALL" ||
      (recipientScope === "ROLE" && recipientRoles.length > 0) ||
      (recipientScope === "PEOPLE" && recipients.length > 0));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("project")} required>
            <Select
              value={project || undefined}
              onValueChange={(value) => {
                setProject(value);
                setRecipients([]);
                setRecipientRoles([]);
              }}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder={t("selectProject")} />
              </SelectTrigger>
              <SelectContent>
                {(projects.data?.results ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} - {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={projects} what={t("whatProjects")} />
          </FieldWrapper>

          <FieldWrapper label={t("audience")} required hint={t("audienceHelp")}>
            <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1">
              {(["ALL", "ROLE", "PEOPLE"] as const).map((scope) => (
                <Button
                  key={scope}
                  type="button"
                  variant={recipientScope === scope ? "default" : "ghost"}
                  className="h-9"
                  onClick={() => setRecipientScope(scope)}
                >
                  {t(`scope.${scope}`)}
                </Button>
              ))}
            </div>
          </FieldWrapper>

          <FieldWrapper label={t("recipients")} required hint={t("recipientsHelp")}>
            {!project ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t("chooseProjectFirst")}
              </p>
            ) : members.isError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {t("membersFailed")}
              </p>
            ) : members.isLoading ? (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />{t("loadingMembers")}
              </p>
            ) : memberRows.length === 0 ? (
              <p className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
                {t("noMembers")}
              </p>
            ) : recipientScope === "ALL" ? (
              <p className="rounded-lg border bg-muted/20 p-4 text-sm">
                {t("allRecipients", { count: memberRows.length })}
              </p>
            ) : recipientScope === "ROLE" ? (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {roleRows.map((role) => (
                  <label
                    key={role.code}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={recipientRoles.includes(role.code)}
                      onCheckedChange={(checked) =>
                        toggleRole(role.code, checked === true)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{role.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("roleMemberCount", { count: role.count })}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 font-medium hover:bg-muted/60">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setRecipients(
                        checked === true ? memberRows.map((row) => row.user) : [],
                      )
                    }
                  />
                  <span>{t("selectAll", { count: memberRows.length })}</span>
                </label>
                {memberRows.map((row) => (
                  <label
                    key={row.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={recipients.includes(row.user)}
                      onCheckedChange={(checked) =>
                        toggleRecipient(row.user, checked === true)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{row.user_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{row.user_email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{row.role_name}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </FieldWrapper>

          <FieldWrapper label={t("subject")} required>
            <Input
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("subjectPlaceholder")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("message")} required>
            <Textarea
              className="min-h-32"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("messagePlaceholder")}
            />
          </FieldWrapper>
          {save.isError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {save.error instanceof ApiError ? save.error.message : t("sendError")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button
            requires={[[project, t("project")], [recipientsReady, t("recipients")], [title, t("subject")], [message, t("message")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
