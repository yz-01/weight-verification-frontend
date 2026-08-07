"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Eye,
  Mail,
  Radio,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type {
  AdminNotificationCategory,
  AdminNotificationRow,
} from "@/interfaces/admin-notification";
import { useDateFormat } from "@/lib/dates";
import { getCompanies } from "@/services/companies.service";
import {
  getAdminNotifications,
  getNotificationChannelStatus,
  getNotificationDeliveryRecords,
  getNotificationStatusRecords,
  markAdminNotificationRead,
  markAdminNotificationUnread,
  removeAdminNotification,
  sendAdminNotification,
} from "@/services/platform-ops.service";

export type AdminNotificationSection =
  | "overview"
  | "contractors"
  | "recyclers"
  | "saas"
  | "commission"
  | "cwe"
  | "system"
  | "search"
  | "manage"
  | "channels"
  | "records";

const SUBMODULES: Array<{
  section: Exclude<AdminNotificationSection, "overview">;
  number: string;
}> = [
  { section: "contractors", number: "10.2.1" },
  { section: "recyclers", number: "10.2.2" },
  { section: "saas", number: "10.2.3" },
  { section: "commission", number: "10.2.4" },
  { section: "cwe", number: "10.2.5" },
  { section: "system", number: "10.2.6" },
  { section: "search", number: "10.2.7" },
  { section: "manage", number: "10.2.8" },
  { section: "channels", number: "10.2.9" },
  { section: "records", number: "10.2.10" },
];

const CATEGORY: Partial<Record<AdminNotificationSection, AdminNotificationCategory>> = {
  contractors: "CONTRACTOR",
  recyclers: "RECYCLER",
  saas: "SAAS",
  commission: "COMMISSION",
  cwe: "CWE",
  system: "SYSTEM",
};

const CATEGORY_OPTIONS: Array<{
  value: AdminNotificationCategory;
  section: keyof typeof CATEGORY;
}> = [
  { value: "CONTRACTOR", section: "contractors" },
  { value: "RECYCLER", section: "recyclers" },
  { value: "SAAS", section: "saas" },
  { value: "COMMISSION", section: "commission" },
  { value: "CWE", section: "cwe" },
  { value: "SYSTEM", section: "system" },
];

export function AdminNotificationWorkspace({
  section = "overview",
}: {
  section?: AdminNotificationSection;
}) {
  const t = useTranslations("adminNotifications");

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={section === "overview" ? t("title") : t(`section.${section}.title`)}
        subtitle={
          section === "overview"
            ? t("subtitle")
            : t(`section.${section}.subtitle`)
        }
      />
      {section === "overview" ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-y bg-card">
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {SUBMODULES.map((module) => (
              <Link
                key={module.section}
                href={`/notifications/${module.section}`}
                className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
              >
                
                <span className="min-w-0 flex-1 font-medium">
                  {t(`section.${module.section}.title`)}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ) : section === "channels" ? (
        <ChannelWorkspace />
      ) : section === "records" ? (
        <NotificationRecords />
      ) : (
        <AdminNotificationList
          category={CATEGORY[section]}
          searchable={section === "search" || section === "manage"}
          manageable={section === "manage"}
        />
      )}
    </div>
  );
}

function AdminNotificationList({
  category,
  searchable,
  manageable,
}: {
  category?: AdminNotificationCategory;
  searchable: boolean;
  manageable: boolean;
}) {
  const t = useTranslations("adminNotifications");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<AdminNotificationRow | null>(null);
  const [selected, setSelected] = useState<AdminNotificationRow | null>(null);
  const companies = useQuery({
    queryKey: ["companies", "notification-options"],
    queryFn: () => getCompanies({ page_size: 200 }),
    enabled: searchable,
  });
  const params = useMemo(
    () => ({
      page_size: 100,
      category: (category ?? categoryFilter) || undefined,
      search: search || undefined,
      company: company || undefined,
      status: status || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [category, categoryFilter, company, dateFrom, dateTo, search, status],
  );
  const notifications = useQuery({
    queryKey: ["admin-notifications", params],
    queryFn: () => getAdminNotifications(params),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  const read = useMutation({ mutationFn: markAdminNotificationRead, onSuccess: invalidate });
  const unread = useMutation({ mutationFn: markAdminNotificationUnread, onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: removeAdminNotification,
    onSuccess: () => {
      setPendingRemoval(null);
      invalidate();
    },
  });

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      {searchable && (
        <div className="grid gap-3 border-y bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("filter.search")}</span>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {!category && (
            <SelectFilter
              label={t("filter.category")}
              value={categoryFilter}
              onChange={setCategoryFilter}
              allLabel={t("filter.allCategories")}
              options={CATEGORY_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`section.${option.section}.title`),
              }))}
            />
          )}
          <SelectFilter
            label={t("filter.company")}
            value={company}
            onChange={setCompany}
            allLabel={t("filter.allCompanies")}
            options={(companies.data?.results ?? []).map((row) => ({
              value: row.id,
              label: `${row.code} - ${row.name}`,
            }))}
          />
          <SelectFilter
            label={t("filter.status")}
            value={status}
            onChange={setStatus}
            allLabel={t("filter.allStatuses")}
            options={[
              { value: "READ", label: t("status.READ") },
              { value: "UNREAD", label: t("status.UNREAD") },
            ]}
          />
          <DateFilter label={t("filter.dateFrom")} value={dateFrom} onChange={setDateFrom} />
          <DateFilter label={t("filter.dateTo")} value={dateTo} onChange={setDateTo} />
        </div>
      )}
      <div className="overflow-auto border-y bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.notification")}</TableHead>
              <TableHead>{t("field.recipient")}</TableHead>
              <TableHead>{t("field.company")}</TableHead>
              <TableHead>{t("field.kind")}</TableHead>
              <TableHead>{t("field.status")}</TableHead>
              <TableHead>{t("field.time")}</TableHead>
              {manageable && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(notifications.data?.results ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-md">
                  <p className="font-medium">{row.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{row.message}</p>
                </TableCell>
                <TableCell>
                  <p>{row.recipient_name}</p>
                  <p className="text-xs text-muted-foreground">{row.recipient_email}</p>
                </TableCell>
                <TableCell>{row.company_name ?? "-"}</TableCell>
                <TableCell>{row.kind}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={t(`status.${row.is_read ? "READ" : "UNREAD"}`)}
                    tone={row.is_read ? "neutral" : "info"}
                  />
                </TableCell>
                <TableCell>{df.dateTime(row.created_at)}</TableCell>
                {manageable && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t("action.view")}
                        onClick={() => setSelected(row)}
                      >
                        <Eye />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={row.is_read ? t("action.markUnread") : t("action.markRead")}
                        onClick={() =>
                          row.is_read ? unread.mutate(row.id) : read.mutate(row.id)
                        }
                      >
                        {row.is_read ? <Undo2 /> : <Check />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t("action.remove")}
                        onClick={() => setPendingRemoval(row)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!notifications.isLoading && (notifications.data?.results.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={manageable ? 7 : 6} className="h-28 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("remove.title")}
        description={t("remove.description")}
        confirmLabel={t("action.remove")}
        isPending={remove.isPending}
        onConfirm={() => pendingRemoval && remove.mutate(pendingRemoval.id)}
      />
      <NotificationDetails
        row={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function NotificationDetails({
  row,
  onClose,
}: {
  row: AdminNotificationRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("adminNotifications");
  const df = useDateFormat();

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.title}</DialogTitle>
              <DialogDescription>{df.dateTime(row.created_at)}</DialogDescription>
            </DialogHeader>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t("field.recipient")}</dt>
                <dd>{row.recipient_name} ({row.recipient_email})</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("field.company")}</dt>
                <dd>{row.company_name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("field.kind")}</dt>
                <dd>{row.kind}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("field.status")}</dt>
                <dd>{t(`status.${row.is_read ? "READ" : "UNREAD"}`)}</dd>
              </div>
            </dl>
            <div className="space-y-1 border-t pt-4">
              <p className="text-xs text-muted-foreground">{t("field.message")}</p>
              <p className="whitespace-pre-wrap text-sm">{row.message}</p>
            </div>
            {Object.keys(row.latest_delivery_status).length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-xs text-muted-foreground">{t("field.channelStatus")}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(row.latest_delivery_status).map(([channel, delivery]) => (
                    <span key={channel} className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs">
                      {channel} / {delivery.mode} / {delivery.status}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChannelWorkspace() {
  const t = useTranslations("adminNotifications");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<Array<"IN_APP" | "EMAIL" | "PUSH">>(["IN_APP"]);
  const status = useQuery({ queryKey: ["notification-channels"], queryFn: getNotificationChannelStatus });
  const companies = useQuery({
    queryKey: ["companies", "notification-send"],
    queryFn: () => getCompanies({ page_size: 200 }),
  });
  const send = useMutation({
    mutationFn: sendAdminNotification,
    onSuccess: () => {
      setTitle("");
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
    },
  });

  const toggle = (channel: "IN_APP" | "EMAIL" | "PUSH") =>
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((value) => value !== channel)
        : [...current, channel],
    );

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      <div className="grid border-l sm:grid-cols-3">
        {(status.data?.channels ?? []).map((row) => (
          <div key={row.channel} className="min-h-32 border-b border-r p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-medium">
                {row.channel === "EMAIL" ? <Mail className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
                {t(`channel.${row.channel}`)}
              </span>
              <StatusBadge
                label={row.mode}
                tone={row.mode === "LIVE" ? "positive" : "warning"}
              />
            </div>
            <p className="mt-4 text-sm tabular-nums">{t("channel.sent", { count: row.sent })}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{t("channel.failed", { count: row.failed })}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {row.last_attempt_at ? df.dateTime(row.last_attempt_at) : t("channel.never")}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 border-y bg-card p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <SelectFilter
            label={t("filter.company")}
            value={company}
            onChange={setCompany}
            options={(companies.data?.results ?? []).map((row) => ({
              value: row.id,
              label: `${row.code} - ${row.name}`,
            }))}
          />
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("field.title")}</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("field.message")}</span>
            <Textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
        </div>
        <div className="flex flex-col justify-between gap-4">
          <div className="space-y-2">
            {(["IN_APP", "EMAIL", "PUSH"] as const).map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={channels.includes(channel)}
                  onChange={() => toggle(channel)}
                />
                {t(`channel.${channel}`)}
              </label>
            ))}
          </div>
          <Button
            className="self-end"
            disabled={!company || !title.trim() || !message.trim() || channels.length === 0 || send.isPending}
            onClick={() => send.mutate({ company_id: company, kind: "SYSTEM", title, message, channels })}
          >
            <Send />
            {t("action.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotificationRecords() {
  const t = useTranslations("adminNotifications");
  const df = useDateFormat();
  const [recordType, setRecordType] = useState<"DELIVERY" | "STATUS">("DELIVERY");
  const delivery = useQuery({
    queryKey: ["notification-records", "delivery"],
    queryFn: () => getNotificationDeliveryRecords({ page_size: 100 }),
    enabled: recordType === "DELIVERY",
  });
  const statuses = useQuery({
    queryKey: ["notification-records", "status"],
    queryFn: () => getNotificationStatusRecords({ page_size: 100 }),
    enabled: recordType === "STATUS",
  });

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <div className="flex gap-2">
        <Button size="sm" variant={recordType === "DELIVERY" ? "default" : "outline"} onClick={() => setRecordType("DELIVERY")}>{t("record.delivery")}</Button>
        <Button size="sm" variant={recordType === "STATUS" ? "default" : "outline"} onClick={() => setRecordType("STATUS")}>{t("record.status")}</Button>
      </div>
      <div className="overflow-auto border-y bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>{t("field.notification")}</TableHead><TableHead>{t("field.recipient")}</TableHead><TableHead>{t("field.channelStatus")}</TableHead><TableHead>{t("field.time")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {recordType === "DELIVERY"
              ? (delivery.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.notification_title}</TableCell><TableCell>{row.recipient_email}</TableCell><TableCell><span className="inline-flex gap-2"><StatusBadge label={row.channel} /><StatusBadge label={row.mode} tone={row.mode === "LIVE" ? "positive" : "warning"} /><StatusBadge label={row.status} tone={row.status === "FAILED" ? "danger" : "positive"} /></span>{row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}</TableCell><TableCell>{df.dateTime(row.attempted_at)}</TableCell></TableRow>)
              : (statuses.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.notification_title}</TableCell><TableCell>{row.recipient_email}</TableCell><TableCell><StatusBadge label={t(`status.${row.status}`)} /></TableCell><TableCell>{df.dateTime(row.changed_at)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; allLabel?: string }) {
  return <label className="block space-y-1.5 text-xs font-medium text-muted-foreground"><span>{label}</span><select className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>{allLabel && <option value="">{allLabel}</option>}{!allLabel && <option value="">-</option>}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-1.5 text-xs font-medium text-muted-foreground"><span>{label}</span><Input type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
