/**
 * J33-4: the PDPA notice a visitor agrees to - the company's own words for the
 * reader's language when it wrote some, else the system's, the keeping time
 * from the setting either way - and 「我同意」 under it.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VisitorConsent, pdpaNoticeText } from "@/components/site-access/visitor-consent";
import messages from "@/messages/zh.json";

describe("the visitor's PDPA notice (J33-4)", () => {
  it("uses the company's words for this language, with the keeping time put in", () => {
    expect(pdpaNoticeText({ zh: "照片保存 {months} 个月。" }, "zh", "default", 6)).toBe("照片保存 6 个月。");
  });

  it("falls back to the system's text when the company wrote none for this language", () => {
    expect(pdpaNoticeText({ en: "Ours" }, "zh", "system text", 12)).toBe("system text");
    expect(pdpaNoticeText({ zh: "   " }, "zh", "system text", 12)).toBe("system text");
    expect(pdpaNoticeText(undefined, "zh", "system text", 12)).toBe("system text");
  });

  it("shows the notice and the 「我同意」 box", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <VisitorConsent notice="照片保存 12 个月。" checked={false} onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("照片保存 12 个月。");
    expect(html).toContain("访客已阅读并同意以上告知");
  });

  it("says the keeping time in the system's own text", () => {
    expect(messages.siteControl.pdpa.defaultNotice).toContain("{months}");
  });
});
