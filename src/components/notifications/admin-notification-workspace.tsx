"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
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
  | "manage"
  | "channels"
  | "records";

const SUBMODULES: Array<{
  section: Exclude<AdminNotificationSection, "overview">;
  number: string;
}> = [
  { section: "manage", number: "10.2.8" },
  { section: "channels", number: "10.2.9" },
  { section: "records", number: "10.2.10" },
];

const CATEGORY_OPTIONS: Array<{
  value: AdminNotificationCategory;
  section: "contractors" | "recyclers" | "saas" | "commission" | "cwe" | "system";
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
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
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
          searchable
          manageable
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
        <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-6">
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
      <div className="overflow-auto rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.notification")}</TableHead>
              <TableHead>{t("field.recipient")}</TableHead>
              <TableHead>{t("field.company")}</TableHead>
              <TableHead>{t("field.kind")}</TableHead>
              <TableHead>{t("field.status")}</TableHead>
              <TableHead>{t("field.time")}</TableHead>
              {manageable && <TableHead className="text-right" />}
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
                    <div className="flex items-center justify-end gap-0.5">
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
  const system = useTranslations("adminSystemSettings");
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
                    <span key={channel} className="inline-flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5">
                      <StatusBadge label={t(`channel.${channel}`)} />
                      <StatusBadge
                        label={system(`mode.${delivery.mode}`)}
                        tone={delivery.mode === "LIVE" ? "positive" : delivery.mode === "SIMULATED" ? "warning" : "neutral"}
                      />
                      <StatusBadge
                        label={t(`deliveryStatus.${delivery.status}`)}
                        tone={delivery.status === "FAILED" ? "danger" : delivery.status === "SENT" ? "positive" : "neutral"}
                      />
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
  const system = useTranslations("adminSystemSettings");
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

  const channelRows = status.data?.channels ?? [];
  const modeFor = (channel: "IN_APP" | "EMAIL" | "PUSH") =>
    channelRows.find((row) => row.channel === channel)?.mode ?? "NOT_CONFIGURED";
  const channelIcon = {
    IN_APP: Bell,
    EMAIL: Mail,
    PUSH: Radio,
  } as const;

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="grid md:grid-cols-3">
          {status.isLoading
            ? (["IN_APP", "EMAIL", "PUSH"] as const).map((channel) => (
                <div
                  key={channel}
                  className="min-h-44 animate-pulse border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                >
                  <div className="h-5 w-32 rounded bg-muted" />
                  <div className="mt-7 h-12 rounded bg-muted/70" />
                  <div className="mt-5 h-4 w-40 rounded bg-muted/70" />
                </div>
              ))
            : channelRows.map((row) => {
                const Icon = channelIcon[row.channel];
                return (
                  <div
                    key={row.channel}
                    className="min-h-44 border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 font-medium leading-5">
                          {t(`channel.${row.channel}`)}
                        </span>
                      </div>
                      <StatusBadge
                        label={system(`mode.${row.mode}`)}
                        tone={
                          row.mode === "LIVE"
                            ? "positive"
                            : row.mode === "SIMULATED"
                              ? "warning"
                              : "neutral"
                        }
                      />
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-muted/35 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">{t("channel.sentLabel")}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{row.sent}</p>
                      </div>
                      <div className="rounded-md bg-muted/35 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">{t("channel.failedLabel")}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{row.failed}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      {t("channel.lastAttempt")}: {row.last_attempt_at ? df.dateTime(row.last_attempt_at) : t("channel.never")}
                    </p>
                  </div>
                );
              })}
        </div>
        {status.isError && (
          <p className="border-t px-5 py-3 text-sm text-destructive">
            {t("channel.loadError")}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-5 py-4">
          <h3 className="font-semibold">{t("composer.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("composer.subtitle")}</p>
        </div>
        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <div className="grid content-start gap-4">
            <FieldWrapper label={t("filter.company")} required>
              <Select
                value={company || undefined}
                onValueChange={setCompany}
                disabled={companies.isLoading || companies.isError}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={t("composer.chooseCompany")} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {(companies.data?.results ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.code} - {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label={t("field.title")} required>
              <Input
                value={title}
                maxLength={200}
                placeholder={t("composer.titlePlaceholder")}
                onChange={(event) => setTitle(event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.message")} required>
              <Textarea
                rows={6}
                value={message}
                placeholder={t("composer.messagePlaceholder")}
                onChange={(event) => setMessage(event.target.value)}
              />
            </FieldWrapper>
          </div>

          <div className="flex min-w-0 flex-col">
            <div>
              <p className="text-sm font-medium">{t("composer.channels")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("composer.channelsHint")}
              </p>
              <div className="mt-3 grid gap-2">
                {(["IN_APP", "EMAIL", "PUSH"] as const).map((channel) => {
                  const Icon = channelIcon[channel];
                  const mode = modeFor(channel);
                  const unavailable = mode === "NOT_CONFIGURED";
                  return (
                    <label
                      key={channel}
                      className={`flex min-h-16 items-center gap-3 rounded-md border px-3.5 py-3 transition-colors ${
                        unavailable
                          ? "cursor-not-allowed bg-muted/25 text-muted-foreground"
                          : "cursor-pointer hover:bg-muted/35"
                      }`}
                    >
                      <Checkbox
                        checked={!unavailable && channels.includes(channel)}
                        disabled={unavailable}
                        onCheckedChange={() => !unavailable && toggle(channel)}
                      />
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {t(`channel.${channel}`)}
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                          {unavailable
                            ? t("composer.notConfigured")
                            : t(`composer.channelDescription.${channel}`)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            {send.isError && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {t("composer.sendError")}
              </p>
            )}
            <Button
              className="mt-6 w-full xl:mt-auto"
              requires={[[company, t("composer.chooseCompany")], [title, t("field.title")], [message, t("field.message")], [channels.length, t("filter.category")]]}
              disabled={send.isPending}
              onClick={() => send.mutate({ company_id: company, kind: "SYSTEM", title, message, channels })}
            >
              <Send />
              {send.isPending ? t("composer.sending") : t("action.send")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function NotificationRecords() {
  const t = useTranslations("adminNotifications");
  const system = useTranslations("adminSystemSettings");
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
      <div className="overflow-auto rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.notification")}</TableHead>
              <TableHead>{t("field.recipient")}</TableHead>
              <TableHead>{t("field.channelStatus")}</TableHead>
              <TableHead>{t("field.time")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordType === "DELIVERY"
              ? (delivery.data?.results ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.notification_title}</TableCell>
                    <TableCell>{row.recipient_email}</TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap gap-2">
                        <StatusBadge label={t(`channel.${row.channel}`)} />
                        <StatusBadge
                          label={system(`mode.${row.mode}`)}
                          tone={row.mode === "LIVE" ? "positive" : row.mode === "SIMULATED" ? "warning" : "neutral"}
                        />
                        <StatusBadge
                          label={t(`deliveryStatus.${row.status}`)}
                          tone={row.status === "FAILED" ? "danger" : row.status === "SENT" ? "positive" : "neutral"}
                        />
                      </span>
                      {row.error && <p className="mt-1 max-w-xl whitespace-normal text-xs text-destructive">{row.error}</p>}
                    </TableCell>
                    <TableCell>{df.dateTime(row.attempted_at)}</TableCell>
                  </TableRow>
                ))
              : (statuses.data?.results ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.notification_title}</TableCell>
                    <TableCell>{row.recipient_email}</TableCell>
                    <TableCell><StatusBadge label={t(`status.${row.status}`)} /></TableCell>
                    <TableCell>{df.dateTime(row.changed_at)}</TableCell>
                  </TableRow>
                ))}
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
