"use client";

/**
 * The field app's hazard tab: what I reported, and what I have to fix.
 *
 * This replaces the 事故 tab. The customer asked for 报告事故 to go and its
 * chat room to be folded into 隐患整改 - 「报告事故的聊天室是结合进去隐患整改
 * 的，然后报告事故移除掉」 - so this is the same room, reached from the phone.
 *
 * Built for somebody who cannot comfortably read (D-094), which is why the
 * rows carry a coloured dot and an icon before they carry words, the newest
 * sits at the top, and there is exactly one button: 上报隐患.
 *
 * The list is filtered to hazards this worker is actually in (`involving=me`).
 * Showing all of them and refusing most on tap would read as a broken screen
 * rather than as somebody else's hazard.
 */

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { HazardConversationPanel } from "@/components/site-operations/hazard-conversation";
import { Button } from "@/components/ui/button";
import type { IncidentStatus, SafetyIncident } from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import { getSafetyIncidents } from "@/services/site-operations.service";

/**
 * Colour before words.
 *
 * A worker who cannot read the status still needs to tell "waiting for me"
 * from "finished", so the dot carries it and the label explains it.
 */
const TONES: Record<IncidentStatus, string> = {
  OPEN: "bg-destructive",
  INVESTIGATING: "bg-warning",
  ASSIGNED: "bg-warning",
  RETURNED: "bg-destructive",
  RECTIFICATION_SUBMITTED: "bg-info",
  VERIFIED: "bg-success",
  RESOLVED: "bg-success",
};

export function FieldHazardsPanel({
  onHome,
  onReport,
}: {
  onHome: () => void;
  /** Opens the same 上报隐患 form the records tab uses. */
  onReport: () => void;
}) {
  const t = useTranslations();
  const formatter = useDateFormat();
  const [open, setOpen] = useState<SafetyIncident | null>(null);

  const hazards = useQuery({
    queryKey: ["field-hazards"],
    queryFn: () =>
      getSafetyIncidents({
        page: 1,
        page_size: 50,
        sort_by: "occurred_at",
        sort_order: "desc",
        involving: "me",
      }),
  });

  if (open) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="outline"
            className="shrink-0"
            title={t("common.back")}
            onClick={() => setOpen(null)}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{open.title}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {open.incident_no}
            </p>
          </div>
        </div>
        <HazardConversationPanel incidentId={open.id} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          className="shrink-0"
          title={t("common.back")}
          onClick={onHome}
        >
          <ArrowLeft />
        </Button>
        <div>
          <h2 className="text-base font-semibold">{t("hazard.field.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("hazard.field.subtitle")}
          </p>
        </div>
      </div>

      {/* One button, and it is the one they came for. */}
      <Button className="min-h-14 w-full text-base" onClick={onReport}>
        <Camera />
        {t("hazard.field.report")}
      </Button>

      {hazards.isLoading ? (
        <div className="grid min-h-40 place-items-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : (hazards.data?.results ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("hazard.field.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {(hazards.data?.results ?? []).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpen(row)}
                className="flex min-h-16 w-full items-center gap-3 rounded-lg border p-3 text-left active:bg-muted"
              >
                <span
                  className={`size-3 shrink-0 rounded-full ${TONES[row.status]}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {/* safetyRectification, not safety: only three of the
                        seven statuses have labels under safety.status, so
                        four of them would have rendered their own dotted
                        path on the screen - the receiving.receiptphoto
                        defect the customer reported (F-225). */}
                    {t(`safetyRectification.status.${row.status}`)} ·{" "}
                    {formatter.date(row.occurred_at)}
                    {row.responsible_person_name
                      ? ` · ${row.responsible_person_name}`
                      : ` · ${t("hazard.unassigned")}`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
