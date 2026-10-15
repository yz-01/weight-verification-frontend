/**
 * 访客进场确认 (I26, ID63): the steps of the guard's visitor screen, worked out
 * from what the server said - so the same pass always shows the same step,
 * and a reload or a second phone picks the visit up where it stands.
 *
 * 「门岗扫描访客二维码后，先拍摄访客现场照片，再等待接待人电子确认」, then
 * 「门岗页面显示绿色『已确认』才能放行」:
 *
 *   scan → pass → `photo` (take it, choose the host when the pass has none,
 *   「通知接待人」) → `waiting` (who was asked, minutes waited, 取消) →
 *   `confirmed` (green 「已确认（某某 hh:mm）」, 放行) or `declined` (red,
 *   with the reason).
 *
 * A visitor already inside goes out with `exit`. A worker's or a lorry's pass
 * keeps its two buttons (`other`); a pass the gate cannot take is `refused`.
 */

import type {
  GatePassCheck,
  VisitorArrival,
  VisitStatus,
} from "@/interfaces/site-access";
import type { StatusTone } from "@/lib/tones";

export type GateVisitorStep =
  | "refused"
  | "other"
  | "exit"
  | "photo"
  | "waiting"
  | "confirmed"
  | "declined";

export function gateVisitorStep(
  check: GatePassCheck | null | undefined,
  arrival?: VisitorArrival | null,
): GateVisitorStep {
  if (!check || !check.pass || check.refusal) return "refused";
  if (!check.needs_host) return "other";
  const visit = arrival ?? check.arrival ?? null;
  if (visit) {
    if (visit.status === "AWAITING_HOST") return "waiting";
    if (visit.status === "CONFIRMED" && !visit.entry_at) return "confirmed";
    if (visit.status === "DECLINED") return "declined";
    // Cancelled, or already let in: back to what the pass itself allows.
  }
  if (check.can_exit) return "exit";
  if (check.can_enter) return "photo";
  return "refused";
}

/** Whole minutes the visitor has waited at the gate, never negative. */
export function waitedMinutes(since: string, now: number = Date.now()): number {
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 60_000));
}

/** 「通知接待人」 waits only for a photo and a host. */
export function canNotifyHost(photoCount: number, host: string | null | undefined): boolean {
  return photoCount > 0 && Boolean(host);
}

/** How long the guard's screen waits between looks while the host decides. */
export const WAITING_POLL_MS = 3_000;

/** The colour of a visit's status, wherever it is shown. */
export function visitStatusTone(status: VisitStatus | null | undefined): StatusTone {
  switch (status) {
    case "AWAITING_HOST":
      return "warning";
    case "CONFIRMED":
    case "ON_SITE":
      return "positive";
    case "DECLINED":
      return "danger";
    default:
      return "neutral";
  }
}
