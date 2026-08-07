"use client";

import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { AuditLogEntry } from "@/interfaces/audit";
import { useDateFormat } from "@/lib/dates";

/**
 * One audit entry in full, including the before/after diff.
 *
 * The whole point of the trail is answering "what exactly changed", so the
 * diff is the body of this dialog rather than something to drill into. Values
 * render as `before → after` on one line so a scan reads left to right.
 */
export function AuditEntryDialog({
  entry,
  onClose,
}: {
  entry: AuditLogEntry;
  onClose: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const changes = Object.entries(entry.changes ?? {});
  const context = Object.entries(entry.context ?? {});

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-[680px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t(`audit.action.${entry.action}`)}</DialogTitle>
          <DialogDescription>
            {entry.object_repr || entry.object_type || t("common.emptyValue")}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[60vh] space-y-5 overflow-y-auto px-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail
              label={t("audit.field.createdAt")}
              value={df.precise(entry.created_at)}
            />
            <Detail
              label={t("audit.field.actor")}
              value={entry.actor_name ?? entry.actor_email}
            />
            <Detail
              label={t("audit.field.result")}
              value={t(`audit.result.${entry.result}`)}
            />
            <Detail
              label={t("audit.field.objectType")}
              value={entry.object_type}
            />
            <Detail
              label={t("audit.field.ipAddress")}
              value={entry.ip_address}
            />
            {entry.impersonated_by_name && (
              <Detail
                label={t("audit.field.actor")}
                value={t("audit.impersonatedBy", {
                  name: entry.impersonated_by_name,
                })}
                className="sm:col-span-2"
              />
            )}
            {entry.reason && (
              <Detail
                label={t("audit.field.reason")}
                value={entry.reason}
                className="sm:col-span-2"
              />
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("audit.field.changes")}
            </h4>
            {changes.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                {t("audit.noChanges")}
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {changes.map(([field, change]) => (
                  <div key={field} className="px-3 py-2.5">
                    <p className="mb-1 font-mono text-xs text-muted-foreground">
                      {field}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded bg-destructive/8 px-1.5 py-0.5 text-destructive line-through">
                        {formatValue(change.before, t("common.emptyValue"))}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">
                        {formatValue(change.after, t("common.emptyValue"))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {context.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("audit.field.context")}
              </h4>
              <div className="divide-y rounded-md border">
                {context.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-24 font-mono text-xs text-muted-foreground">
                      {key}
                    </span>
                    <span className="min-w-0 break-words">
                      {formatValue(value, t("common.emptyValue"))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
    </div>
  );
}

function formatValue(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
