"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Flag,
  Loader2,
  RotateCcw,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { PrintTicketButton } from "@/components/weighing/print-ticket-button";
import {
  DetailHeader,
  LoadFailed,
  QueryFailedNote,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { WeightTrace } from "@/components/weighing/weight-trace";
import type {
  SessionVerdict,
  WeighSessionAttachment,
} from "@/interfaces/weighing";
import { useDateFormat } from "@/lib/dates";
import { getDeviceMedia } from "@/services/integration.service";
import {
  getSessionTrace,
  getWeighSession,
  confirmWeighTicket,
  requestTicketReweigh,
  uploadWeighAttachment,
  voidWeighTicket,
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
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reweighOpen, setReweighOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [attachmentKind, setAttachmentKind] = useState<WeighSessionAttachment["kind"]>("WEIGHBRIDGE");
  const attachmentInput = useRef<HTMLInputElement>(null);

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

  const refreshSession = () => {
    void queryClient.invalidateQueries({
      queryKey: ["weigh-sessions", "detail", id],
    });
    void queryClient.invalidateQueries({ queryKey: ["weigh-sessions"] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => confirmWeighTicket(id, note),
    onSuccess: () => {
      setConfirmOpen(false);
      setNote("");
      refreshSession();
    },
  });
  const voidMutation = useMutation({
    mutationFn: () => voidWeighTicket(id, reason),
    onSuccess: () => {
      setVoidOpen(false);
      setReason("");
      refreshSession();
    },
  });
  const reweighMutation = useMutation({
    mutationFn: () => requestTicketReweigh(id, reason),
    onSuccess: () => {
      setReweighOpen(false);
      setReason("");
      refreshSession();
    },
  });
  const attachmentMutation = useMutation({
    mutationFn: (file: File) => uploadWeighAttachment(id, attachmentKind, file),
    onSuccess: () => {
      refreshSession();
      if (attachmentInput.current) attachmentInput.current.value = "";
    },
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
          <div className="flex flex-wrap justify-end gap-2">
            {record.ticket_status === "CONFIRMED" && (
              <PrintTicketButton
                sessionId={record.id}
                sessionNo={record.session_no}
              />
            )}
            {/* Only when there is a load to claim against, and only for the
                person the requirement puts in front of this: not every lorry
                carries contamination, so this is an offer, never a step. */}
            {record.dispatch && can("deduction.create") && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/deductions/create?dispatch=${record.dispatch}`}>
                  <Scissors className="h-4 w-4" />
                  {t("deductions.createTitle")}
                </Link>
              </Button>
            )}
            {can("weighing.operate") && record.ticket_status === "PENDING_CONFIRMATION" && (
              <>
                <Button size="sm" onClick={() => setConfirmOpen(true)}>
                  <CheckCircle2 className="h-4 w-4" />
                  {t("weighing.action.confirm")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReweighOpen(true)}>
                  <RotateCcw className="h-4 w-4" />
                  {t("weighing.action.reweigh")}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setVoidOpen(true)}>
                  <Ban className="h-4 w-4" />
                  {t("weighing.action.void")}
                </Button>
              </>
            )}
          </div>
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
          <StatusBadge
            label={t(`weighing.ticketStatus.${record.ticket_status}`)}
            tone={
              record.ticket_status === "CONFIRMED"
                ? "positive"
                : record.ticket_status === "VOIDED"
                  ? "danger"
                  : record.ticket_status === "PENDING_CONFIRMATION"
                    ? "warning"
                    : "neutral"
            }
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

            {trace.isError ? (
              <LoadFailed onRetry={() => void trace.refetch()} />
            ) : trace.isLoading ? (
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
              label={t("weighing.field.ticketStatus")}
              value={t(`weighing.ticketStatus.${record.ticket_status}`)}
            />
            <ReadField
              label={t("weighing.field.grossWeight")}
              value={record.gross_weight_kg ? `${record.gross_weight_kg} kg` : null}
            />
            <ReadField
              label={t("weighing.field.tareWeight")}
              value={record.tare_weight_kg ? `${record.tare_weight_kg} kg` : null}
            />
            <ReadField
              label={t("weighing.field.netWeight")}
              value={record.net_weight_kg ? `${record.net_weight_kg} kg` : null}
            />
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
            {record.confirmed_at && (
              <ReadField
                label={t("weighing.field.confirmedAt")}
                value={df.precise(record.confirmed_at)}
              />
            )}
            {record.confirmed_by_name && (
              <ReadField
                label={t("weighing.field.confirmedBy")}
                value={record.confirmed_by_name}
              />
            )}
            {record.confirmation_note && (
              <ReadField
                label={t("weighing.field.confirmationNote")}
                value={record.confirmation_note}
              />
            )}
            {record.void_reason && (
              <ReadField
                label={t("weighing.field.voidReason")}
                value={record.void_reason}
              />
            )}
            {record.reweigh_of_session_no && (
              <ReadField
                label={t("weighing.field.reweighOf")}
                value={record.reweigh_of_session_no}
              />
            )}
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
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weighing.attachment.title")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {record.attachments?.length
                    ? t("weighing.field.attachmentCount") + `: ${record.attachments.length}`
                    : t("weighing.attachment.empty")}
                </p>
              </div>
              {can("weighing.operate") && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={attachmentKind}
                    onValueChange={(value) =>
                      setAttachmentKind(value as WeighSessionAttachment["kind"])
                    }
                  >
                    <SelectTrigger className="min-w-[10rem]">
                      <SelectValue aria-label={t("weighing.attachment.kind")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(["LOADING", "WEIGHBRIDGE", "CCTV", "ANPR", "OTHER"] as const).map(
                        (kind) => (
                          <SelectItem key={kind} value={kind}>
                            {t(`weighing.attachment.${kind}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Input
                    ref={attachmentInput}
                    type="file"
                    accept="image/*,.pdf,.mp4"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) attachmentMutation.mutate(file);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={attachmentMutation.isPending}
                    onClick={() => attachmentInput.current?.click()}
                  >
                    {attachmentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {t("weighing.action.uploadEvidence")}
                  </Button>
                </div>
              )}
            </div>
            {!!record.attachments?.length && (
              <div className="grid gap-2 sm:grid-cols-2">
                {record.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.file}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate">
                      {t(`weighing.attachment.${attachment.kind}`)} · {attachment.original_filename}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {df.precise(attachment.captured_at)}
                    </span>
                  </a>
                ))}
              </div>
            )}

            <DeviceMediaList sessionId={id} />
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
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("weighing.confirmDialog.title")}
        description={t("weighing.confirmDialog.description")}
        confirmLabel={t("weighing.action.confirm")}
        confirmIcon={CheckCircle2}
        variant="default"
        isPending={confirmMutation.isPending}
        reason={note}
        onReasonChange={setNote}
        reasonLabel={t("weighing.confirmDialog.noteLabel")}
        onConfirm={() => confirmMutation.mutate()}
      />
      <ConfirmDialog
        open={reweighOpen}
        onOpenChange={setReweighOpen}
        title={t("weighing.confirmDialog.reweighTitle")}
        description={t("weighing.confirmDialog.reweighDescription")}
        confirmLabel={t("weighing.action.reweigh")}
        confirmIcon={RotateCcw}
        variant="default"
        isPending={reweighMutation.isPending}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired
        reasonLabel={t("weighing.confirmDialog.reasonLabel")}
        onConfirm={() => reweighMutation.mutate()}
      />
      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={t("weighing.confirmDialog.voidTitle")}
        description={t("weighing.confirmDialog.voidDescription")}
        confirmLabel={t("weighing.action.void")}
        confirmIcon={Ban}
        isPending={voidMutation.isPending}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired
        reasonLabel={t("weighing.confirmDialog.reasonLabel")}
        onConfirm={() => voidMutation.mutate()}
      />
    </div>
  );
}


/**
 * What the cameras sent for this weighing, beside what the operator uploaded.
 *
 * Kept visually separate from the operator's own attachments because the two
 * are worth different amounts. A photograph an operator chose and uploaded is
 * a photograph an operator chose; one a camera pushed at the moment of the
 * weighing, hashed on arrival, is evidence. Merging them into one list would
 * quietly level that difference.
 */
function DeviceMediaList({ sessionId }: { sessionId: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const media = useQuery({
    queryKey: ["device-media", "weighsession", sessionId],
    queryFn: () => getDeviceMedia("weighing.weighsession", sessionId),
  });

  const rows = media.data?.results ?? [];
  // A failed request is not "the cameras sent nothing" - say so where the list would be.
  if (media.isError) {
    return (
      <div className="mt-4 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("weighing.deviceMedia.title")}
        </h4>
        <QueryFailedNote query={media} what={t("weighing.deviceMedia.what")} />
      </div>
    );
  }
  if (media.isLoading || rows.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("weighing.deviceMedia.title")}
      </h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => {
          const label = `${t(`weighing.deviceMedia.kind.${row.kind}`)} · ${row.device_name}`;
          const inner = (
            <>
              <span className="min-w-0 truncate">{label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {df.precise(row.captured_at)}
              </span>
            </>
          );
          // A purged record is not a broken link. The bytes went on schedule;
          // the hash and the fact of them did not, and saying so is a better
          // answer than an empty space.
          if (row.is_purged || !row.file_url) {
            return (
              <div
                key={row.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
                title={t("weighing.deviceMedia.purgedHint", {
                  hash: row.sha256.slice(0, 12),
                })}
              >
                {inner}
              </div>
            );
          }
          return (
            <a
              key={row.id}
              href={row.file_url}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
            >
              {inner}
            </a>
          );
        })}
      </div>
    </div>
  );
}
