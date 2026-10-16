"use client";

/**
 * 访客进场确认 (I26, ID63/ID64): the host's 「确认接待」 screen, and one visit's
 * detail wherever it is opened.
 *
 * The client: 「接待人通过手机或电脑后台确认接待，系统自动记录确认人及时间」.
 * The host's to-do opens this over the page they land on - the phone's home
 * (`/field-staff?visitor_arrival=`) or the office's notification centre
 * (`/notifications?visitor_arrival=`): the visitor's photograph taken at the
 * gate, their name, company, purpose and pass, and 「确认接待」 or 「拒绝」
 * with a reason. Whoever manages site access may answer for an absent host;
 * the screen says it is on their behalf. Once answered it reads who and when.
 * 访客进退场记录 opens the same dialog for a visit row.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, UserCheck, UserX, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import {
  RecordDetailDialog,
  RecordDetailShell,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VisitorArrival } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { visitStatusTone } from "@/lib/visitor-arrival";
import {
  confirmVisitorArrival,
  declineVisitorArrival,
  getVisitorArrival,
  getVisitorHostOptions,
} from "@/services/site-access.service";

export const visitorArrivalKey = (id: string) => ["visitor-arrival", id] as const;

/** 「已确认（某某 hh:mm）」 and its like: who answered, when, for whom. */
export function useArrivalAnswer() {
  const t = useTranslations("siteControl.visitorArrival");
  const df = useDateFormat();
  return (row: VisitorArrival) => {
    const time = (value: string | null) => (value ? df.time(value) : "");
    if (row.status === "CONFIRMED" && row.confirmed_at) {
      return t("confirmedBanner", {
        name: row.on_behalf ? `${row.confirmed_by_name} · ${t("onBehalf")}` : row.confirmed_by_name,
        time: time(row.confirmed_at),
      });
    }
    if (row.status === "DECLINED") {
      return t("declinedBanner", { reason: row.decline_reason, name: row.declined_by_name });
    }
    return "";
  };
}

/** One visit: the host answers here; anyone else reads it. */
export function VisitorArrivalDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("siteControl.visitorArrival");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const answerText = useArrivalAnswer();
  const detail = useQuery({ queryKey: visitorArrivalKey(id), queryFn: () => getVisitorArrival(id) });
  const row = detail.data;
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = (next: VisitorArrival) => {
    queryClient.setQueryData(visitorArrivalKey(id), next);
    void queryClient.invalidateQueries({ queryKey: ["visitor-records"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const confirm = useMutation({ mutationFn: () => confirmVisitorArrival(id), onSuccess: refresh });
  const decline = useMutation({
    mutationFn: () => declineVisitorArrival(id, reason.trim()),
    onSuccess: (next) => {
      setDeclining(false);
      refresh(next);
    },
  });
  const busy = confirm.isPending || decline.isPending;
  const answered = row ? answerText(row) : "";

  return (
    <RecordDetailDialog
      title={row?.arrival_no ?? t("title")}
      legacyNo={row?.legacy_no}
      description={row?.may_answer ? t("hostHelp") : t("detailHelp")}
      status={
        row ? <StatusBadge label={t(`status.${row.visit_status}`)} tone={visitStatusTone(row.visit_status)} /> : undefined
      }
      onClose={onClose}
      exportRecord={row ? { kind: "VISITOR_ARRIVAL", recordId: row.id, reference: row.arrival_no } : null}
    >
      <QueryFailedNote query={detail} what={t("what")} />
      {detail.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      )}
      {row && (
        <RecordDetailShell
          reference={row.arrival_no}
          facts={[
            { label: t("field.visitor"), value: row.subject_name },
            { label: t("field.company"), value: row.subject_company || "—" },
            { label: t("field.purpose"), value: row.purpose || "—", wide: true },
            { label: t("field.pass"), value: row.pass_no },
            { label: t("field.project"), value: row.project_name },
            { label: t("field.host"), value: row.host_name },
            { label: t("field.guard"), value: row.gate_user_name },
            { label: t("field.arrivedAt"), value: df.dateTime(row.arrived_at) },
            ...(row.confirmed_at
              ? [
                  {
                    label: t("field.confirmedBy"),
                    value: row.on_behalf ? `${row.confirmed_by_name} · ${t("onBehalf")}` : row.confirmed_by_name,
                  },
                  { label: t("field.confirmedAt"), value: df.dateTime(row.confirmed_at) },
                ]
              : []),
            ...(row.declined_at
              ? [
                  { label: t("field.declinedBy"), value: row.declined_by_name },
                  { label: t("field.reason"), value: row.decline_reason, wide: true },
                ]
              : []),
            ...(row.entry_at ? [{ label: t("field.entryAt"), value: df.dateTime(row.entry_at) }] : []),
            ...(row.exit_at ? [{ label: t("field.exitAt"), value: df.dateTime(row.exit_at) }] : []),
          ]}
          photos={row.photos.map((photo, index) => ({
            id: photo.id,
            url: photo.watermarked_image,
            thumbnailUrl: photo.thumbnail,
            label: `${t("photoNumber", { number: index + 1 })} · ${photo.gate_user_name}`,
            takenAt: photo.captured_at,
            latitude: photo.latitude,
            longitude: photo.longitude,
          }))}
          aside={
            <ShellPanel title={t("answerTitle")}>
              {row.may_answer ? (
                <div className="space-y-3" data-visitor-answer>
                  {!declining ? (
                    <div className="grid gap-2">
                      <Button
                        size="lg"
                        className="h-12 text-base"
                        disabled={busy}
                        onClick={() => confirm.mutate()}
                        data-visitor-confirm
                      >
                        {confirm.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}
                        {t("confirm")}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-12 text-base"
                        disabled={busy}
                        onClick={() => setDeclining(true)}
                      >
                        <UserX />
                        {t("decline")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <FieldWrapper label={t("field.reason")} required>
                        <Textarea
                          autoFocus
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder={t("reasonPlaceholder")}
                        />
                      </FieldWrapper>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" disabled={busy} onClick={() => setDeclining(false)}>
                          {t("back")}
                        </Button>
                        <Button
                          variant="destructive"
                          requires={[[reason.trim(), t("field.reason")]]}
                          disabled={busy}
                          onClick={() => decline.mutate()}
                        >
                          {decline.isPending ? <Loader2 className="animate-spin" /> : <UserX />}
                          {t("declineConfirm")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {(confirm.error ?? decline.error) && (
                    <p role="alert" className="text-sm text-destructive">
                      {(confirm.error ?? decline.error) instanceof Error
                        ? (confirm.error ?? decline.error)!.message
                        : t("answerFailed")}
                    </p>
                  )}
                </div>
              ) : answered ? (
                <p
                  className={
                    row.status === "DECLINED"
                      ? "flex items-start gap-2 text-sm font-medium text-destructive"
                      : "flex items-start gap-2 text-sm font-medium text-success"
                  }
                  role="status"
                >
                  {row.status === "DECLINED" ? (
                    <XCircle className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  )}
                  {answered}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {row.status === "AWAITING_HOST"
                    ? t("waitingFor", { host: row.host_name })
                    : t(`status.${row.visit_status}`)}
                </p>
              )}
            </ShellPanel>
          }
        />
      )}
    </RecordDetailDialog>
  );
}

/** 接待人 from the project's people, searchable (ID64). */
export function VisitorHostPicker({
  project,
  value,
  onChange,
  excludeSelf = false,
  selectedLabel,
}: {
  project: string;
  value: string;
  onChange: (id: string, name: string) => void;
  excludeSelf?: boolean;
  selectedLabel?: string;
}) {
  const t = useTranslations("siteControl.visitorArrival");
  const options = useQuery({
    queryKey: ["visitor-host-options", project, excludeSelf],
    queryFn: () => getVisitorHostOptions(project, excludeSelf),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const rows = options.data ?? [];
  return (
    <div className="space-y-1">
      <OptionCombobox
        value={value}
        onChange={(id) => onChange(id, rows.find((row) => row.id === id)?.full_name ?? "")}
        options={rows.map((row) => ({
          value: row.id,
          label: row.role_name ? `${row.full_name} · ${row.role_name}` : row.full_name,
        }))}
        placeholder={t("chooseHost")}
        searchPlaceholder={t("searchHost")}
        emptyLabel={project ? t("noHosts") : t("chooseProjectFirst")}
        ariaLabel={t("field.host")}
        disabled={!project}
        selectedLabel={selectedLabel}
      />
      <QueryFailedNote query={options} what={t("whatHosts")} />
    </div>
  );
}
