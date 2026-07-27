"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ANOMALY_CODES } from "@/interfaces/weighing";
import {
  DEDUCTION_KINDS,
  type DeductionKind,
} from "@/interfaces/recycler";
import { WASTE_TYPES, type WasteType } from "@/interfaces/contractor";
import { printWeighTicket } from "@/services/weighing.service";

/**
 * Print the weighbridge ticket.
 *
 * Every word on the document is assembled here and sent with the request. The
 * backend lays out the page and holds no catalogue of its own, so this is the
 * only place the ticket's wording exists — the same split as the spreadsheet
 * exports, for the same reason.
 *
 * Flattened to dotted keys because the document builder looks them up by name
 * rather than walking a tree; a nested object would make it re-implement
 * message resolution it has no business knowing about.
 */
export function PrintTicketButton({
  sessionId,
  sessionNo,
}: {
  sessionId: string;
  sessionNo: string;
}) {
  const t = useTranslations();

  const print = useMutation({
    mutationFn: () => printWeighTicket(sessionId, sessionNo, ticketLabels(t)),
  });

  return (
    <Button
      size="sm"
      className="rounded-full px-4 shadow-sm"
      disabled={print.isPending}
      onClick={() => print.mutate()}
    >
      {print.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Printer className="h-4 w-4" />
      )}
      {t("ticket.action")}
    </Button>
  );
}

type Translate = (key: string) => string;

function ticketLabels(t: Translate): Record<string, string> {
  const labels: Record<string, string> = {
    title: t("ticket.title"),
    footer: t("ticket.footer"),
    evidenceNote: t("ticket.evidenceNote"),
    voidWeightsNote: t("ticket.voidWeightsNote"),
  };

  for (const key of [
    "weighing",
    "load",
    "weights",
    "anomalies",
    "evidence",
  ]) {
    labels[`section.${key}`] = t(`ticket.section.${key}`);
  }

  for (const key of [
    "sessionNo",
    "scale",
    "direction",
    "vehiclePlate",
    "startedAt",
    "endedAt",
    "attemptNo",
    "readingCount",
    "dispatchNo",
    "wasteType",
    "contractor",
    "project",
    "driver",
    "declaredWeight",
    "stableWeight",
    "peakWeight",
    "grossWeight",
    "tareWeight",
    "netWeight",
    "deductions",
    "settledWeight",
    "firstHash",
    "lastHash",
  ]) {
    labels[`field.${key}`] = t(`ticket.field.${key}`);
  }

  for (const key of ["anomaly", "detail", "deduction", "weight", "reason"]) {
    labels[`column.${key}`] = t(`ticket.column.${key}`);
  }

  for (const key of ["valid", "validNote", "void", "voidNote"]) {
    labels[`verdict.${key}`] = t(`ticket.verdict.${key}`);
  }

  for (const key of ["MEASURED", "STORED"]) {
    labels[`tareSource.${key}`] = t(`ticket.tareSource.${key}`);
  }

  for (const key of ["operator", "driver"]) {
    labels[`signature.${key}`] = t(`ticket.signature.${key}`);
  }

  for (const direction of ["GROSS", "TARE"]) {
    labels[`direction.${direction}`] = t(`gate.direction.${direction}`);
  }

  // The enumerations the document may print. Sent whole rather than only the
  // ones this session happens to use: the caller does not know what the
  // backend will reach for, and a missing key would print as a raw code on a
  // document somebody files.
  for (const code of ANOMALY_CODES) {
    labels[`anomaly.${code}`] = t(`weighing.anomaly.${code}`);
  }
  for (const type of WASTE_TYPES as WasteType[]) {
    labels[`wasteType.${type}`] = t(`dispatches.wasteType.${type}`);
  }
  for (const kind of DEDUCTION_KINDS as DeductionKind[]) {
    labels[`deductionKind.${kind}`] = t(`deductions.kind.${kind}`);
  }

  return labels;
}
