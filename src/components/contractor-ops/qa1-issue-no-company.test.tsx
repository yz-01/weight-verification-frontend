/**
 * QA1 audit #23 (JB278 第 2 点): a 领用 with no 所属公司 is never offered for
 * 核对. Its panel says so and what to press (【改正】 → 所属公司), instead of
 * 「待核对」 for ever.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u", is_field_staff: false }, can: () => true }),
}));

const { ReconciliationPanel } = await import("@/components/contractor-ops/return-checks");

function render(node: React.ReactNode) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a 领用 with no 所属公司", () => {
  it("says it cannot be checked and to fill in the company with 【改正】", () => {
    const html = render(<ReconciliationPanel links={null} noCompany />);
    expect(html).toContain(zh.jb278.stateNoCompany);
    expect(html).toContain(zh.jb278.noCompanyHelp);
    expect(html).not.toContain(`>${zh.jb278.statePending}<`);
    expect(zh.jb278.noCompanyHelp).toContain(zh.recordCorrection.button);
  });

  it("an ordinary one still reads 待核对", () => {
    const html = render(<ReconciliationPanel links={null} />);
    expect(html).toContain(zh.jb278.statePending);
    expect(html).not.toContain("reconciliation-no-company");
  });

  it("the 领用 page passes it, and the words are in all four languages", () => {
    const source = readFileSync(join(process.cwd(), "src/components/contractor-ops/operations-workspaces.tsx"), "utf8");
    expect(source).toMatch(/noCompany=\{issue && !\(row\.equipment_company/);
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb278.noCompanyHelp).toContain(messages.recordCorrection.button);
    }
  });
});
