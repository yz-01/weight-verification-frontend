/**
 * JB309 group F (客户 11-28l 第 5 点, and 第 6 点's order): 三方独立签字审批.
 *
 * 「项目经理：确认实际施工内容及现场证据。QS 或授权审核负责人：核对申请金额、施工分类及
 * 历史工程款申请。总部授权负责人：最终审核及批准金额。三方必须使用不同账号及各自的六位数
 * 签核密码，按顺序完成签字确认，不得由同一个人代替三方审批。」 「三方签字完成后，由项目
 * 经理确认完毕并归档」. The order and the accounts are the server's rules
 * (`test_jb309_f`); here: the package window shows the three steps of every
 * round, the QS reviews without an amount, 提交审批 chooses the QS, and the
 * words exist in every language.
 *
 * The runner has no DOM: pure helpers, static markup and the source text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EvidencePackageDetail, ThreePartyView } from "@/interfaces/contractor-ops";
import { isLinkRecipient } from "@/interfaces/contractor-ops";
import catalogue from "@/lib/permission-catalogue.json";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/evidence-packages",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({
    user: { id: "u-qs", full_name: "QS Lim", is_field_staff: false, account_type: "TENANT" },
    can: () => true,
    refresh: async () => {},
  }),
}));

const { ThreePartyBlock, ThreePartyWaitingNote } = await import("@/components/contractor-ops/package-three-party");
const { CompletePanel, ReviewDialog } = await import("@/components/contractor-ops/package-review-loop");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const step = (name: string, action: string, opinion = "") => ({
  signer_name: name,
  signed_at: "2026-11-28T06:50:00Z",
  action,
  opinion,
  recipient_name: "",
  signature_url: null,
});

const twoRounds = {
  round_no: 2,
  next: "HEADQUARTERS",
  complete: false,
  qs_name: "QS Lim",
  rounds: [
    { round_no: 2, manager: step("PM Tan", "SUBMITTED"), qs: step("QS Lim", "APPROVED", "金额及分类已核对"), headquarters: null },
    {
      round_no: 1,
      manager: step("PM Tan", "SUBMITTED"),
      qs: step("QS Lim", "APPROVED"),
      headquarters: step("测试建筑商 1", "RETURNED", "DO 照片看不清"),
    },
  ],
} as unknown as ThreePartyView;

describe("JB309-5 the three steps on the package window", () => {
  it("shows the order, the next step and every round with who, result and opinion", () => {
    const html = render(<ThreePartyBlock view={twoRounds} />);
    const words = text(html);
    expect(words).toContain("三方签字审批");
    expect(words).toContain("项目经理 → QS 或授权审核负责人 → 总部授权负责人");
    expect(words).toContain("下一步：等总部授权负责人最终审核及批准金额。");
    expect(words).toContain("第 2 轮");
    expect(words).toContain("第 1 轮");
    // The returned round is kept with head office's return and opinion.
    expect(words).toContain("退回补充资料");
    expect(words).toContain("DO 照片看不清");
    expect(words).toContain("金额及分类已核对");
    expect(words).toContain("还没签");
    expect(html.indexOf('data-three-party-round="2"')).toBeLessThan(html.indexOf('data-three-party-round="1"'));
    expect((html.match(/data-three-party-step=/g) ?? []).length).toBe(6);
  });

  it("is nothing on any other package", () => {
    expect(render(<ThreePartyBlock view={null} />)).toBe("");
  });

  it("says why head office or the QS waits", () => {
    expect(text(render(<ThreePartyWaitingNote waiting="qs_first" />))).toContain("要等 QS 或授权审核负责人先审核通过这一轮");
    expect(text(render(<ThreePartyWaitingNote waiting="same_signer" />))).toContain("三方必须是不同的人");
    expect(render(<ThreePartyWaitingNote waiting={null} />)).toBe("");
  });
});

describe("JB309-5 the QS reviews, head office approves the amount", () => {
  const claim = {
    id: "pkg-30",
    package_type: "PROGRESS_CLAIM",
    claim_amount: "56000.00",
    money: { claim_amount: "56000.00", approved_amount: null, difference: null, approved_amount_reason: "", approved_at: null, locked: false },
  } as unknown as EvidencePackageDetail;
  const records = [{ id: "i-1", label: "PG-001", mine: "ACCEPTED" as const }];

  it("the QS's window has no approved amount; head office's has", () => {
    const qsHtml = render(
      <ReviewDialog pkg={claim} records={records} amounts={false} onClose={() => undefined} submit={async () => undefined} onDone={() => undefined} />,
    );
    expect(qsHtml).not.toContain("data-review-money");
    const hqHtml = render(
      <ReviewDialog pkg={claim} records={records} onClose={() => undefined} submit={async () => undefined} onDone={() => undefined} />,
    );
    expect(hqHtml).toContain("data-review-money");
  });

  it("the QS reads that the project manager archives", () => {
    const pkg = {
      id: "pkg-30",
      completed_at: null,
      completes_on_project: true,
      qs_review: { recipient: "r-qs", name: "QS Lim", mine: true, can_review: false },
    } as unknown as EvidencePackageDetail;
    expect(text(render(<CompletePanel pkg={pkg} onChanged={() => undefined} />))).toContain(
      "「确认完毕并归档」由项目经理去按，QS 这里不用按。",
    );
  });

  it("the QS signs his own review on his own recipient", () => {
    const exchange = read("src/components/contractor-ops/package-exchange.tsx");
    expect(exchange).toContain("reviewEvidencePackage(data.id, { ...payload, recipient: qs.recipient })");
    expect(exchange).toContain("amounts={false}");
    expect(exchange).toContain("<ThreePartyBlock view={data.three_party} />");
    const service = read("src/services/contractor-ops.service.ts");
    expect(service).toContain('if (payload.recipient) body.append("recipient", payload.recipient);');
  });
});

describe("JB309-5 提交审批 chooses the QS, head office goes with him", () => {
  it("offers the QS first on a subcontractor's claim and refuses anybody else before him", () => {
    const exchange = read("src/components/contractor-ops/package-exchange.tsx");
    expect(exchange).toContain('{ kind: shownKind, reviewer, with_headquarters: true }');
    expect(exchange).toContain('const qsFirst = threeParty && !hasQs && purpose === "APPROVAL" && kind !== "QS";');
    expect(exchange).toContain('disabledReason={qsFirst ? words("send.qsFirst") : undefined}');
    expect(exchange).toContain("getPackageQsChoices(pkg.id)");
  });

  it("the QS signs in: no link", () => {
    expect(isLinkRecipient("QS")).toBe(false);
    expect(isLinkRecipient("OWNER")).toBe(true);
  });
});

describe("JB309-5 words in every language", () => {
  it("has every key, every error and the new switch", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`))
        : [prefix];
    for (const messages of [en, ms, zhTW, zh]) {
      expect(keys(messages.jb309f).sort()).toEqual(keys(zh.jb309f).sort());
      for (const code of [
        "package_qs_not_needed",
        "package_qs_required",
        "package_qs_reviewer_required",
        "package_qs_reviewer_invalid",
        "package_same_signer",
        "package_qs_first",
        "package_qs_review_off",
        "package_three_party_incomplete",
      ]) {
        expect((messages.errors.api as Record<string, string>)[code], code).toBeTruthy();
      }
      expect(messages.multiEngine.exchange.kind.QS).toBeTruthy();
      expect((messages.permissions.code.package as Record<string, string>).qs_review).toBeTruthy();
    }
    expect(zh.permissions.code.package.qs_review).toContain("工程款审核（QS）");
    const codes = JSON.stringify(catalogue);
    expect(codes).toContain('"package.qs_review"');
  });
});
