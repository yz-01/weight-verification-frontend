/**
 * I21 (ID44): 「请调整工程进度后台照片，点照片只显示完整照片，现有的照片太大了」.
 *
 * The shared viewer opens a photo whole: fitted into its frame, its shape
 * kept, no scroll bar - that is 100% - and zooming is relative to that. One
 * viewer for every screen (工程进度, 材料进场, 门岗, EHS, the chat), so this is
 * the one place it is checked.
 */
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
const { PhotoViewer, fitSize, photoFrameWidth } = await import("@/components/shared/record-detail-shell");

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

// J34-1 (Lucas 10-20): 「框刚好包住照片」 - no blurred background, no bands.
describe("the frame is the photograph's own shape", () => {
  it("has no hatching and no fixed height, and takes the photo's shape", () => {
    const html = render();
    const frame = html.slice(html.indexOf("<div", html.indexOf("data-photo-frame") - 200), html.indexOf("<img"));
    expect(frame).not.toContain("photo-hatch");
    expect(frame).not.toMatch(/h-\[\d+dvh\]/);
    expect(frame).toContain("aspect-ratio");
    expect(frame).toContain("mx-auto");
  });

  it("is as tall as the window allows, never wider than its space or its pixels", () => {
    const portrait = photoFrameWidth({ width: 3024, height: 4032 }, "(100dvh - 15rem)");
    expect(portrait).toBe("min(100%, calc((100dvh - 15rem) * 0.7500), 3024px)");
    const landscape = photoFrameWidth({ width: 4032, height: 3024 }, "28rem");
    expect(landscape).toBe("min(100%, calc(28rem * 1.3333), 4032px)");
  });

  it("makes the dialog as wide as the frame, so title and buttons sit over and under it", () => {
    const html = render();
    expect(html).toContain("--viewer-width");
    expect(html).toContain("sm:w-(--viewer-width)");
  });
});
