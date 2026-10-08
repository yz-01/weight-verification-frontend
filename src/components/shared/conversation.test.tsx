/**
 * F2 (7/10): photos in a record chat are thumbnails, several in a row, and a
 * tap opens the shared PhotoViewer. Rendered to static markup - the project
 * has no DOM in its test runner - with the viewer stubbed so what it is handed
 * can be read back.
 */
import { NextIntlClientProvider } from "next-intl";
import { useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/components/shared/record-detail-shell", () => ({
  PhotoViewer: ({
    photos,
    index,
    reference,
  }: {
    photos: { url: string; label: string }[];
    index: number;
    reference: string;
  }) => (
    <div data-viewer="open" data-url={photos[index].url} data-label={photos[index].label} data-reference={reference} data-count={photos.length} />
  ),
}));

const {
  CHAT_THUMBNAIL_IMG_CLASS,
  ChatPhotoThumbnail,
  ConversationMessageList,
  useChatPhotoViewer,
} = await import("@/components/shared/conversation");

type Message = Parameters<typeof ConversationMessageList>[0]["messages"][number];

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    author_name: "ong",
    body: "",
    photo: null,
    watermarked_photo: null,
    audio: null,
    attachment: null,
    attachment_name: "",
    sent_at: "2026-10-06T03:02:00Z",
    ...overrides,
  };
}

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("chat photos are thumbnails (F2)", () => {
  const thread = [
    message("a", { photo: "/a.jpg", watermarked_photo: "/a-stamped.jpg", body: "隐患" }),
    message("b", { photo: "/b.jpg", watermarked_photo: "/b-stamped.jpg" }),
    message("c", { author_name: "staff", body: "收到" }),
    message("d", { author_name: "staff", photo: "/d.jpg", sent_at: "2026-10-06T04:00:00Z" }),
  ];

  it("draws a photo small - longest edge 128px on a phone, 160px from sm up", () => {
    expect(CHAT_THUMBNAIL_IMG_CLASS).toContain("max-h-32");
    expect(CHAT_THUMBNAIL_IMG_CLASS).toContain("max-w-32");
    expect(CHAT_THUMBNAIL_IMG_CLASS).toContain("sm:max-h-40");
    expect(CHAT_THUMBNAIL_IMG_CLASS).toContain("sm:max-w-40");
    const html = render(<ConversationMessageList messages={thread} emptyLabel="" reference="SI-1" />);
    const images = html.match(/<img [^>]*>/g) ?? [];
    expect(images).toHaveLength(3);
    for (const image of images) expect(image).toContain(CHAT_THUMBNAIL_IMG_CLASS);
    // The old full-width picture and its open-in-a-new-tab link are gone.
    expect(html).not.toContain("max-h-64");
    expect(html).not.toContain('target="_blank"');
  });

  it("puts one person's photos sent together side by side in one message", () => {
    const html = render(<ConversationMessageList messages={thread} emptyLabel="" reference="SI-1" />);
    expect(html.match(/<li /g)).toHaveLength(3);
    const first = html.slice(0, html.indexOf("</li>"));
    expect(first).toContain("flex flex-wrap");
    expect(first).toContain("/a-stamped.jpg");
    expect(first).toContain("/b-stamped.jpg");
  });

  it("each thumbnail is a button that opens that photo", () => {
    const onOpen = vi.fn();
    const button = ChatPhotoThumbnail({ url: "/a.jpg", alt: "照片", onOpen });
    expect(button.type).toBe("button");
    (button.props as { onClick: () => void }).onClick();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opening a photo shows it in the PhotoViewer, with every chat photo to page through", () => {
    const photos = [
      { id: "a", url: "/a-stamped.jpg", author: "ong", sentAt: "2026-10-06T03:02:00Z" },
      { id: "d", url: "/d.jpg", author: "staff", sentAt: "2026-10-06T04:00:00Z" },
    ];
    function Harness() {
      const viewer = useChatPhotoViewer(photos, "SI-1");
      const opened = useRef(false);
      if (!opened.current) {
        opened.current = true;
        viewer.openPhoto("d");
      }
      return <>{viewer.viewer}</>;
    }
    const html = render(<Harness />);
    expect(html).toContain('data-viewer="open"');
    expect(html).toContain('data-url="/d.jpg"');
    expect(html).toContain('data-label="staff"');
    expect(html).toContain('data-reference="SI-1"');
    expect(html).toContain('data-count="2"');
  });

  it("shows nothing of the viewer until a photo is opened", () => {
    function Closed() {
      return <>{useChatPhotoViewer([{ id: "a", url: "/a.jpg", author: "ong", sentAt: "" }], "SI-1").viewer}</>;
    }
    expect(render(<Closed />)).toBe("");
  });
});
