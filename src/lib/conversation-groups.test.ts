import { describe, expect, it } from "vitest";

import { groupConversationMessages, photoOf, type GroupableMessage } from "@/lib/conversation-groups";

function message(id: string, overrides: Partial<GroupableMessage> = {}): GroupableMessage {
  return {
    id,
    author_name: "ong",
    body: "",
    photo: null,
    watermarked_photo: null,
    audio: null,
    attachment: null,
    sent_at: "2026-10-06T03:02:00Z",
    ...overrides,
  };
}

const photo = (id: string, overrides: Partial<GroupableMessage> = {}) =>
  message(id, { photo: `/media/${id}.jpg`, watermarked_photo: `/media/${id}-stamped.jpg`, ...overrides });

describe("chat rows (F2: photos side by side, not one per screen)", () => {
  it("puts one person's photos sent together in one row, stamped copy first", () => {
    const rows = groupConversationMessages([
      photo("a"),
      photo("b", { sent_at: "2026-10-06T03:02:40Z" }),
      photo("c", { sent_at: "2026-10-06T03:03:30Z" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].lead.id).toBe("a");
    expect(rows[0].photos.map((p) => p.url)).toEqual([
      "/media/a-stamped.jpg",
      "/media/b-stamped.jpg",
      "/media/c-stamped.jpg",
    ]);
  });

  it("a report's text with its first photo still collects the photos after it", () => {
    const rows = groupConversationMessages([
      photo("a", { body: "Steamer by the TV" }),
      photo("b"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].lead.body).toBe("Steamer by the TV");
    expect(rows[0].photos).toHaveLength(2);
  });

  it("keeps rows apart for another person, a gap in time, or words on the later photo", () => {
    const rows = groupConversationMessages([
      photo("a"),
      photo("b", { author_name: "staff" }),
      photo("c", { author_name: "staff", sent_at: "2026-10-06T03:10:00Z" }),
      photo("d", { author_name: "staff", sent_at: "2026-10-06T03:10:30Z", body: "fixed" }),
    ]);
    expect(rows.map((row) => row.messages.map((m) => m.id))).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("never folds a photo into a text-only, voice or file message", () => {
    const rows = groupConversationMessages([
      message("text", { body: "see below" }),
      photo("a"),
      message("voice", { audio: "/media/v.webm", photo: "/media/v.jpg" }),
      photo("b"),
      message("file", { attachment: "/media/f.pdf", photo: "/media/f.jpg" }),
      photo("c"),
    ]);
    expect(rows.map((row) => row.messages.map((m) => m.id))).toEqual([
      ["text"],
      ["a"],
      ["voice"],
      ["b"],
      ["file"],
      ["c"],
    ]);
  });

  it("loses no message and keeps their order", () => {
    const input = [photo("a"), message("t", { body: "ok" }), photo("b"), photo("c"), message("u", { body: "done" })];
    const rows = groupConversationMessages(input);
    expect(rows.flatMap((row) => row.messages.map((m) => m.id))).toEqual(["a", "t", "b", "c", "u"]);
    expect(rows.flatMap((row) => row.photos.map((p) => p.id))).toEqual(["a", "b", "c"]);
  });
});

describe("a chat photo in the viewer (2026-10-09: 「未记录时间 · 未记录位置」)", () => {
  it("keeps its message's time and GPS", () => {
    expect(photoOf(photo("g", { latitude: "3.1", longitude: "101.6" }))).toMatchObject({
      sentAt: "2026-10-06T03:02:00Z",
      latitude: "3.1",
      longitude: "101.6",
    });
  });

  it("has no GPS when its message had none", () => {
    expect(photoOf(photo("h"))).toMatchObject({ latitude: null, longitude: null });
  });
});
