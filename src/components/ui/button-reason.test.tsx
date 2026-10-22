/**
 * A disabled button says why on a phone too (J13-1, JB4, Q13-1).
 *
 * 「提交退场」 looked pressable (a half-faded blue gradient) and what was
 * missing lived only in a tooltip, which a touch screen never shows. Now the
 * primary button turns flat grey when disabled, and the fields still missing
 * are written above it on a touch screen.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

describe("Button with missing fields (J13-1)", () => {
  it("writes what is missing on screen for a touch device, not only in the tooltip", () => {
    const html = render(
      <Button className="w-full" requires={[["", "退场原因"], [null, "供应商签名"], ["ok", "DO 号码"]]}>
        提交退场
      </Button>,
    );
    const words = "还差这些没填：退场原因、供应商签名";
    expect(html).toContain('data-slot="button-reason"');
    // The visible line (shown under pointer-coarse), before the button.
    expect(html).toContain(`pointer-coarse:block">${words}</span>`);
    expect(html.indexOf(words)).toBeLessThan(html.indexOf("提交退场</button>"));
    expect(html).toContain("pointer-coarse:w-full");
    expect(html).not.toContain("DO 号码");
    expect(html).toContain("disabled");
  });

  it("is flat grey when disabled - no gradient, no glow, full opacity", () => {
    const html = render(<Button disabled>提交</Button>);
    for (const cls of ["disabled:bg-muted", "disabled:bg-none", "disabled:shadow-none", "disabled:opacity-100"]) {
      expect(html).toContain(cls);
    }
  });

  it("adds nothing when everything is filled in, or for a plain reason like a page edge", () => {
    expect(render(<Button requires={[["x", "退场原因"]]}>提交</Button>)).not.toContain("button-reason");
    expect(render(<Button disabled disabledReason="已经是第一页">上一页</Button>)).not.toContain("button-reason");
    expect(render(<Button disabled disabledReason="先拍照" showReason>提交</Button>)).toContain("button-reason");
  });
});
