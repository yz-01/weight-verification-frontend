/**
 * JB307 group B (客户 11-28j 第 3、4、5、8 点).
 *
 * 3. 「Claim 类型及 Claim 分类必须填写。属于分包商的 Progress Claim，必须选择对应分包商，
 *    避免审核归档后显示「不需要结算」，导致无法进入结算流程。」
 * 4. 「总部负责审核批准，项目经理负责最终确认归档。请修复双方操作权限。」
 * 5. 「目前「全部类型」页面没有显示「核对与结算」按钮，进入 Progress Claim 分类后才出现。
 *    请检查操作入口及相关用户权限是否合理。」
 * 8. 「资料包已经完成归档及结算，收件方状态仍然显示「审核通过，待完成确认」。」
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
    user: { id: "u-1", full_name: "测试建筑商 1", is_field_staff: false, account_type: "TENANT" },
    can: () => true,
    refresh: async () => {},
  }),
}));

const { claimNeedsSubcontractor } = await import("@/components/contractor-ops/package-claim-parts");
const { ReconcileSettleButton } = await import("@/components/contractor-ops/return-checks");
const { CompletePanel } = await import("@/components/contractor-ops/package-review-loop");

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

const category = (over: Record<string, unknown>) =>
  ({ code: "CLM-001", name: "", name_zh: "", name_en: "", parent_name: null, is_other: false, ...over }) as never;

describe("JB307-3 Claim 类型 / 分类 required; a subcontractor's claim names its 分包商", () => {
  it("knows a subcontractor's 分类 as the server does", () => {
    expect(claimNeedsSubcontractor(category({ code: "CLM-SUBCONTRACTOR", name: "Piling works" }))).toBe(true);
    expect(claimNeedsSubcontractor(category({ name: "Subcontractor Claim" }))).toBe(true);
    expect(claimNeedsSubcontractor(category({ name: "分包商 Claim" }))).toBe(true);
    expect(claimNeedsSubcontractor(category({ name: "Other Claim", is_other: true }), "Subcon piling")).toBe(true);
    expect(claimNeedsSubcontractor(category({ name: "Manpower Claim" }))).toBe(false);
    expect(claimNeedsSubcontractor(category({ name: "abc claim" }))).toBe(false);
    expect(claimNeedsSubcontractor(undefined)).toBe(false);
  });

  it("the form stars 类型 and 分类, has no 「不选」 type, and the 分包商 when needed", () => {
    const parts = read("src/components/contractor-ops/package-claim-parts.tsx");
    expect(parts).toContain('<FieldWrapper label={t("claimInfo.kind")} required>');
    expect(parts).toContain('const CLAIM_KINDS: ClaimKindChoice[] = ["MATERIAL_ON_SITE", "PROGRESS"];');
    expect(parts).toContain("categoryRequired\n");
    expect(parts).toContain("subcontractorRequired={needsSub}");
    expect(parts).not.toContain('t("claimInfo.optional")');
    const engine = read("src/components/contractor-ops/claim-engine.tsx");
    expect(engine).toContain("required={general || categoryRequired}");
    expect(engine).toContain("required={subcontractorRequired}");
    // 「新建资料包」 and 「修改」 both wait for what is missing, and say what.
    const page = read("src/components/contractor-ops/multi-engine.tsx");
    expect(page).toContain("isClaim && Boolean(claimMissing)");
    expect(parts).toContain("disabled={save.isPending || Boolean(missing)}");
  });

  it("says it plainly in every language", () => {
    expect(zh.jb307b.required).toContain("Claim 类型和 Claim 分类必须填写");
    expect(zh.jb307b.subRequired).toContain("不需要结算");
    for (const messages of [en, ms, zhTW, zh]) {
      for (const key of [
        "package_claim_kind_required",
        "package_claim_category_required",
        "package_claim_subcontractor_required",
        "package_project_completes",
      ]) {
        expect((messages.errors.api as Record<string, string>)[key], key).toBeTruthy();
      }
      expect(Object.keys(messages.jb307b).sort()).toEqual(Object.keys(zh.jb307b).sort());
    }
  });
});

describe("JB307-4 head office approves, the project manager archives", () => {
  const approved = {
    id: "pkg-28",
    completed_at: null,
    completed_by_name: "",
    review_progress: "APPROVED",
    can_complete: false,
    completes_on_project: true,
  } as unknown as import("@/interfaces/contractor-ops").EvidencePackageDetail;

  it("head office reads who presses it, and has no button", () => {
    const html = render(<CompletePanel pkg={approved} onChanged={() => undefined} />);
    expect(text(html)).toContain("总部已审核批准。「确认完毕并归档」由项目经理去按");
    expect(html).not.toContain("data-package-complete=");
  });

  it("the project manager keeps the button", () => {
    const html = render(
      <CompletePanel pkg={{ ...approved, can_complete: true, completes_on_project: false }} onChanged={() => undefined} />,
    );
    expect(text(html)).toContain("确认完毕并归档");
    expect(html).toContain("data-package-complete");
  });
});

describe("JB307-5 【核对与结算】 on 全部类型 too", () => {
  it("shows on 全部类型 and Progress Claim, greyed with the reason for who may not", () => {
    const page = read("src/components/contractor-ops/multi-engine.tsx");
    expect(page).toContain('const settleWhere = isClaimTab || type === "";');
    expect(page).toContain("locked={settleLocked}");
    expect(page).toContain('writeParams({ type: "PROGRESS_CLAIM", settle: "checked" })');
    for (const reason of ["settleNoManage", "settleNoAmounts", "settleBothOff"]) expect(page).toContain(reason);
  });

  it("a locked button is there, greyed, and says why", () => {
    const html = render(
      <ReconcileSettleButton
        kind="CLAIM"
        step="check"
        permission="package.manage"
        locked={zh.jb307b.settleBothOff}
        onChecked={() => undefined}
        onSettled={() => undefined}
      />,
    );
    expect(text(html)).toContain("核对与结算");
    expect(html).toContain("disabled");
    expect(html).toContain("费用核对");
  });

  it("an allowed one opens the dialog as before", () => {
    const html = render(
      <ReconcileSettleButton kind="CLAIM" step="check" permission="package.manage" onChecked={() => undefined} onSettled={() => undefined} />,
    );
    expect(text(html)).toContain("核对与结算");
    expect(html).not.toContain("disabled=\"\"");
  });
});

describe("JB307-8 the recipient says 已完成（已归档） (and 已结算) once archived", () => {
  it("the recipient card adds the archived and settled words on COMPLETED", () => {
    const exchange = read("src/components/contractor-ops/package-exchange.tsx");
    expect(exchange).toContain('row.progress === "COMPLETED" && (');
    expect(exchange).toContain('<StatusBadge label={loop("stateCompleted")} tone="positive" />');
    expect(exchange).toContain('pkg.claim_settlement?.state === "SETTLED"');
    expect(zh.jb252.progress.COMPLETED).toBe("审核完成");
    expect(zh.jb252.stateCompleted).toBe("已完成（已归档）");
  });
});
