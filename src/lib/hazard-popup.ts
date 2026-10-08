import { recordTarget } from "@/lib/record-routes";

/**
 * The office's hazard pop-up card (C3), as plain data and plain functions.
 *
 * The client, 4/10: 「还没确认闭环的卡片跳出来，不是一张卡片片在页面上哦，是跳出来
 * 飘出来又收回去的那种。卡片就是说后台有人操作的时候他就跳出来，没有人操作的时候
 * 他就睡觉状态」. So a card exists only because an event just arrived: it slides
 * in, stays eight seconds, and goes. No event, no card - there is nothing to
 * load on page open and nothing that sits on the page.
 *
 * Only hazard notices (`safety.*`) about an item that is not closed yet. A
 * hazard closes when its raiser confirms it (VERIFIED, X10); the notice that
 * says so is news, not something to act on, and gets no card.
 *
 * Hazards only: a work permit rides the same item and the same `safety.*`
 * notices (C20), so the notice's `record_type` decides. A notice filed before
 * the server sent it falls back to the kind - `safety.permit_submitted` is a
 * permit's.
 *
 * Kept free of React so the rules - which events, how many, how long - are
 * tested without a DOM.
 */

/** How long a card stays before it slides back out. */
export const HAZARD_POPUP_MS = 8_000;
/** The slide-out before a card is removed. */
export const HAZARD_POPUP_EXIT_MS = 250;
/** At most this many at once; a fourth pushes the oldest out. */
export const HAZARD_POPUP_MAX = 3;

/** States in which a hazard is finished. */
const CLOSED_STATUSES = new Set(["VERIFIED", "RESOLVED"]);

export interface RealtimeEvent {
  event_type?: string;
  occurred_at?: string;
  payload?: {
    notification_id?: string;
    kind?: string;
    title?: string;
    message?: string;
    data?: Record<string, unknown>;
  };
}

export interface HazardPopupCard {
  /** The notification's id: the same notice never makes two cards. */
  id: string;
  incidentNo: string;
  /** The hazard's own title (its column's name, as a rule). */
  incidentTitle: string;
  /** Who did it, where the server said. */
  actor: string;
  /** What happened, in the reader's language: the notice's title. */
  what: string;
  /** The notice's sentence, for the detail (「阿里：栏杆修好了」). */
  detail: string;
  href: string;
  expiresAt: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The card one realtime event makes, or null when it makes none. */
export function hazardCardFromEvent(
  event: RealtimeEvent,
  now: number,
): HazardPopupCard | null {
  if (event.event_type !== "notification.created") return null;
  const payload = event.payload ?? {};
  const kind = text(payload.kind);
  if (!kind.startsWith("safety.")) return null;
  if (kind === "safety.rectification_verified") return null;
  if (kind === "safety.permit_submitted") return null;
  const data = payload.data ?? {};
  const recordType = text(data.record_type);
  if (recordType && recordType !== "HAZARD") return null;
  if (CLOSED_STATUSES.has(text(data.record_status))) return null;
  const id = text(payload.notification_id);
  const target = recordTarget("HAZARD", text(data.incident_id));
  if (!id || !target || !("href" in target)) return null;
  return {
    id,
    incidentNo: text(data.incident_no),
    incidentTitle: text(data.incident_title),
    actor: text(data.actor_name),
    what: text(payload.title),
    detail: text(payload.message),
    href: target.href,
    expiresAt: now + HAZARD_POPUP_MS,
  };
}

/** Add a card: newest last, never twice, never more than three. */
export function addHazardCard(
  cards: readonly HazardPopupCard[],
  card: HazardPopupCard,
): HazardPopupCard[] {
  if (cards.some((existing) => existing.id === card.id)) return [...cards];
  return [...cards, card].slice(-HAZARD_POPUP_MAX);
}

/** Whether a card is on its way out (still drawn, sliding away). */
export function isLeaving(card: HazardPopupCard, now: number): boolean {
  return now >= card.expiresAt;
}

/** The cards still to draw at `now`: a leaving card stays for its slide-out. */
export function liveHazardCards(
  cards: readonly HazardPopupCard[],
  now: number,
): HazardPopupCard[] {
  return cards.filter((card) => now < card.expiresAt + HAZARD_POPUP_EXIT_MS);
}

/** When something next changes - a card starts leaving or is removed - or null. */
export function nextHazardTick(
  cards: readonly HazardPopupCard[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const card of cards) {
    const at = now < card.expiresAt ? card.expiresAt : card.expiresAt + HAZARD_POPUP_EXIT_MS;
    if (next === null || at < next) next = at;
  }
  return next;
}
