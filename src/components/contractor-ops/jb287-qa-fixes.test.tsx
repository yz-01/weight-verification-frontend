/**
 * JB287 QA (11-27, browser walk on the demo data): what the walk found.
 *
 * 1. 「去设定清运费用」 on 清运结算管理 used to jump to the 垃圾清运 tab; after
 *    setting the fee the boss was no longer in 未核对. It now opens the fee
 *    window where he is (`?fees=1` on the same page).
 * 2. A double click on 【确认】 (结算完毕), 【确认核对】 or 【保存】 sent the call
 *    twice; the second came back as an error right after the first worked.
 *    Each now sends once per press.
 * 3. A fee refusal (「已经设过费用」) stayed on screen after the date was
 *    changed; it now clears when the fee or the date is typed again.
 * 4. An office account without 「审核及安排垃圾清运」 saw no 【清运费用设定】
 *    and no 【确认核对】 at all, while 【准备结算】 was locked with the reason;
 *    all three are now locked with the reason, and the 「去设定」 links are
 *    only for whoever may set fees.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/waste-clearance",
  useSearchParams: () => new URLSearchParams("kind=settlement"),
}));
const reader = vi.hoisted(() => ({ phone: false, perms: new Set<string>(["disposal.view", "disposal.manage", "supplier.view"]) }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", email: "office@x.test", is_field_staff: reader.phone },
    can: (code: string) => reader.perms.has(code),
  }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: false,
    projectId: "",
    projects: [],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
}));

const { DisposalFeeButton, DisposalFeeLink } = await import("@/components/contractor-ops/disposal-fees");
const { NoFeeLine } = await import("@/components/contractor-ops/disposal-settlements");
const { DisposalFeePanel } = await import("@/components/contractor-ops/disposal-fee-panel");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reader.phone = false;
  reader.perms = new Set(["disposal.view", "disposal.manage", "supplier.view"]);
});

const NO_FEE_ROW = {
  cleared_on: "2026-11-08",
  fee_per_trip: null,
  fee_amount: null,
  fee_state: "no_fee" as const,
  settlement: null,
  amounts_hidden: false,
  trip_count: 2,
  actual_weight_kg: "900",
};

describe("1. 「去设定清运费用」 opens the fee window on the same page", () => {
  it("is a button that adds ?fees=1 to the page the reader is on, not a jump to the 垃圾清运 tab", () => {
    const html = render(<NoFeeLine count={2} />);
    expect(html).toContain('data-slot="disposal-fee-link"');
    expect(html).not.toContain("kind=garbage");
    expect(text(html)).toContain(zh.jb287.settlement.noFeeLink);
    const source = read("src/components/contractor-ops/disposal-fees.tsx");
    expect(source).toMatch(/next\.set\(DISPOSAL_FEES_PARAM, "1"\);\s+router\.replace\(`\$\{pathname\}\?\$\{next\.toString\(\)\}`, \{ scroll: false \}\);/);
    const page = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(page).not.toContain("DISPOSAL_FEES_HREF");
    expect(page.match(/<DisposalFeeLink /g)?.length).toBe(2);
  });

  it("is not offered to a reader who may not set fees (no dead link)", () => {
    reader.perms = new Set(["disposal.view"]);
    expect(render(<DisposalFeeLink />)).toBe("");
    expect(text(render(<NoFeeLine count={2} />))).not.toContain(zh.jb287.settlement.noFeeLink);
    const panel = render(<DisposalFeePanel row={NO_FEE_ROW} />);
    expect(text(panel)).toContain(zh.jb287.panel.noFee);
    expect(panel).not.toContain("fees=1");
    reader.perms = new Set(["disposal.view", "disposal.manage"]);
    expect(render(<DisposalFeePanel row={NO_FEE_ROW} />)).toContain('href="/waste-clearance?kind=garbage&amp;fees=1"');
  });
});

describe("2. one call per press", () => {
  it("确认核对, 结算完毕 and 保存 each guard against a double click", () => {
    const page = read("src/components/contractor-ops/disposal-settlements.tsx");
    const guard = /if \(sending\.current\) return;\s+sending\.current = true;\s+(save|settle)\.mutate\(undefined, \{\s+onSettled: \(\) => \{\s+sending\.current = false;/g;
    expect(page.match(guard)?.length).toBe(2);
    expect(page).toContain('data-slot="settlement-confirm-go"');
    expect(page).toContain('data-slot="settlement-settle-confirm"');
    const fees = read("src/components/contractor-ops/disposal-fees.tsx");
    expect(fees.match(guard)?.length).toBe(1);
  });
});

describe("3. a fee refusal clears once the fee or the date is typed again", () => {
  it("both boxes clear the message", () => {
    const fees = read("src/components/contractor-ops/disposal-fees.tsx");
    expect(fees).toMatch(/setFee\(event\.target\.value\);\s+setError\(""\);/);
    expect(fees).toMatch(/setDay\(event\.target\.value\);\s+setError\(""\);/);
  });
});

describe("4. without 「审核及安排垃圾清运」 the buttons are locked, saying why", () => {
  it("【清运费用设定】 is locked with the reason for an office account; the phone sees nothing", () => {
    reader.perms = new Set(["disposal.view"]);
    const html = render(<DisposalFeeButton />);
    expect(html).toContain('data-slot="disposal-fee-button-locked"');
    expect(html).toContain("disabled");
    expect(text(html)).toContain(zh.jb287.fee.button);
    expect(html).toContain(zh.jb287.fee.noRight);
    reader.phone = true;
    expect(render(<DisposalFeeButton />)).toBe("");
    reader.phone = false;
    reader.perms = new Set(["disposal.view", "disposal.manage"]);
    expect(render(<DisposalFeeButton />)).toContain('data-slot="disposal-fee-button"');
  });

  it("【确认核对】 is locked with the reason in 未核对", () => {
    const page = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(page).toMatch(/\{!office && user && !user\.is_field_staff && rows\.length > 0 \? \(\s+<Button data-slot="settlement-confirm-locked" disabled disabledReason=\{t\("settlement\.noRightCheck"\)\} showReason>/);
  });

  it("the two reasons are in all four languages and say 你", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.jb287.fee.noRight).toBeTruthy();
      expect(catalogue.jb287.settlement.noRightCheck).toBeTruthy();
    }
    expect(zh.jb287.fee.noRight).toBe("你没有「审核及安排垃圾清运」权限，不能设定清运费用。");
    expect(zh.jb287.settlement.noRightCheck).toBe("你没有「审核及安排垃圾清运」权限，不能核对。");
    expect(zhTW.jb287.fee.noRight).not.toContain("您");
  });
});
