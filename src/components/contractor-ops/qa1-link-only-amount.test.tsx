/**
 * Lucas 11-27 (A): a Progress / Sundry Claim approved only through outside
 * links keeps no 本期批准金额 - the 资料包 window says why, plainly. The link
 * page itself never shows money (H17 六 7), so it says nothing about it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvidencePackageDetail } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const { MoneyBlock } = await import("@/components/contractor-ops/package-review-loop");

const pkg = (money: Record<string, unknown>) =>
  ({ package_type: "PROGRESS_CLAIM", claim_amount: "12500.00", money }) as unknown as EvidencePackageDetail;
const render = (row: EvidencePackageDetail) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
      <MoneyBlock pkg={row} />
    </NextIntlClientProvider>,
  );
const base = { claim_amount: "12500.00", difference: null, approved_amount_reason: "" };

describe("批准金额 left empty by a link-only approval", () => {
  it("says why when approved with a claim amount and no approved amount", () => {
    const html = render(pkg({ ...base, approved_amount: null, approved_at: "2026-11-27T05:00:00Z", locked: false }));
    expect(html).toContain(zh.jb252.money.linkOnly);
  });

  it("says nothing before approval, or when an amount was locked", () => {
    expect(render(pkg({ ...base, approved_amount: null, approved_at: null, locked: false }))).not.toContain("data-package-money-link-only");
    expect(
      render(pkg({ ...base, approved_amount: "12000.00", approved_at: "2026-11-27T05:00:00Z", locked: true })),
    ).not.toContain("data-package-money-link-only");
  });

  it("has the words in four languages and none on the link page", () => {
    for (const messages of [zh, zhTW, en, ms]) expect(messages.jb252.money.linkOnly.length).toBeGreaterThan(20);
    const link = readFileSync(join(process.cwd(), "src/components/package-link/package-link.tsx"), "utf8");
    expect(link).not.toContain("linkOnly");
  });
});
