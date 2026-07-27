"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Flag,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import { PrintTicketButton } from "@/components/weighing/print-ticket-button";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeightTrace } from "@/components/weighing/weight-trace";
import type { SessionVerdict } from "@/interfaces/weighing";
import { useDateFormat } from "@/lib/dates";
import {
  getSessionTrace,
  getWeighSession,
  verifySessionChain,
} from "@/services/weighing.service";

const VERDICT_TONE: Record<SessionVerdict, "positive" | "danger" | "warning"> = {
  VALID: "positive",
  INVALID: "danger",
  PENDING: "warning",
};

/**
 * One weighing, in full.
 *
 * Ordered the way a dispute gets settled: the verdict, then the trace that
 * justifies it, then the thresholds that produced it, then the proof that
 * none of it has been altered since.
 */
export function ViewWeighSession({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const formatter = useFormatter();

  const session = useQuery({
    queryKey: ["weigh-sessions", "detail", id],
    queryFn: () => getWeighSession(id),
  });

  const trace = useQuery({
    queryKey: ["weigh-sessions", "trace", id],
    queryFn: () => getSessionTrace(id),
    enabled: session.isSuccess,
  });

  const verification = useMutation({
    mutationFn: () => verifySessionChain(id),
  });

  if (session.isLoading) return <FormSkeleton sections={3} />;
  if (session.isError || !session.data) {
    return <LoadErrorCard backHref="/weighing" backLabel={t("weighing.title")} />;
  }

  const record = session.data;
  const params =
    trace.data?.params ?? record.ruleset_snapshot.params ?? {};

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/weighing"
        backLabel={t("weighing.title")}
        action={
          <PrintTicketButton
            sessionId={record.id}
            sessionNo={record.session_no}
          />
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="tabular text-base font-semibold text-foreground">
            {record.session_no}
          </h2>
          <TypeBadge label={t(`weighing.direction.${record.direction}`)} />
          <StatusBadge
            label={t(`weighing.verdict.${record.verdict}`)}
            tone={VERDICT_TONE[record.verdict]}
          />
          {record.requires_review && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive ring-1 ring-inset ring-destructive/25"
              title={t("weighing.requiresReviewHint")}
            >
              <Flag className="h-3 w-3" />
              {t("weighing.requiresReview")}
            </span>
          )}
          {record.stable_weight_kg && (
            <span className="tabular ml-auto text-lg font-semibold text-foreground">
              {formatter.number(Number(record.stable_weight_kg), {
                maximumFractionDigits: 0,
              })}{" "}
              kg
            </span>
          )}
        </div>

        <div className="divide-y border-t">
          <section className="px-6 py-5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("weighing.section.trace")}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("weighing.trace.caption")}
            </p>

            {trace.isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <WeightTrace
                readings={trace.data?.readings ?? []}
                anomalies={record.anomalies}
                params={params}
                stableWeightKg={record.stable_weight_kg}
                measurementFromTs={trace.data?.measurement_from_ts ?? null}
                measurementToTs={trace.data?.measurement_to_ts ?? null}
              />
            )}
          </section>

          <FormSection title={t("weighing.section.outcome")}>
            <ReadField
              label={t("weighing.field.scale")}
              value={record.scale_name}
            />
            <ReadField label={t("weighing.field.site")} value={record.site_name} />
            <ReadField
              label={t("weighing.field.vehiclePlate")}
              value={record.vehicle_plate}
            />
            <ReadField
              label={t("weighing.field.attemptNo")}
              value={String(record.attempt_no)}
            />
            <ReadField
              label={t("weighing.field.startedAt")}
              value={
                record.started_at
                  ? df.precise(record.started_at)
                  : null
              }
            />
            <ReadField
              label={t("weighing.field.stableAt")}
              value={
                record.stable_at
                  ? df.precise(record.stable_at)
                  : null
              }
            />
            <ReadField
              label={t("weighing.field.peakWeight")}
              value={
                record.peak_weight_kg
                  ? `${formatter.number(Number(record.peak_weight_kg), { maximumFractionDigits: 0 })} kg`
                  : null
              }
            />
            <ReadField
              label={t("weighing.field.readingCount")}
              value={formatter.number(record.reading_count)}
            />
          </FormSection>

          <section className="px-6 py-5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("weighing.section.rules")}
            </h3>
            {/* The single most important sentence on this page: these are the
                thresholds that judged this weighing, frozen onto it. Without
                that, an operator could widen a threshold and the record would
                silently re-read as compliant. */}
            <p className="mb-4 text-sm text-muted-foreground">
              {t("weighing.rules.frozenHint")}
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TypeBadge
                label={t("weighing.rules.version", {
                  version: record.ruleset_snapshot.version ?? 1,
                })}
              />
              {record.ruleset_snapshot.scope && (
                <span className="text-xs text-muted-foreground">
                  {t(
                    `weighingRules.scope.${record.ruleset_snapshot.scope}` as never,
                  )}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(params).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-3 border-b border-dashed py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {t(`weighingRules.param.${key}` as never)}
                  </span>
                  <span className="tabular shrink-0 font-medium">
                    {formatter.number(value)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("weighing.section.integrity")}
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                disabled={verification.isPending}
                onClick={() => verification.mutate()}
              >
                {verification.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {t("weighing.integrity.verify")}
              </Button>
            </div>

            {verification.data && (
              <div
                className={
                  verification.data.intact
                    ? "mb-4 flex items-start gap-2.5 rounded-md border border-success/25 bg-success/8 px-3 py-2.5"
                    : "mb-4 flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5"
                }
              >
                {verification.data.intact ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 text-sm">
                  <p
                    className={
                      verification.data.intact
                        ? "text-foreground"
                        : "font-medium text-destructive"
                    }
                  >
                    {verification.data.intact
                      ? t("weighing.integrity.intact")
                      : t("weighing.integrity.broken", {
                          count: verification.data.breaks.length,
                        })}
                  </p>
                  {verification.data.breaks.map((entry) => (
                    <p
                      key={`${entry.reading_id}-${entry.reason}`}
                      className="tabular mt-1 text-xs text-destructive"
                    >
                      {t(`weighing.integrity.reason.${entry.reason}`)} ·{" "}
                      {entry.device_ts}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadField
                label={t("weighing.integrity.firstHash")}
                value={
                  record.first_reading_hash ? (
                    <span className="truncate font-mono text-xs">
                      {record.first_reading_hash}
                    </span>
                  ) : null
                }
              />
              <ReadField
                label={t("weighing.integrity.lastHash")}
                value={
                  record.last_reading_hash ? (
                    <span className="truncate font-mono text-xs">
                      {record.last_reading_hash}
                    </span>
                  ) : null
                }
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
