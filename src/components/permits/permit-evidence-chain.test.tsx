/**
 * 施工准证 as one evidence chain (client 2026-10-10, round 2):
 *
 * - 「照片全部要跟收货进场一样」: the photographed pages go to the same gallery a
 *   material receipt uses (big viewer, thumbnails, time and GPS), the Word /
 *   Excel / PDF files are tiles that open in the page;
 * - 「我这里手机就打不开」: a file sent in a chat opens in the page, it is not
 *   a bare link a phone cannot follow;
 * - the record centre opens a permit as a permit, in a permit's words;
 * - 「发生了什么」 and 严重程度 are gone from the words a record is printed in.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Permit, PermitFile } from "@/interfaces/permit";
import { recordKindKey } from "@/lib/record-kind";
import { recordStatusLabel } from "@/lib/record-status";
import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

const { chatAttachmentType, ConversationMessageList } = await import("@/components/shared/conversation");
const { isPermitPhoto, permitPhotos } = await import("@/components/permits/permit-parts");

const catalogue = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));
const read = (tree: Record<string, unknown>, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

function file(id: string, overrides: Partial<PermitFile> = {}): PermitFile {
  return {
    id,
    submission: 1,
    original_name: `${id}.pdf`,
    content_type: "application/pdf",
    preview_type: "application/pdf",
    byte_size: 2048,
    uploaded_at: "2026-10-10T03:00:00Z",
    uploaded_by_name: "Ali",
    is_current: true,
    photo: null,
    ...overrides,
  };
}

function photographed(id: string, submission = 1): PermitFile {
  return file(id, {
    submission,
    original_name: `${id}.jpg`,
    content_type: "image/jpeg",
    preview_type: "image/jpeg",
    photo: {
      url: `https://media.test/${id}-stamped.jpg`,
      thumbnail_url: `https://media.test/${id}-thumb.jpg`,
      captured_at: "2026-10-10T03:05:00Z",
      latitude: "3.1390000",
      longitude: "101.6869000",
    },
  });
}

describe("the permit's photographed pages go to the gallery", () => {
  it("hands each stamped photo, its thumbnail, time and place to the shell", () => {
    const permit = { files: [photographed("page-1"), file("form")] } as Permit;
    expect(permit.files.map(isPermitPhoto)).toEqual([true, false]);

    const { photos, groups } = permitPhotos(permit, (round) => `第 ${round} 次提交`);

    expect(groups).toBeUndefined();
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      url: "https://media.test/page-1-stamped.jpg",
      thumbnailUrl: "https://media.test/page-1-thumb.jpg",
      label: "page-1.jpg",
      takenAt: "2026-10-10T03:05:00Z",
      latitude: "3.1390000",
      longitude: "101.6869000",
    });
  });

  it("keeps a returned round's photos in their own row, the latest first", () => {
    const permit = { files: [photographed("old", 1), photographed("new", 2)] } as Permit;
    const { photos, groups } = permitPhotos(permit, (round) => `第 ${round} 次提交`);
    expect(groups?.map((group) => group.label)).toEqual(["第 2 次提交", "第 1 次提交"]);
    expect(photos.map((photo) => photo.group)).toEqual(["round-2", "round-1"]);
  });
});

describe("a file sent in a chat opens in the page (「手机就打不开」)", () => {
  it("is a button that opens the previewer, not a raw link", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <ConversationMessageList
          reference="PM-1"
          emptyLabel="-"
          messages={[
            {
              id: "m1",
              author_name: "Tan",
              body: "报价",
              photo: null,
              audio: null,
              attachment: "https://media.test/ecrl-quo.xlsx",
              attachment_name: "ecrl quo.xlsx",
              sent_at: "2026-10-10T03:00:00Z",
            },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("data-chat-attachment");
    expect(html).toContain("ecrl quo.xlsx");
    expect(html).not.toContain('href="https://media.test/ecrl-quo.xlsx"');
  });

  it("knows a PDF and a photo by name; a workbook is read by its name in the previewer", () => {
    expect(chatAttachmentType("cert.PDF")).toBe("application/pdf");
    expect(chatAttachmentType("site.jpg")).toBe("image/jpeg");
    expect(chatAttachmentType("ecrl quo.xlsx")).toBeNull();
  });
});

describe("the record centre names a permit as a permit", () => {
  it("calls a HAZARD row of type PERMIT 施工准证, in the permit's status words", () => {
    const zh = catalogue("zh");
    const t = Object.assign((key: string) => String(read(zh, key)), {
      has: (key: string) => typeof read(zh, key) === "string",
    });
    expect(recordKindKey({ kind: "HAZARD", record_type: "PERMIT" })).toBe("PERMIT");
    expect(recordKindKey({ kind: "HAZARD", record_type: "HAZARD" })).toBe("HAZARD");
    expect(read(zh, "archiveQueue.kind.PERMIT")).toBe("施工准证");
    expect(
      recordStatusLabel(t, {
        kind: "HAZARD",
        record_type: "PERMIT",
        status: "RECTIFICATION_SUBMITTED",
        status_label: "Rectification submitted",
      }),
    ).toBe("待审批");
  });
});

describe("「发生了什么」 and 严重程度 are gone (2026-10-10)", () => {
  it.each(["zh", "zh-TW", "en", "ms"])("%s: a record's title is 事件, and no severity is named", (locale) => {
    const tree = catalogue(locale);
    expect(read(tree, "mySubmissions.field.title")).toBe(
      { zh: "事件", "zh-TW": "事件", en: "Event", ms: "Peristiwa" }[locale],
    );
    const text = JSON.stringify(tree);
    expect(text).not.toContain("发生了什么");
    expect(text).not.toContain("發生了什麼");
    // A construction record has no severity any more. (The platform's own
    // monitoring and bug tracker still grade system events and bugs.)
    for (const key of [
      "safety.severity",
      "safety.field.severity",
      "incidentReporting.severity",
      "incidentReporting.field.severity",
      "mySubmissions.field.severity",
      "contractorReports.column.severity",
    ]) {
      expect(read(tree, key), key).toBeUndefined();
    }
  });
});
