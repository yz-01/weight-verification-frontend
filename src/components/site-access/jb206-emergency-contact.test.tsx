/**
 * JB206-9 (Lucas 11-16 audit, F1): 公司设置's 紧急联系人 / 紧急联系电话 -
 * 「给门岗用」 - were saved and never shown. They are on 紧急名单 and on the
 * guard's 门岗 phone page as a line to tap and call. Rendered to static
 * markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmergencyContactView, telHref } from "@/components/site-access/emergency-contact-line";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

function render(contact: { name: string; phone: string } | undefined) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <EmergencyContactView contact={contact} />
    </NextIntlClientProvider>,
  );
}

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("the emergency contact line (JB206-9)", () => {
  it("shows the name and a number to tap", () => {
    const html = render({ name: "Guard house", phone: "+60 12-345 6789" });
    expect(html).toContain("data-emergency-contact");
    expect(html).toContain("Guard house");
    expect(html).toContain('href="tel:+60123456789"');
    expect(html).toContain("+60 12-345 6789");
  });

  it("is not there when the company left both empty", () => {
    expect(render({ name: "", phone: "" })).toBe("");
    expect(render(undefined)).toBe("");
  });

  it("keeps only what a phone can dial", () => {
    expect(telHref("03-1234 5678")).toBe("tel:0312345678");
  });

  it("is on 紧急名单 and on the guard's 门岗 page, read from the server", () => {
    expect(source("src/components/site-access/emergency-list-workspace.tsx")).toContain("<EmergencyContactLine />");
    expect(source("src/components/site-access/gate-records.tsx")).toMatch(
      /export function GateRecordsPanel[\s\S]*?<EmergencyContactLine \/>/,
    );
    expect(source("src/services/site-access.service.ts")).toContain(
      "/api/contractor-site-settings/get_emergency_contact/",
    );
    for (const catalogue of [messages, zhTW, en, ms]) {
      expect(catalogue.siteControl.emergencyContact.call).toContain("{phone}");
    }
  });
});

describe("分公司与总部 says what it does today (JB206-10)", () => {
  it("no longer promises maps or reports", () => {
    expect(messages.siteControl.branches.subtitle).not.toMatch(/地图|报表/);
    expect(zhTW.siteControl.branches.subtitle).not.toMatch(/地圖|報表/);
    expect(en.siteControl.branches.subtitle).not.toMatch(/map|report/i);
    expect(ms.siteControl.branches.subtitle).not.toMatch(/peta|laporan/i);
  });
});
