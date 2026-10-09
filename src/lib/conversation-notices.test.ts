import { describe, expect, it } from "vitest";

import type { NotificationSummary } from "@/interfaces/platform-ops";
import { createNoticeSounder } from "@/lib/alert-sound";
import { clearedNotices, fieldBellCount } from "@/lib/conversation-notices";
import { fieldNotificationHref } from "@/lib/field-notification";
import { officeNotificationHref } from "@/lib/office-notification";
import { parseChatParam } from "@/lib/record-chat";

/**
 * Every chat room lights the phone's red dot (2026-10-09).
 *
 * Lucas: 「手机端发起材料出场，后台发信息可是手机端没收到通知红点，不只是材料出场，
 * 全部聊天室如果有新的信息都应该会收到通知红点。」
 */

const summary = (values: Partial<NotificationSummary>): NotificationSummary => ({
  total: 0,
  action: 0,
  today: 0,
  earlier: 0,
  by_kind: {},
  ...values,
});

describe("fieldBellCount", () => {
  it("adds the threads with an unread message to the phone's to-do number", () => {
    expect(
      fieldBellCount(
        summary({ total: 2, today: 1, earlier: 1, conversations: 3, conversations_today: 2 }),
      ),
    ).toEqual({ total: 5, today: 3, earlier: 2 });
  });

  it("is the to-do number alone when the server says nothing of conversations", () => {
    expect(fieldBellCount(summary({ total: 2, today: 2 }))).toEqual({ total: 2, today: 2, earlier: 0 });
  });

  it("lights the dot for a message alone, with no to-do card at all", () => {
    expect(fieldBellCount(summary({ conversations: 1, conversations_today: 1 }))?.total).toBe(1);
  });

  it("has no number before the server answered", () => {
    expect(fieldBellCount(undefined)).toBeUndefined();
  });
});

describe("clearedNotices", () => {
  it("re-reads the bell only when reading settled a notice", () => {
    expect(clearedNotices({ cleared_notices: 1 })).toBe(true);
    expect(clearedNotices({ cleared_notices: 0 })).toBe(false);
    expect(clearedNotices({})).toBe(false);
    expect(clearedNotices(undefined)).toBe(false);
  });
});

describe("the chat link a notice carries", () => {
  it("names one record's conversation", () => {
    expect(parseChatParam("MATERIAL_OUTGOING:o1")).toEqual({ kind: "MATERIAL_OUTGOING", recordId: "o1" });
    expect(parseChatParam("FIELD_TASK:t1")).toEqual({ kind: "FIELD_TASK", recordId: "t1" });
  });

  it("refuses what is not a conversation", () => {
    expect(parseChatParam(null)).toBeNull();
    expect(parseChatParam("")).toBeNull();
    expect(parseChatParam("MATERIAL_OUTGOING")).toBeNull();
    expect(parseChatParam("MATERIAL_OUTGOING:")).toBeNull();
    expect(parseChatParam(":o1")).toBeNull();
    // A hazard has its own room, opened by `incident=`.
    expect(parseChatParam("HAZARD:h1")).toBeNull();
  });

  it("is a field path the phone follows as it is", () => {
    expect(fieldNotificationHref("/field-staff?tab=home&chat=MATERIAL_OUTGOING:o1")).toBe(
      "/field-staff?tab=home&chat=MATERIAL_OUTGOING:o1",
    );
  });

  it("opens the record's own page in the office", () => {
    expect(officeNotificationHref({ href: "/field-staff?tab=home&chat=MATERIAL_OUTGOING:o1" })).toBe(
      "/material-outgoing?record=o1",
    );
    // An office reader's notice carries no link, only the record it is about.
    expect(officeNotificationHref({ record_kind: "SUNDRY_CLAIM", record_id: "s1" })).toBe(
      "/sundry-claims?record=s1",
    );
    // A kind with no page of its own: nowhere to go rather than a guess.
    expect(officeNotificationHref({ record_kind: "PROGRESS", record_id: "p1" })).toBeNull();
  });
});

describe("a refreshed chat notice rings again in the office", () => {
  it("rings for the same notice when a new message moved it forward", async () => {
    let plays = 0;
    const sounder = createNoticeSounder({
      play: async () => {
        plays += 1;
        return true;
      },
      rings: () => true,
      muted: () => false,
    });
    await sounder.observe([]);
    await sounder.observe([{ id: "n1", created_at: "2026-10-09T10:00:00Z" }]);
    await sounder.observe([{ id: "n1", created_at: "2026-10-09T10:00:00Z" }]);
    expect(plays).toBe(1);
    await sounder.observe([{ id: "n1", created_at: "2026-10-09T10:05:00Z" }]);
    expect(plays).toBe(2);
  });
});
