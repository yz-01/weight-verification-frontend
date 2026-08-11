"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { BellPlus, CheckCheck, Eye, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
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
import {
  getProjectAssignments,
  getProjects,
} from "@/services/contractor.service";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendProjectNotification,
} from "@/services/platform-ops.service";

export function Notifications() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const list = useListQuery(["unread", "kind"]);
  const [composeOpen, setComposeOpen] = useState(
    searchParams.get("create") === "1" && can("notification.send"),
  );

  const query = useQuery({
    queryKey: ["notifications", list.query],
    queryFn: () => getNotifications(list.query),
    refetchInterval: 30_000,
  });

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
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
            label={t(`notifications.kind.${row.original.kind}`)}
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
            <p className={row.original.is_read ? "font-medium" : "font-semibold"}>
              {row.original.title}
            </p>
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
            label={t(
              row.original.is_read
                ? "notifications.status.read"
                : "notifications.status.unread",
            )}
            tone={row.original.is_read ? "neutral" : "info"}
          />
        ),
      },
      {
        id: "actions",
        meta: { label: t("common.actions") },
        header: () => null,
        cell: ({ row }) =>
          row.original.is_read ? null : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t("notifications.markRead")}
              disabled={read.isPending}
              onClick={() => read.mutate(row.original.id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          ),
      },
    ],
    [df, read, t],
  );

  const count = query.data?.count ?? 0;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("notifications.title")}
        subtitle={
          query.isLoading
            ? t("common.loading")
            : t("notifications.count", { count })
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {can("notification.send") && (
              <Button size="sm" onClick={() => setComposeOpen(true)}>
                <BellPlus className="h-4 w-4" />
                {t("notifications.compose.action")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={readAll.isPending || count === 0}
              onClick={() => readAll.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              {t("notifications.markAllRead")}
            </Button>
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
            label: t("common.all"),
            active: !list.filters.unread,
            onSelect: () => list.setFilter("unread", undefined),
          },
          {
            key: "unread",
            label: t("notifications.status.unread"),
            active: list.filters.unread === "true",
            onSelect: () => list.setFilter("unread", "true"),
          },
        ]}
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
            disabled={
              !project ||
              !recipientsReady ||
              !title.trim() ||
              !message.trim() ||
              save.isPending
            }
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
