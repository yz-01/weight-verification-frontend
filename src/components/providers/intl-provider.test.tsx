import { useLocale, useTranslations } from "next-intl";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IntlProvider } from "@/components/providers/intl-provider";
import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

/**
 * The root provider that replaced the server-fed `NextIntlClientProvider`
 * (perf #7, 2026-10-09). The server still renders the first paint with every
 * word in place, so a phone never sees a raw key while the browser fetches
 * its own copy of the catalogue.
 */

function Probe() {
  const t = useTranslations("offline.kind");
  return (
    <p data-locale={useLocale()}>{t("ATTENDANCE")}</p>
  );
}

function tree(locale: Locale) {
  return (
    <IntlProvider
      locale={locale}
      timeZone="Asia/Kuala_Lumpur"
      now={new Date("2026-10-09T00:00:00Z")}
    >
      <Probe />
    </IntlProvider>
  );
}

describe("IntlProvider", () => {
  it("renders the first paint translated, waiting for the catalogue", async () => {
    const stream = await renderToReadableStream(tree("zh-TW"));
    await stream.allReady;
    const html = await new Response(stream).text();
    const traditional = (await loadMessages("zh-TW")) as {
      offline: { kind: { ATTENDANCE: string } };
    };
    expect(html).toContain(traditional.offline.kind.ATTENDANCE);
    expect(html).toContain('data-locale="zh-TW"');
    expect(html).not.toContain("offline.kind.ATTENDANCE");
  });

  it("renders at once, with no loading state, once the catalogue is in", async () => {
    await loadMessages("zh");
    const html = renderToStaticMarkup(tree("zh"));
    expect(html).toBe('<p data-locale="zh">人员进场打卡</p>');
  });
});
