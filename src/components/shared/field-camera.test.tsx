/**
 * Every in-app photo is square (J45, Lucas 2026-10-22 「全部拍照都改正方形」).
 *
 * The viewfinder is a square showing the centre of the video (`object-cover`),
 * which is exactly the square `lib/original-capture` keeps - so the worker
 * sees the photo they get. Rendered to static markup (the runner has no DOM),
 * with the dialog stubbed open so its content is drawn.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Pass,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

import { FieldCamera, keptSquareInView, SQUARE_SOURCE, WideLensSwitch } from "@/components/shared/field-camera";

function render(facingMode: "user" | "environment" = "environment") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <TooltipProvider>
        <FieldCamera label="DO" facingMode={facingMode} onCapture={() => undefined} />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );
}

function viewfinder(html: string): string {
  const match = html.match(/<div[^>]*data-testid="field-camera-viewfinder"[^>]*>/);
  expect(match).not.toBeNull();
  return match![0];
}

describe("FieldCamera viewfinder (J45)", () => {
  it("is a square, on a phone and on a desktop alike", () => {
    const box = viewfinder(render());
    expect(box).toContain("aspect-square");
    // The old shapes: tall on a phone, wide on a desktop.
    expect(box).not.toContain("aspect-[3/4]");
    expect(box).not.toContain("aspect-video");
    // Capped by width: a max-height would squash the square into a
    // rectangle showing more than the photo keeps.
    expect(box).not.toMatch(/max-h-/);
    expect(box).toContain("overflow-hidden");
  });

  it("fills the square with the centre of the video, as the photo is cut", () => {
    const html = render();
    expect(html).toMatch(/<video[^>]*class="[^"]*h-full w-full object-cover/);
  });

  it("mirrors the front camera's preview only", () => {
    expect(render("user")).toMatch(/<video[^>]*-scale-x-100/);
    expect(render("environment")).not.toMatch(/<video[^>]*-scale-x-100/);
  });

  it("asks for a 4:3 stream, whose short side makes the sharpest square", () => {
    expect(SQUARE_SOURCE.width.ideal).toBe(1920);
    expect(SQUARE_SOURCE.height.ideal).toBe(1440);
    expect(SQUARE_SOURCE.aspectRatio.ideal).toBeCloseTo(4 / 3);
  });
});

describe("the 「广角」 switch and the step-back line (J45)", () => {
  it("tells the worker to step back when it does not all fit", () => {
    expect(render()).toContain(messages.fieldStaffPwa.camera.stepBack);
    expect(messages.fieldStaffPwa.camera.stepBack).toBe("拍不全请退后一点");
  });

  it("is not there on a phone without a wide lens", () => {
    expect(renderToStaticMarkup(<WideLensSwitch lens={null} wide={false} label="广角" onToggle={() => undefined} />)).toBe("");
    // Nor before the camera has opened.
    expect(render()).not.toContain("field-camera-wide");
  });

  it("is there with a wide lens, off by default, pressed when on", () => {
    const lens = { kind: "zoom" as const, min: 0.5, normal: 1 };
    const off = renderToStaticMarkup(<WideLensSwitch lens={lens} wide={false} label="广角" onToggle={() => undefined} />);
    expect(off).toContain('data-testid="field-camera-wide"');
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain("广角");
    const on = renderToStaticMarkup(<WideLensSwitch lens={{ kind: "device", deviceId: "uw" }} wide label="广角" onToggle={() => undefined} />);
    expect(on).toContain('aria-pressed="true"');
  });
});

/**
 * Full screen on a phone (client 2026-11-09 item 7: 「手机端摄像头取景画面能否
 * 调高、放大一点，或者直接改成手机全屏取景？」). The photo is still the centre
 * square of the whole camera frame (J45) - the screen only shows it bigger.
 */
describe("the phone viewfinder fills the screen (client 2026-11-09 item 7)", () => {
  it("takes the whole screen below the sm breakpoint, the square dialog above it", () => {
    const box = viewfinder(render());
    expect(box).toContain("max-sm:absolute max-sm:inset-0");
    expect(box).toContain("max-sm:aspect-auto");
    expect(box).toContain("max-sm:max-w-none");
    expect(box).toMatch(/(^|\s|")aspect-square(\s|")/);
  });

  it("keeps the buttons and the title clear of the notch and the home bar", async () => {
    // The dialog parts are stubbed here, so their classes are read from the source.
    const source = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "src", "components", "shared", "field-camera.tsx"),
      "utf8",
    );
    expect(source).toContain("max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]");
    expect(source).toContain("max-sm:pt-[max(0.75rem,env(safe-area-inset-top))]");
    expect(source).toMatch(/<DialogContent\s+showCloseButton=\{false\}\s+className="[^"]*max-sm:inset-0[^"]*max-sm:h-dvh/);
    expect(render()).toContain(messages.common.close);
  });

  it("keeps the photo the centre square of the whole frame", async () => {
    const source = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "src", "components", "shared", "field-camera.tsx"),
      "utf8",
    );
    // Drawn from the video element itself, not from what the screen shows.
    expect(source).toContain("applicationPhotoCanvas(video, facing === \"user\", original)");
    expect(source).toContain("startOriginal(video, facing === \"user\")");
  });
});

describe("where the kept square sits on screen", () => {
  it("is the whole box when the box is the square (desktop)", () => {
    expect(keptSquareInView(1920, 1440, 600, 600)).toEqual({ width: 1, height: 1 });
    expect(keptSquareInView(1440, 1920, 600, 600)).toEqual({ width: 1, height: 1 });
  });

  it("is a full-width band on an upright phone screen", () => {
    // A 1440 x 1920 upright frame on a 390 x 844 screen: shown 633 px wide
    // (sides off screen); the 1440 px square is 633 px tall, the band.
    const band = keptSquareInView(1440, 1920, 390, 844);
    expect(band.width).toBe(1);
    expect(band.height).toBeCloseTo(633 / 844, 2);
  });

  it("never claims more than the box, and survives a camera not yet sized", () => {
    expect(keptSquareInView(0, 0, 390, 844)).toEqual({ width: 1, height: 1 });
    const wide = keptSquareInView(1920, 1080, 844, 390);
    expect(wide.height).toBe(1);
    expect(wide.width).toBeCloseTo((1080 * (844 / 1920)) / 844, 2);
  });
});
