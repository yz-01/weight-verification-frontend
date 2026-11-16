/**
 * JB205-10 (Lucas 11-16 audit) - 登记地磅's 地点 list for MSE staff.
 *
 * MSE staff register a scale for any recycler, so the list is every company's
 * yards - only the first 100, as `code · name`, so two companies' 「Main Yard」
 * looked the same and the 101st could not be chosen. For MSE staff each yard
 * now says whose it is and a 找地点 box searches past the first 100. A
 * recycler's own form lists its own yards, exactly as before.
 *
 * The list itself opens in a popup that static markup does not draw, so the
 * labels and the request are read in the source; the box is rendered.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({ portal: "MSE_ADMIN" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/scales/create",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Staff", portal: state.portal, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
  }),
}));

const { CreateScale } = await import("@/components/scales/create-scale");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function render(portal: string) {
  state.portal = portal;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <CreateScale />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("登记地磅's 地点 list", () => {
  it("MSE staff get a 找地点 box above it", () => {
    const html = render("MSE_ADMIN");
    expect(html).toContain(zh.scales.siteSearch);
    expect(html).toContain(`placeholder="${zh.scales.siteSearchPlaceholder}"`);
    expect(html).toContain(zh.scales.siteSearchHint);
  });

  it("a recycler's own form is as before", () => {
    const html = render("MSE_SCRAP");
    expect(html).toContain(zh.scales.field.site);
    expect(html).not.toContain(zh.scales.siteSearch);
  });

  it("the search reaches the server, and each yard says whose it is", () => {
    const source = read("src/components/scales/create-scale.tsx");
    expect(source).toContain(
      'getSites({ page_size: 100, ...(isPlatform && search ? { search } : {}) })',
    );
    expect(source).toContain('queryKey: isPlatform ? ["sites", "options", search] : ["sites", "options"],');
    expect(source).toContain("? `${site.company_name} · ${site.code} · ${site.name}`");
    expect(source).toContain(": `${site.code} · ${site.name}`;");
  });

  it("is worded in all four languages", async () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = (await import(`@/messages/${locale}.json`)).default as typeof zh;
      expect(
        [messages.scales.siteSearch, messages.scales.siteSearchPlaceholder, messages.scales.siteSearchHint].every(Boolean),
        locale,
      ).toBe(true);
    }
  });
});
