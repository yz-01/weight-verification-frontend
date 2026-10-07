/**
 * C3: the office's hazard pop-up card - which events make one, how many stay,
 * and for how long.
 *
 * The client asked for cards that 「跳出来飘出来又收回去」 when somebody acts on
 * a hazard that is not closed yet, and for nothing at all when nobody does.
 */
import { describe, expect, it } from "vitest";

import {
  HAZARD_POPUP_EXIT_MS,
  HAZARD_POPUP_MAX,
  HAZARD_POPUP_MS,
  addHazardCard,
  hazardCardFromEvent,
  isLeaving,
  liveHazardCards,
  nextHazardTick,
  type RealtimeEvent,
} from "./hazard-popup";

const NOW = 1_000_000;

function notice(
  id: string,
  kind = "safety.rectification_submitted",
  data: Record<string, unknown> = {},
): RealtimeEvent {
  return {
    event_type: "notification.created",
    occurred_at: "2026-10-07T08:00:00Z",
    payload: {
      notification_id: id,
      kind,
      title: "隐患整改待验收",
      message: "工地 A 的 SI-A-0001 有新的整改证据待验收。",
      data: {
        incident_id: "incident-1",
        incident_no: "SI-A-0001",
        incident_title: "安全部整改",
        actor_name: "Ali",
        record_status: "RECTIFICATION_SUBMITTED",
        alert_sound: true,
        ...data,
      },
    },
  };
}

describe("hazardCardFromEvent", () => {
  it("makes a card from a hazard notice on an open item", () => {
    const card = hazardCardFromEvent(notice("n1"), NOW);
    expect(card).toEqual({
      id: "n1",
      incidentNo: "SI-A-0001",
      incidentTitle: "安全部整改",
      actor: "Ali",
      what: "隐患整改待验收",
      detail: "工地 A 的 SI-A-0001 有新的整改证据待验收。",
      // The hazard's own page, from the one routing function (F9).
      href: "/hazard-rectifications?incident=incident-1",
      expiresAt: NOW + HAZARD_POPUP_MS,
    });
  });

  it("covers every step of an open hazard, its conversation included", () => {
    for (const kind of [
      "safety.incident_reported",
      "safety.incident_directed",
      "safety.rectification_assigned",
      "safety.rectification_returned",
      "safety.hazard_message",
      "safety.permit_submitted",
    ]) {
      expect(hazardCardFromEvent(notice("n", kind, { record_status: "ASSIGNED" }), NOW)).not.toBeNull();
    }
  });

  it("ignores notices that are not about hazards", () => {
    expect(hazardCardFromEvent(notice("n", "receipt.accepted"), NOW)).toBeNull();
    expect(hazardCardFromEvent(notice("n", "waste_outgoing.order_received"), NOW)).toBeNull();
    expect(
      hazardCardFromEvent({ ...notice("n"), event_type: "safety.status_changed" }, NOW),
    ).toBeNull();
  });

  it("ignores a hazard that is already closed", () => {
    expect(hazardCardFromEvent(notice("n", "safety.rectification_verified", { record_status: "VERIFIED" }), NOW)).toBeNull();
    expect(hazardCardFromEvent(notice("n", "safety.hazard_message", { record_status: "VERIFIED" }), NOW)).toBeNull();
    expect(hazardCardFromEvent(notice("n", "safety.incident_reported", { record_status: "RESOLVED" }), NOW)).toBeNull();
  });

  it("makes nothing it could not open", () => {
    expect(hazardCardFromEvent(notice("n", "safety.hazard_message", { incident_id: "" }), NOW)).toBeNull();
    expect(hazardCardFromEvent({ event_type: "notification.created" }, NOW)).toBeNull();
  });
});

describe("the stack", () => {
  const card = (id: string, at = NOW) => hazardCardFromEvent(notice(id), at)!;

  it("is empty until something happens", () => {
    expect(liveHazardCards([], NOW)).toEqual([]);
    expect(nextHazardTick([], NOW)).toBeNull();
  });

  it("holds at most three, newest last, and drops the oldest", () => {
    let cards = [card("a"), card("b"), card("c")].reduce(addHazardCard, []);
    expect(cards.map((row) => row.id)).toEqual(["a", "b", "c"]);
    cards = addHazardCard(cards, card("d"));
    expect(cards).toHaveLength(HAZARD_POPUP_MAX);
    expect(cards.map((row) => row.id)).toEqual(["b", "c", "d"]);
  });

  it("never shows the same notice twice", () => {
    const cards = addHazardCard([card("a")], card("a", NOW + 1_000));
    expect(cards.map((row) => row.id)).toEqual(["a"]);
  });

  it("slides each card out after eight seconds, then removes it", () => {
    const first = card("a", NOW);
    const second = card("b", NOW + 3_000);
    const cards = [first, second];

    expect(isLeaving(first, NOW + HAZARD_POPUP_MS - 1)).toBe(false);
    expect(nextHazardTick(cards, NOW)).toBe(NOW + HAZARD_POPUP_MS);

    const eight = NOW + HAZARD_POPUP_MS;
    expect(isLeaving(first, eight)).toBe(true);
    expect(isLeaving(second, eight)).toBe(false);
    expect(liveHazardCards(cards, eight)).toHaveLength(2);
    expect(nextHazardTick(cards, eight)).toBe(eight + HAZARD_POPUP_EXIT_MS);

    const gone = eight + HAZARD_POPUP_EXIT_MS;
    expect(liveHazardCards(cards, gone).map((row) => row.id)).toEqual(["b"]);
    expect(liveHazardCards(cards, NOW + 3_000 + HAZARD_POPUP_MS + HAZARD_POPUP_EXIT_MS)).toEqual([]);
  });
});
