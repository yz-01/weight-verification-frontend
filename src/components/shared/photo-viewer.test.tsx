/**
 * I21 (ID44): 「请调整工程进度后台照片，点照片只显示完整照片，现有的照片太大了」.
 *
 * The shared viewer opens a photo whole: fitted into its frame, its shape
 * kept, no scroll bar - that is 100% - and zooming is relative to that. One
 * viewer for every screen (工程进度, 材料进场, 门岗, EHS, the chat), so this is
 * the one place it is checked.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/shared/evidence-file-actions", () => ({
  EvidenceFileActions: () => <div data-stub="file-actions" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PhotoViewer, fitSize, heroFit, heroSources, photoFrameWidth } = await import("@/components/shared/record-detail-shell");

const photos = [
  {
    id: "p1",
    url: "https://cdn.example/progress-portrait-stamped.jpg",
    label: "Road · 未填",
    takenAt: "2026-10-14T02:00:00Z",
    latitude: "3.1",
    longitude: "101.6",
  },
  {
    id: "p2",
    url: "https://cdn.example/progress-landscape-stamped.jpg",
    label: "Road · 40%",
    takenAt: "2026-10-14T03:00:00Z",
    latitude: null,
    longitude: null,
  },
];

function render(index = 0) {
  return renderDetail(
    <PhotoViewer photos={photos} index={index} reference="PG-001" onIndex={() => {}} onClose={() => {}} />,
  );
}

describe("a photo opens whole (I21)", () => {
  it("fits the photo into a frame that does not scroll", () => {
    const html = render();
    expect(html).toContain('data-photo-frame="whole"');
    const frame = html.slice(html.indexOf("data-photo-frame"), html.indexOf("<img"));
    expect(frame).toContain("overflow-hidden");
    expect(frame).not.toContain("overflow-auto");
    const img = html.slice(html.indexOf("<img"), html.indexOf(">", html.indexOf("<img")));
    expect(img).toContain("max-h-full");
    expect(img).toContain("max-w-full");
    expect(img).toContain("object-contain");
    // No width forced on it: 100% is the whole photo, not the frame's width.
    expect(img).not.toContain("width:");
    expect(img).toContain('data-photo-zoom="100"');
  });

  it("says 「整张显示」 on the button that goes back to it, not 「原始大小」 with a turning arrow", () => {
    const html = render();
    expect(html).toContain("整张显示");
    expect(html).not.toContain("原始大小");
    expect(html).not.toContain("lucide-rotate-ccw");
    expect(html).toContain("lucide-shrink");
    expect(html).toContain("100%");
  });

  it("shows the stamped photo it was given, and the next one whole too", () => {
    expect(render(0)).toContain("progress-portrait-stamped.jpg");
    const next = render(1);
    expect(next).toContain("progress-landscape-stamped.jpg");
    expect(next).toContain('data-photo-frame="whole"');
  });
});

describe("the whole-photo size", () => {
  const frame = { width: 864, height: 600 };

  it("keeps a tall phone photo inside the frame, both ways, shape kept", () => {
    const fitted = fitSize({ width: 3024, height: 4032 }, frame);
    expect(fitted.height).toBeCloseTo(600);
    expect(fitted.width).toBeCloseTo(450);
    expect(fitted.width).toBeLessThanOrEqual(frame.width);
    expect(fitted.width / fitted.height).toBeCloseTo(3024 / 4032);
  });

  it("keeps a wide photo inside the frame by its width", () => {
    const fitted = fitSize({ width: 4032, height: 3024 }, frame);
    expect(fitted.width).toBeCloseTo(800);
    expect(fitted.height).toBeLessThanOrEqual(frame.height);
  });

  it("never blows a small photo up past its own pixels", () => {
    expect(fitSize({ width: 400, height: 300 }, frame)).toEqual({ width: 400, height: 300 });
  });

  it("works on a phone-width frame too", () => {
    const fitted = fitSize({ width: 3024, height: 4032 }, { width: 342, height: 480 });
    expect(fitted.width).toBeLessThanOrEqual(342);
    expect(fitted.height).toBeLessThanOrEqual(480);
  });

  it("draws nothing for a photo or frame with no size yet", () => {
    expect(fitSize({ width: 0, height: 0 }, frame)).toEqual({ width: 0, height: 0 });
    expect(fitSize({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

// J34-1 (Lucas 10-20): 「框刚好包住照片」 - on a phone the frame is the
// photograph's own shape; no blurred background, no bands.
describe("the phone's frame is the photograph's own shape", () => {
  it("has no hatching and no fixed height, and takes the photo's shape below sm", () => {
    const html = render();
    const frame = html.slice(html.indexOf("<div", html.indexOf("data-photo-frame") - 400), html.indexOf("<img"));
    expect(frame).not.toContain("photo-hatch");
    expect(frame).not.toMatch(/h-\[\d+dvh\]/);
    expect(frame).toContain("max-sm:aspect-(--photo-shape)");
    expect(frame).toContain("max-sm:w-(--photo-frame-width)");
    expect(frame).toContain("max-sm:mx-auto");
    expect(html).toContain("--photo-shape:4 / 3");
  });

  it("is as tall as the window allows, never wider than its space or its pixels", () => {
    const portrait = photoFrameWidth({ width: 3024, height: 4032 }, "(100dvh - 15rem)");
    expect(portrait).toBe("min(100%, calc((100dvh - 15rem) * 0.7500), 3024px)");
    const landscape = photoFrameWidth({ width: 4032, height: 3024 }, "28rem");
    expect(landscape).toBe("min(100%, calc(28rem * 1.3333), 4032px)");
  });
});

// JB29 (客户 10-26 事项 5): on a computer, one screen - photo left, record
// right, every action in one row on top, nothing scrolls but the record.
describe("the computer's viewer (JB29)", () => {
  function between(html: string, from: string, to: string) {
    const start = html.indexOf(from);
    return html.slice(start, html.indexOf(to, start + from.length));
  }

  it("takes almost the whole window and does not scroll as a whole", () => {
    const html = render();
    const dialog = between(html, "data-photo-viewer", ">");
    expect(dialog).toContain("sm:w-[min(96vw,100rem)]");
    expect(dialog).toContain("sm:h-[min(94dvh,62.5rem)]");
    expect(dialog).toContain("sm:overflow-hidden");
    expect(dialog).not.toContain("--viewer-width");
  });

  it("puts the photo left and the record right, and only the record scrolls", () => {
    const html = renderDetail(
      <PhotoViewer
        photos={photos}
        index={0}
        reference="PG-001"
        onIndex={() => {}}
        onClose={() => {}}
        details={<p data-record-facts>{"防水涂料"}</p>}
      />,
    );
    const body = between(html, "data-photo-viewer-body", ">");
    expect(body).toMatch(/sm:grid-cols-\[minmax\(0,1fr\)_clamp\(23\.75rem,28vw,27\.5rem\)\]/);
    expect(html.indexOf("data-photo-stage")).toBeLessThan(html.indexOf("data-photo-viewer-details"));
    const details = between(html, "data-photo-viewer-details", ">");
    expect(details).toContain("sm:overflow-y-auto");
    expect(details).toContain("sm:min-h-0");
    expect(html).toContain("防水涂料");
  });

  it("shows the photo whole on the theme's muted surface, never cut", () => {
    const html = render();
    const stage = between(html, "data-photo-stage", ">");
    expect(stage).toContain("sm:bg-muted");
    expect(stage).not.toMatch(/bg-black/);
    const frame = between(html, "data-photo-frame", ">");
    expect(frame).toContain("sm:absolute");
    const img = between(html, "<img", ">");
    expect(img).toContain("object-contain");
    expect(img).not.toContain("object-cover");
  });

  it("fixes 上一张 / 下一张 at the photo's left and right, halfway down", () => {
    const html = render();
    expect(html).toContain("data-photo-previous");
    expect(html).toContain("data-photo-next");
    const prevTag = html.slice(html.lastIndexOf("<button", html.indexOf("data-photo-previous")), html.indexOf(">", html.indexOf("data-photo-previous")));
    const nextTag = html.slice(html.lastIndexOf("<button", html.indexOf("data-photo-next")), html.indexOf(">", html.indexOf("data-photo-next")));
    expect(prevTag).toMatch(/absolute left-2 top-1\/2/);
    expect(nextTag).toMatch(/absolute right-2 top-1\/2/);
    // Inside the photo's side, not in the bar or under the record.
    expect(html.indexOf("data-photo-previous")).toBeGreaterThan(html.indexOf("data-photo-stage"));
    expect(html.indexOf("data-photo-next")).toBeLessThan(html.indexOf("data-photo-viewer-details"));
  });

  it("has one bar on top: title, time, GPS, every action once, n / N and ×", () => {
    const html = renderDetail(
      <PhotoViewer
        photos={photos}
        index={1}
        reference="PG-001"
        onIndex={() => {}}
        onClose={() => {}}
        extraActions={<button type="button" data-open-record>打开原记录</button>}
      />,
    );
    const bar = between(html, "data-photo-viewer-bar", "data-photo-viewer-body");
    expect(bar).toContain("Road · 40%");
    expect(bar).toContain("未记录位置");
    expect(bar).toContain('data-stub="file-actions"');
    expect(bar).toContain("data-open-record");
    expect(bar).toMatch(/data-photo-counter[^>]*>2 \/ 2</);
    expect(bar).toContain("lucide-x");
    // The actions are not repeated anywhere else in the viewer.
    expect(html.split('data-stub="file-actions"').length).toBe(2);
    expect(html.split("data-open-record").length).toBe(2);
    // The zoom stays, under the photo.
    expect(between(html, "data-photo-stage", "data-photo-viewer-details")).toContain("data-photo-zoom-bar");
  });

  it("with no record to show, the right column is the photo's own facts", () => {
    const html = render(0);
    const facts = between(html, 'data-photo-viewer-details="photo"', "</dl>");
    expect(facts).toContain("max-sm:hidden");
    expect(facts).toContain("Road · 未填");
    expect(facts).toContain("GPS 3.1, 101.6");
    expect(facts).toContain("PG-001");
  });

  // JB44 (客户 10-27, Lucas 「和门岗照片记录一样」): 照片 + GPS地图同时显示.
  it("puts the photo's GPS on a map under its facts, filling the column, on the computer only", () => {
    const html = render(0);
    const column = html.slice(html.indexOf('data-photo-viewer-details="photo"'));
    expect(column.indexOf("</dl>")).toBeLessThan(column.indexOf("data-photo-viewer-map"));
    const map = between(html, "data-photo-viewer-map", ">");
    expect(map).toContain("max-sm:hidden");
    expect(map).toContain("sm:flex-1");
  });

  it("draws no map for a photo with no position", () => {
    expect(render(1)).not.toContain("data-photo-viewer-map");
  });

  it("keeps the phone's single column: photo, then actions, then the record", () => {
    const html = render();
    expect(between(html, "data-photo-viewer-bar", ">")).toContain("max-sm:contents");
    expect(between(html, "data-photo-viewer-body", ">")).toContain("max-sm:contents");
    expect(between(html, "data-photo-stage", ">")).toContain("max-sm:order-2");
    expect(between(html, "data-photo-viewer-actions", ">")).toContain("max-sm:order-3");
  });
});

// J44 (Lucas 10-22): the detail's large first photo is a square drawn from
// the large photograph, not a narrow strip from the thumbnail.
describe("the large first photo", () => {
  const photo = { id: "p", url: "https://cdn.example/full.jpg", thumbnailUrl: "https://cdn.example/thumb.webp", label: "DO" };

  it("is the large photograph in the office", () => {
    expect(heroSources(photo, false)).toEqual({ src: "https://cdn.example/full.jpg" });
  });

  it("on the phone names the thumbnail and offers the large one beside it", () => {
    expect(heroSources(photo, true)).toEqual({
      src: "https://cdn.example/thumb.webp",
      srcSet: "https://cdn.example/thumb.webp 400w, https://cdn.example/full.jpg 1600w",
    });
    expect(heroSources({ ...photo, thumbnailUrl: null }, true)).toEqual({ src: "https://cdn.example/full.jpg" });
    expect(heroSources({ ...photo, url: "" }, false)).toEqual({ src: "https://cdn.example/thumb.webp" });
  });

  // JB34 (客户 10-26 事项 10): back to the wide frame of 图 9-11.
  it("is a wide 16:9 frame across the whole panel, filled", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/shared/record-detail-shell.tsx"), "utf8");
    const hero = source.slice(source.indexOf("function ShellHeroPhoto"), source.indexOf("function ShellRecorder"));
    expect(hero).toContain("aspect-video w-full");
    expect(hero).not.toContain("aspect-square");
    expect(hero).not.toContain("max-w-md");
    expect(hero).toContain("heroFit(natural)");
    expect(hero).not.toContain("photoFrameWidth");
  });

  // J45 (Lucas 10-22, k13): the burnt-in watermark strip at the photo's foot
  // is never cut off nor covered by the hero.
  it("fills the frame with a 16:9, 4:3, square or tall photo, cut from the top so the strip stays", () => {
    expect(heroFit({ width: 1920, height: 1080 })).toBe("object-cover object-bottom");
    expect(heroFit({ width: 4000, height: 3000 })).toBe("object-cover object-bottom");
    expect(heroFit({ width: 1440, height: 1440 })).toBe("object-cover object-bottom");
    expect(heroFit({ width: 1080, height: 1920 })).toBe("object-cover object-bottom");
    // Before it has loaded: the same, so nothing jumps for the common case.
    expect(heroFit(null)).toBe("object-cover object-bottom");
  });

  it("shows a panorama wider than the frame whole, since cutting its sides would cut the strip's lines", () => {
    expect(heroFit({ width: 3000, height: 1000 })).toBe("object-contain");
  });

  it("lines the small photos under it up as equal landscape 4:3 tiles", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/shared/record-detail-shell.tsx"), "utf8");
    const strip = source.slice(source.indexOf("function ShellThumbnail"), source.indexOf("export function heroSources"));
    expect(strip).toContain("aspect-4/3 w-24");
    expect(strip).toContain("object-cover object-bottom");
    expect(strip).not.toMatch(/size-20/);
  });

  it("puts its caption at the top, off the watermark strip", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/shared/record-detail-shell.tsx"), "utf8");
    const hero = source.slice(source.indexOf("function ShellHeroPhoto"), source.indexOf("function ShellRecorder"));
    expect(hero).toContain("absolute left-2 top-2");
    expect(hero).not.toMatch(/absolute bottom-2/);
  });
});
