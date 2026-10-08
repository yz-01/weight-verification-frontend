/**
 * E3: a list row shows its record's photograph - or its module's icon, never a
 * blank - and names what clicking it does.
 */
import { ClipboardList } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InsideRowControl } from "@/components/shared/inside-row-control";
import { PhotoThumb, recordPhotos, rowPhotos, toShellPhotos } from "@/components/shared/photo-thumb";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

function render(node: React.ReactNode, messages: Record<string, unknown> = zh, locale = "zh") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const COVER = "https://api.example/media/evidence/thumbnails/v2/a.jpg";

describe("PhotoThumb", () => {
  it("shows the thumbnail, the count over its corner, and says it opens the photos", () => {
    const markup = render(
      <PhotoThumb coverUrl={COVER} count={3} icon={ClipboardList} reference="RC-001" photos={[]} />,
    );
    expect(markup).toContain('data-photo-thumb="photo"');
    expect(markup).toContain(COVER);
    expect(markup).toContain("size-12");
    expect(markup).toMatch(/<span aria-hidden="true" class="absolute bottom-0\.5 right-0\.5[^"]*">3<\/span>/);
    expect(markup).toContain('aria-label="查看 RC-001 的照片 · 3 张照片"');
    expect(markup).toContain("<button");
  });

  it("does not put a 1 over a single photograph", () => {
    const markup = render(
      <PhotoThumb coverUrl={COVER} count={1} icon={ClipboardList} reference="RC-002" />,
    );
    expect(markup).not.toMatch(/>1<\/span>/);
  });

  it("shows the module's icon when the record has no photograph - never a blank", () => {
    const markup = render(
      <PhotoThumb coverUrl={null} count={0} icon={ClipboardList} reference="RC-003" />,
    );
    expect(markup).toContain('data-photo-thumb="none"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="没有照片"');
    expect(markup).toContain("lucide-clipboard-list");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<button");
  });

  it("says it in every language", () => {
    for (const [locale, messages, none] of [
      ["en", en, "No photo"],
      ["zh", zh, "没有照片"],
      ["zh-TW", zhTW, "沒有照片"],
      ["ms", ms, "Tiada foto"],
    ] as const) {
      expect(
        render(<PhotoThumb coverUrl={null} icon={ClipboardList} reference="X" />, messages, locale),
      ).toContain(none);
      expect(
        render(<PhotoThumb coverUrl={COVER} count={2} icon={ClipboardList} reference="X" photos={[]} />, messages, locale),
      ).toMatch(/aria-label="[^"]*X[^"]*2[^"]*"/);
    }
  });

  it("fetches a record's photographs through the record sheet, for the kinds it knows", () => {
    expect(typeof recordPhotos("SAFETY_INCIDENT", "1", "SI-1")).toBe("function");
    expect(typeof recordPhotos("SITE_PROGRESS", "1", "P-1")).toBe("function");
    expect(recordPhotos("GEOFENCE_FAILURE", "1", "G-1")).toBeUndefined();
  });

  it("keeps only photographs that have a URL, labelled", () => {
    expect(
      toShellPhotos([{ id: "a", url: "u1", caption: "" }, { id: "b", url: "" }], "RC-9"),
    ).toEqual([{ id: "a", url: "u1", label: "RC-9" }]);
  });

  it("is a picture, not a button, when there is nothing of the record's to open (audit #4)", () => {
    // A notice about no record: opening it would only blow up the 240 px thumbnail.
    const markup = render(
      <PhotoThumb coverUrl={COVER} count={2} icon={ClipboardList} reference="N-1" />,
    );
    expect(markup).toContain('data-photo-thumb="photo"');
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain("<button");
  });

  it("is a picture inside a row that is itself the control (audit #11)", () => {
    const markup = render(
      <InsideRowControl.Provider value>
        <PhotoThumb
          coverUrl={COVER}
          count={2}
          icon={ClipboardList}
          reference="RC-7"
          photos={recordPhotos("MATERIAL_RECEIPT", "1", "RC-7")}
        />
      </InsideRowControl.Provider>,
    );
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain("<button");
  });

  it("never opens an unstamped original: a photograph without its stamped copy is left out (audit #10, Q30.2)", () => {
    expect(
      rowPhotos(
        [
          { id: "raw", image: "https://api.example/media/raw.jpg", watermarked: null },
          { id: "stamped", image: "https://api.example/media/raw2.jpg", watermarked: "https://api.example/media/w.jpg" },
          { id: 3, url: "https://api.example/media/evidence/watermarked/v2/s.jpg" },
        ],
        "RC-8",
      ),
    ).toEqual([
      { id: "stamped", url: "https://api.example/media/w.jpg", label: "RC-8" },
      { id: "3", url: "https://api.example/media/evidence/watermarked/v2/s.jpg", label: "RC-8" },
    ]);
  });
});
