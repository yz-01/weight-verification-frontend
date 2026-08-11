"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Info, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { TASK_STATE_TONE } from "@/components/tasks/tasks";
import { Button } from "@/components/ui/button";
import {
  TASK_TRANSITIONS,
  type TaskState,
} from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { advanceTask, getTask } from "@/services/recycler.service";

/**
 * One trip, and the buttons that move it.
 *
 * The buttons come from the transition table rather than being written out,
 * so the screen can only ever offer a step the backend will accept. The
 * backend still checks — this decides what to show, never what is allowed.
 */
export function ViewTask({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [moving, setMoving] = useState<TaskState | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError } = useQuery({
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

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/tasks" backLabel={t("tasks.title")} />;
  }

  const next = TASK_TRANSITIONS[data.state];
  const coordinates =
    data.arrival_latitude && data.arrival_longitude
      ? `${data.arrival_latitude}, ${data.arrival_longitude}`
      : null;

  return (
    <div className="space-y-4">
      <DetailHeader backHref="/tasks" backLabel={t("tasks.title")} />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="tabular text-base font-semibold text-foreground">
            {data.task_no}
          </h2>
          <StatusBadge
            label={t(`tasks.state.${data.state}`)}
            tone={TASK_STATE_TONE[data.state]}
          />

          {can("task.submit") && next.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
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
          )}
        </div>

        <div className="divide-y border-t">
          <FormSection title={t("tasks.section.load")}>
            <ReadField
              label={t("tasks.field.dispatch")}
              value={data.dispatch_no ?? t("tasks.noDispatch")}
            />
            <ReadField
              label={t("tasks.field.contractor")}
              value={data.contractor_name}
            />
            <ReadField
              label={t("tasks.field.project")}
              value={data.project_name}
            />
            <ReadField label={t("tasks.field.site")} value={data.site_name} />
          </FormSection>

          <FormSection title={t("tasks.section.crew")}>
            <ReadField
              label={t("tasks.field.driver")}
              value={data.driver_name}
            />
            <ReadField
              label={t("tasks.field.vehicle")}
              value={data.vehicle_plate}
            />
          </FormSection>

          <FormSection title={t("tasks.section.progress")}>
            <ReadField
              label={t("tasks.field.scheduledFor")}
              value={
                data.scheduled_for ? df.dateTime(data.scheduled_for) : null
              }
            />
            <ReadField
              label={t("tasks.field.acceptedAt")}
              value={data.accepted_at ? df.dateTime(data.accepted_at) : null}
            />
            <ReadField
              label={t("tasks.field.arrivedAt")}
              value={data.arrived_at ? df.dateTime(data.arrived_at) : null}
            />
            <ReadField
              label={t("tasks.field.loadedAt")}
              value={data.loaded_at ? df.dateTime(data.loaded_at) : null}
            />
            <ReadField
              label={t("tasks.field.deliveredAt")}
              value={data.delivered_at ? df.dateTime(data.delivered_at) : null}
            />
            <ReadField
              label={t("tasks.field.arrivalLocation")}
              value={
                coordinates ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-success" />
                    <span className="tabular">{coordinates}</span>
                  </span>
                ) : null
              }
            />
            <ReadField
              label={t("tasks.field.notes")}
              value={data.notes}
              className="md:col-span-2"
            />
            {data.failure_reason && (
              <ReadField
                label={t("tasks.field.failureReason")}
                value={data.failure_reason}
                className="md:col-span-2"
              />
            )}
            {coordinates && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("tasks.locationNote")}
              </p>
            )}
          </FormSection>

          <section className="px-6 py-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tasks.section.photos")}
            </h3>
            {data.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("tasks.noPhotos")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {data.photos.map((photo) => (
                  <figure key={photo.id} className="space-y-1.5">
                    <div className="relative aspect-4/3 overflow-hidden rounded-md border bg-muted/40">
                      <Image
                        src={photo.watermarked || photo.image}
                        alt={photo.caption || photo.kind}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <figcaption className="text-xs text-muted-foreground">
                      {photo.caption || photo.kind}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

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
    </div>
  );
}
