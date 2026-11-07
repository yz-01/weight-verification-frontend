/**
 * Lucas 11-08: 「确保每个照片的放大和缩小都可以正常使用」「整个系统都照片都一样」.
 *
 * Every viewer that shows one photo large zooms the same way - 100% (the
 * whole photo) to 400%, 放大 / 缩小 / 整张显示 under it - through the one
 * shared piece, `photo-zoom`. Rendered to static markup (no DOM in the
 * runner) and, for the screens that need a server to open, read as source.
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

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ZoomablePhoto, enlargedStyle, clampZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } = await import(
  "@/components/shared/photo-zoom"
);
const { PhotoWallViewer } = await import("@/components/shared/photo-wall-viewer");

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("the shared zoom", () => {
  it("goes from the whole photo to 400% in steps of 50%", () => {
    expect(MIN_ZOOM).toBe(1);
    expect(MAX_ZOOM).toBe(4);
    expect(ZOOM_STEP).toBe(0.5);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it("enlarges to the fitted size times the zoom and never shrinks back in the flex frame", () => {
    const sized = enlargedStyle({ width: 300, height: 400 }, 4);
    expect(sized).toMatchObject({ width: "1200px", height: "1600px", maxWidth: "none", flexShrink: 0 });
    // Before the frame is measured, the frame's width stands in - still no shrinking.
    expect(enlargedStyle(null, 3)).toMatchObject({ width: "300%", flexShrink: 0 });
    const source = read("src/components/shared/photo-zoom.tsx");
    const style = source.slice(source.indexOf("export function enlargedStyle"), source.indexOf("export function zoomFrameClass"));
    expect(style.match(/flexShrink: 0/g)).toHaveLength(2);
  });

  it("opens whole, with 放大 / 缩小 / 整张显示 under the photo", () => {
    const html = renderDetail(<ZoomablePhoto src="https://cdn.example/a.jpg" alt="A" frameClassName="h-[50dvh]" />);
    expect(html).toContain('data-photo-frame="whole"');
    expect(html).toContain('data-photo-zoom="100"');
    expect(html).toContain("data-photo-zoom-bar");
    expect(html).toContain("放大");
    expect(html).toContain("缩小");
    expect(html).toContain("整张显示");
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("data-photo-zoom-bar"));
    const img = html.slice(html.indexOf("<img"), html.indexOf(">", html.indexOf("<img")));
    expect(img).toContain("max-h-full max-w-full object-contain");
    expect(img).not.toContain("width:");
  });

  it("leaves the page's own pinch to the photo: the frame pans, two fingers zoom it", () => {
    const html = renderDetail(<ZoomablePhoto src="https://cdn.example/a.jpg" alt="A" />);
    const frame = html.slice(html.indexOf("data-photo-frame"), html.indexOf("<img"));
    expect(frame).toContain("touch-pan-x touch-pan-y");
  });
});

describe("照片墙 (今日现场照片, 工程照片墙) zooms like every viewer", () => {
  const photo = {
    id: "h1",
    image: "https://cdn.example/wall-stamped.jpg",
    captured_at: "2026-11-08T02:00:00Z",
    project_id: "p1",
    project: "Road",
    photographer: "Ali",
    record_kind: "material_receipt",
    record_id: "r1",
    headline: null,
  } as unknown as Parameters<typeof PhotoWallViewer>[0]["photo"];

  it("shows the photo whole with the zoom bar under it", () => {
    const html = renderDetail(
      <PhotoWallViewer
        photo={photo}
        position={0}
        loaded={3}
        more={false}
        loadingNext={false}
        onStep={() => {}}
        onClose={() => {}}
        onOpenRecord={() => {}}
      />,
    );
    expect(html).toContain("wall-stamped.jpg");
    expect(html).toContain("data-wall-photo");
    expect(html).toContain('data-photo-frame="whole"');
    expect(html).toContain("data-photo-zoom-bar");
    expect(html).toContain("整张显示");
  });
});

describe("every photo opened large uses the shared zoom", () => {
  const viewers = [
    "src/components/shared/photo-wall-viewer.tsx",
    "src/components/site-access/gate-photo-wall.tsx",
    "src/components/evidence/evidence-archive.tsx",
    "src/components/site-workers/bulk-panels.tsx",
    "src/components/site-operations/attendance.tsx",
    "src/components/shared/file-preview.tsx",
    "src/components/shared/file-actions.tsx",
  ];

  it.each(viewers)("%s shows its photo in ZoomablePhoto", (file) => {
    expect(read(file)).toMatch(/<ZoomablePhoto\b/);
  });

  it("the record viewer (PhotoViewer) uses the same zoom and bar", () => {
    const shell = read("src/components/shared/record-detail-shell.tsx");
    expect(shell).toContain("usePhotoZoom(photo.url");
    expect(shell).toContain("<PhotoZoomBar");
    expect(shell).toContain("style={whole ? undefined : enlarged}");
  });

  it("the gate wall keeps its swipe and its photo mark", () => {
    const gate = read("src/components/site-access/gate-photo-wall.tsx");
    const viewer = gate.slice(gate.indexOf("<ZoomablePhoto"), gate.indexOf("/>", gate.indexOf("<ZoomablePhoto")));
    expect(viewer).toContain("onSwipe={onStep}");
    expect(viewer).toContain('"data-wall-photo": true');
  });

  it("no striped bands beside a photo anywhere (Lucas 11-08)", () => {
    const css = read("src/app/globals.css");
    expect(css).not.toMatch(/repeating-(linear|radial)-gradient/);
    for (const file of viewers) expect(read(file), file).not.toMatch(/repeating-(linear|radial)-gradient/);
  });
});
