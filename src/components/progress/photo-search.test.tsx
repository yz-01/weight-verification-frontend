/**
 * 现场照片 → 照片 has a 搜索 box (JB68, Lucas 10-29): it says what it finds -
 * the record number, remark, 施工分类 and recorder - in all four languages.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/progress",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { PhotoSearch } = await import("@/components/progress/progress-page");

describe("the photo wall's search box", () => {
  it("shows what was typed and what it searches", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <PhotoSearch value="PG-015" onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('value="PG-015"');
    expect(html).toContain(zh.progressPage.photos.search);
    expect(html).toContain('type="search"');
  });

  it("has its words in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.progressPage.photos.search).toBeTruthy();
      expect(messages.contractorOps.tasks.lastConfirmed).toContain("{value}");
    }
  });
});
