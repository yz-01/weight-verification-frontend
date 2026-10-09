"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Info, Link2, MapPin, Pencil, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import { StatusBadge } from "@/components/shared/page-primitives";
import {
  RecordDetailFrame,
  RecordDetailShell,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import { TASK_STATE_TONE } from "@/components/tasks/tasks";
import { SendTripLinkDialog } from "@/components/tasks/trip-link";
import { Button } from "@/components/ui/button";
import {
  TASK_TRANSITIONS,
  type TaskState,
} from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { photoMeta } from "@/lib/photo-meta";
import {
  advanceTask,
  cancelTask,
  closeTask,
  getTask,
} from "@/services/recycler.service";

/**
 * One trip, and the buttons that move it, in the record-detail frame every
 * module shares (E8, Q31): the popup over the list from inside the app, the
 * same frame on a page of its own from a typed or notified address. A trip is
 * assigned in the office, not submitted from a phone, so it has no 记录人.
 *
 * The buttons come from the transition table rather than being written out,
 * so the screen can only ever offer a step the backend will accept. The
 * backend still checks — this decides what to show, never what is allowed.
 */
export function ViewTask({
  id,
  presentation = "page",
  onClose,
}: {
  id: string;
  presentation?: "page" | "dialog";
  /** The dialog's close; going back by default (an intercepted address). */
  onClose?: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [moving, setMoving] = useState<TaskState | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [reason, setReason] = useState("");
  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["tasks", "detail", id],
    queryFn: () => getTask(id),
  });

  const advance = useMutation({
    mutationFn: (state: TaskState) =>
      advanceTask(id, { state, reason: reason.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["incoming"] });
      setMoving(null);
      setReason("");
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelTask(id, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["incoming"] });
      setCancelling(false);
      setReason("");
    },
  });
  const close = useMutation({
    mutationFn: () => closeTask(id, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["incoming"] });
      // The driver's own screens change too: they were occupied and now are
      // not, so anything holding their roster has to be re-read.
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setClosing(false);
      setReason("");
    },
  });

  const frame = {
    presentation,
    onClose,
    backHref: "/tasks",
    backLabel: t("tasks.title"),
  };
  if (isLoading) {
    return (
      <RecordDetailFrame {...frame} title={t("tasks.title")}>
        <FormSkeleton sections={3} />
      </RecordDetailFrame>
    );
  }
  if (isLoadingError || !data) {
    return (
      <RecordDetailFrame {...frame} title={t("tasks.title")}>
        <LoadErrorCard backHref="/tasks" backLabel={t("tasks.title")} />
      </RecordDetailFrame>
    );
  }

  const next = TASK_TRANSITIONS[data.state];
  const coordinates =
    data.arrival_latitude && data.arrival_longitude
      ? `${data.arrival_latitude}, ${data.arrival_longitude}`
      : null;
  const progress = [
    {
      label: t("tasks.field.scheduledFor"),
      value: data.scheduled_for ? df.dateTime(data.scheduled_for) : null,
    },
    {
      label: t("tasks.field.acceptedAt"),
      value: data.accepted_at ? df.dateTime(data.accepted_at) : null,
    },
    {
      label: t("tasks.field.arrivedAt"),
      value: data.arrived_at ? df.dateTime(data.arrived_at) : null,
    },
    {
      label: t("tasks.field.loadedAt"),
      value: data.loaded_at ? df.dateTime(data.loaded_at) : null,
    },
    {
      label: t("tasks.field.deliveredAt"),
      value: data.delivered_at ? df.dateTime(data.delivered_at) : null,
    },
    {
      label: t("tasks.field.completedAt"),
      value: data.completed_at ? df.dateTime(data.completed_at) : null,
    },
    {
      label: t("tasks.field.arrivalLocation"),
      value: coordinates ? (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-success" />
          <span className="tabular">{coordinates}</span>
        </span>
      ) : null,
    },
  ];

  return (
    <RecordDetailFrame
      {...frame}
      title={data.task_no}
      status={
        <StatusBadge
          label={t(`tasks.state.${data.state}`)}
          tone={TASK_STATE_TONE[data.state]}
        />
      }
      headerActions={
        can("task.assign") &&
        !["COMPLETED", "CANCELLED", "FAILED"].includes(data.state) ? (
          <div className="flex flex-wrap gap-2">
            {/* The driver's way in: this trip's link. Sending again kills the
                old one - a link sent to the wrong chat, or a new phone. */}
            <Button size="sm" onClick={() => setSendingLink(true)}>
              <Link2 className="h-4 w-4" />
              {data.link ? t("tasks.link.resend") : t("tasks.link.send")}
            </Button>
            {data.state === "ASSIGNED" && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/tasks/${id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  {t("tasks.reassign")}
                </Link>
              </Button>
            )}
            {/*
              A trip at the yard normally closes itself when the weighbridge
              produces a net weight. When that never happens the driver is
              occupied for good, so this is the only way out — and it is not
              "cancel", because the driver did go.
            */}
            {data.state === "DELIVERED" ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setClosing(true)}
              >
                <XCircle className="h-4 w-4" />
                {t("tasks.close.action")}
              </Button>
            ) : data.state === "ASSIGNED" || data.state === "ACCEPTED" ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setCancelling(true)}
              >
                <XCircle className="h-4 w-4" />
                {t("tasks.cancel.action")}
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <RecordDetailShell
        reference={data.task_no}
        facts={[
          // Load
          {
            label: t("tasks.field.dispatch"),
            value: data.dispatch_no ?? t("tasks.noDispatch"),
          },
          { label: t("tasks.field.contractor"), value: data.contractor_name },
          { label: t("tasks.field.project"), value: data.project_name },
          { label: t("tasks.field.site"), value: data.site_name },
          // Crew
          { label: t("tasks.field.driver"), value: data.driver_name },
          { label: t("tasks.crew.driverPhone"), value: data.driver_phone },
          { label: t("tasks.field.vehicle"), value: data.vehicle_plate },
          {
            label: t("tasks.link.status"),
            value: t(`tasks.link.statusValue.${data.link?.status ?? "NONE"}`),
          },
          { label: t("tasks.field.notes"), value: data.notes, wide: true },
          ...(data.failure_reason
            ? [
                {
                  label: t("tasks.field.failureReason"),
                  value: data.failure_reason,
                  wide: true,
                },
              ]
            : []),
        ]}
        photos={data.photos.map((photo) => ({
          id: photo.id,
          url: photo.watermarked || photo.image,
          label: photo.caption || photo.kind,
          ...photoMeta(photo),
        }))}
        actions={
          can("task.submit") && next.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {next.map((state) => (
                <Button
                  key={state}
                  size="sm"
                  variant={state === "FAILED" ? "outline" : "default"}
                  className={
                    state === "FAILED"
                      ? "rounded-full px-4 text-destructive"
                      : "rounded-full px-4 shadow-sm"
                  }
                  onClick={() => setMoving(state)}
                >
                  <ArrowRight className="h-4 w-4" />
                  {t(`tasks.state.${state}`)}
                </Button>
              ))}
            </div>
          ) : null
        }
        // The trip's progress, step by step: what a reader checks to see
        // where the load is now.
        aside={
          <ShellPanel title={t("tasks.section.progress")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              {progress.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 break-words font-medium">{row.value || "—"}</dd>
                </div>
              ))}
            </dl>
            {coordinates && (
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("tasks.locationNote")}
              </p>
            )}
          </ShellPanel>
        }
      />

      {moving && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setMoving(null);
            setReason("");
          }}
          title={t("tasks.advanceTitle", {
            state: t(`tasks.state.${moving}`),
          })}
          description={
            moving === "LOADED"
              ? t("tasks.loadedNote")
              : moving === "FAILED"
                ? t("tasks.failNote")
                : t("tasks.advanceDescription")
          }
          confirmLabel={t(`tasks.state.${moving}`)}
          confirmIcon={ArrowRight}
          variant={moving === "FAILED" ? "destructive" : "default"}
          isPending={advance.isPending}
          reason={moving === "FAILED" ? reason : undefined}
          onReasonChange={moving === "FAILED" ? setReason : undefined}
          reasonRequired={moving === "FAILED"}
          onConfirm={() => advance.mutate(moving)}
        />
      )}
      {closing && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setClosing(false);
            setReason("");
          }}
          title={t("tasks.close.title")}
          description={t("tasks.close.description")}
          confirmLabel={t("tasks.close.confirm")}
          confirmIcon={XCircle}
          variant="destructive"
          isPending={close.isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() => close.mutate()}
        />
      )}

      {sendingLink && (
        <SendTripLinkDialog task={data} onClose={() => setSendingLink(false)} />
      )}
      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setCancelling(false);
            setReason("");
          }}
          title={t("tasks.cancel.title")}
          description={t("tasks.cancel.description")}
          confirmLabel={t("tasks.cancel.confirm")}
          confirmIcon={XCircle}
          variant="destructive"
          isPending={cancel.isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() => cancel.mutate()}
        />
      )}
    </RecordDetailFrame>
  );
}
