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

import { FieldCamera, SQUARE_SOURCE, WideLensSwitch } from "@/components/shared/field-camera";

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
