"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementInput,
  AnnouncementLevel,
} from "@/interfaces/platform-settings";
import { useDateFormat } from "@/lib/dates";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  updateAnnouncement,
} from "@/services/platform-settings.service";

const LEVELS: AnnouncementLevel[] = [
  "INFO",
  "WARNING",
  "CRITICAL",
  "MAINTENANCE",
];
const AUDIENCES: AnnouncementAudience[] = [
  "ALL",
  "PLATFORM",
  "CONTRACTOR",
  "RECYCLER",
];

/** The four languages the platform ships, in the order the form asks for them. */
const TRANSLATIONS = [
  { key: "zh", title: "title_zh", message: "message_zh" },
  { key: "zh_tw", title: "title_zh_tw", message: "message_zh_tw" },
  { key: "ms", title: "title_ms", message: "message_ms" },
] as const;

function levelTone(level: AnnouncementLevel) {
  if (level === "CRITICAL") return "danger" as const;
  if (level === "WARNING" || level === "MAINTENANCE") return "warning" as const;
  return "neutral" as const;
}

/** A datetime-local input wants `YYYY-MM-DDTHH:mm` in the reader's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const offset = at.getTimezoneOffset() * 60_000;
  return new Date(at.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Write and publish 系统公告.
 *
 * Publishing is not saving a row: the API fans the announcement out into every
 * addressed user's notification list and answers with how many it delivered.
 * That count is shown back, because an announcement that delivered nothing
 * reached nobody, and the screen should say so rather than look successful.
 */
export function AnnouncementPanel() {
  const t = useTranslations("adminSystemSettings.announcements");
  const common = useTranslations("common");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const [delivered, setDelivered] = useState<number | null>(null);

  const rows = useQuery({
    queryKey: ["platform-announcements"],
    queryFn: () => getAnnouncements(),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["platform-announcements"] });

  const remove = useMutation({
    mutationFn: (row: Announcement) => deleteAnnouncement(row.id),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });

  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Megaphone className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("help")}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus />
          {t("action.create")}
        </Button>
      </div>

      {delivered !== null && (
        <p className="mx-5 mb-4 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {t("delivered", { count: delivered })}
        </p>
      )}

      {rows.isLoading ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          {common("loading")}
        </p>
      ) : rows.isError ? (
        <div className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{t("loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void rows.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : !(rows.data ?? []).length ? (
        <p className="mx-5 mb-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y border-t">
          {(rows.data ?? []).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{row.title}</p>
                  <StatusBadge
                    label={t(`level.${row.level}`)}
                    tone={levelTone(row.level)}
                  />
                  <StatusBadge
                    label={t(`audience.${row.audience}`)}
                    tone="neutral"
                  />
                  {!row.is_active && (
                    <StatusBadge label={t("inactive")} tone="neutral" />
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {row.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {df.dateTime(row.publish_from)}
                  {row.publish_until ? ` → ${df.dateTime(row.publish_until)}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={common("edit")}
                  onClick={() => setEditing(row)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={common("remove")}
                  onClick={() => setRemoving(row)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AnnouncementEditor
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onPublished={async (count) => {
            setDelivered(count);
            setEditing(null);
            await refresh();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setRemoving(null)}
          title={t("action.remove")}
          description={t("removeConfirm", { title: removing.title })}
          confirmLabel={t("action.remove")}
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
        />
      )}
    </div>
  );
}

function AnnouncementEditor({
  row,
  onClose,
  onPublished,
}: {
  row: Announcement | null;
  onClose: () => void;
  onPublished: (delivered: number) => void | Promise<void>;
}) {
  const t = useTranslations("adminSystemSettings.announcements");
  const common = useTranslations("common");
  const [form, setForm] = useState<AnnouncementInput>({
    title: row?.title ?? "",
    title_zh: row?.title_zh ?? "",
    title_zh_tw: row?.title_zh_tw ?? "",
    title_ms: row?.title_ms ?? "",
    message: row?.message ?? "",
    message_zh: row?.message_zh ?? "",
    message_zh_tw: row?.message_zh_tw ?? "",
    message_ms: row?.message_ms ?? "",
    level: row?.level ?? "INFO",
    audience: row?.audience ?? "ALL",
    publish_from: row?.publish_from ?? new Date().toISOString(),
    publish_until: row?.publish_until ?? null,
    is_active: row?.is_active ?? true,
  });

  const set = <K extends keyof AnnouncementInput>(
    key: K,
    value: AnnouncementInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      row ? updateAnnouncement(row.id, form) : createAnnouncement(form),
    onSuccess: (result) => onPublished(result.notifications_delivered),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row ? t("action.edit") : t("action.create")}</DialogTitle>
          <DialogDescription>{t("editorHelp")}</DialogDescription>
        </DialogHeader>

        <FieldWrapper label={t("field.title")} required>
          <Input
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.message")} required>
          <Textarea
            rows={3}
            value={form.message}
            onChange={(event) => set("message", event.target.value)}
          />
        </FieldWrapper>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("field.level")}>
            <Select
              value={form.level}
              onValueChange={(value) => set("level", value as AnnouncementLevel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`level.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.audience")}>
            <Select
              value={form.audience}
              onValueChange={(value) =>
                set("audience", value as AnnouncementAudience)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((audience) => (
                  <SelectItem key={audience} value={audience}>
                    {t(`audience.${audience}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.publishFrom")} required>
            <Input
              type="datetime-local"
              value={toLocalInput(form.publish_from)}
              onChange={(event) =>
                set(
                  "publish_from",
                  fromLocalInput(event.target.value) ?? form.publish_from,
                )
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.publishUntil")}>
            <Input
              type="datetime-local"
              value={toLocalInput(form.publish_until)}
              onChange={(event) =>
                set("publish_until", fromLocalInput(event.target.value))
              }
            />
          </FieldWrapper>
        </div>

        <details className="rounded-lg border">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            {t("translations")}
          </summary>
          <div className="space-y-3 border-t p-4">
            <p className="text-xs text-muted-foreground">
              {t("translationsHelp")}
            </p>
            {TRANSLATIONS.map((language) => (
              <div key={language.key} className="grid gap-2 sm:grid-cols-2">
                <FieldWrapper label={t(`language.${language.key}.title`)}>
                  <Input
                    value={form[language.title]}
                    onChange={(event) =>
                      set(language.title, event.target.value)
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label={t(`language.${language.key}.message`)}>
                  <Textarea
                    rows={2}
                    value={form[language.message]}
                    onChange={(event) =>
                      set(language.message, event.target.value)
                    }
                  />
                </FieldWrapper>
              </div>
            ))}
          </div>
        </details>

        <label className="flex items-center gap-3 rounded-lg border p-3">
          <Switch
            checked={form.is_active}
            onCheckedChange={(checked) => set("is_active", checked)}
          />
          <span className="text-sm">{t("field.isActive")}</span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[[form.title, t("field.title")], [form.message, t("field.message")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("action.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
