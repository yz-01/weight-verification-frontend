/**
 * JB309 group D (客户 11-28l 第 1、3 点): a subcontractor's Progress Claim.
 *
 * 1. 「建立分包商 Progress Claim 时，以下资料必须填写：所属项目、分包商、施工分类、实际施工
 *    日期范围、Claim 申请期数、分包商工程款申请编号（Claim No.）、申请金额。」
 * 3. 「同一个项目及分包商的 Claim No. 不得重复建立有效工程款申请。再次建立相同期数或施工
 *    日期范围的申请时，系统必须显示历史申请、批准金额、结算金额及关联资料包编号，供审批
 *    人员核对。」
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
import type { EvidencePackageDetail, PackageClaimHistory } from "@/interfaces/contractor-ops";
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

const parts = await import("@/components/contractor-ops/package-claim-parts");
const { ClaimHistoryPanel, ClaimInfoBlock, EMPTY_CLAIM_INFO, claimInfoPayload, claimInfoValue, workDatesReversed } =
  parts;

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

/** The client's PKG-PRJ-0003-028 (图 1): ABC Con, 2026-11, approved and settled at RM 200,000. */
const pkg028 = {
  id: "pkg-28",
  package_no: "PKG-PRJ-0003-028",
  name: "subcon claim",
  ref_no: "ABC-028",
  period: "2026-11-01",
  work_from: "2026-11-01",
  work_to: "2026-11-25",
  phase_name: "Piling",
  state: "CONFIRMED",
  review_progress: "COMPLETED",
  completed_at: "2026-11-28T04:00:00Z",
  claim_amount: "200000.00",
  approved_amount: "200000.00",
  checked_amount: "200000.00",
  settled_amount: "200000.00",
  settle_state: "SETTLED",
  check_no: "CL-RC001",
  settlement_no: "CL-ST001",
  same_period: true,
  dates_overlap: true,
} as const;

const history: PackageClaimHistory = { rows: [{ ...pkg028 }], amounts_locked: false };

describe("JB309-1 the application's fields", () => {
  it("sends the four new fields for a subcontractor's claim, blanks for another", () => {
    const value = {
      ...EMPTY_CLAIM_INFO,
      period: "2026-11",
      kind: "PROGRESS" as const,
      phase: "ph-1",
      workFrom: "2026-11-01",
      workTo: "2026-11-25",
      refNo: "  ABC-029 ",
    };
    expect(claimInfoPayload(value)).toMatchObject({
      claim_period: "2026-11",
      claim_phase: "ph-1",
      claim_work_from: "2026-11-01",
      claim_work_to: "2026-11-25",
      claim_ref_no: "ABC-029",
    });
    expect(claimInfoPayload(value, false)).toMatchObject({
      claim_phase: "",
      claim_work_from: "",
      claim_work_to: "",
      claim_ref_no: "",
    });
    expect(workDatesReversed({ workFrom: "2026-11-26", workTo: "2026-11-25" })).toBe(true);
    expect(workDatesReversed({ workFrom: "2026-11-01", workTo: "2026-11-25" })).toBe(false);
    expect(workDatesReversed({ workFrom: "", workTo: "2026-11-25" })).toBe(false);
  });

  it("reads them back from a package", () => {
    const value = claimInfoValue({
      claim_other_name: "",
      claim_info: {
        claim_id: null,
        claim_no: "",
        period: "2026-11-01",
        kind: "PROGRESS",
        category: "c-1",
        category_name: "Subcontractor Claim",
        subcontractor: "s-1",
        subcontractor_name: "ABC Con",
        phase: "ph-1",
        phase_name: "Piling",
        work_from: "2026-11-01",
        work_to: "2026-11-25",
        ref_no: "ABC-028",
      },
    });
    expect(value).toMatchObject({ period: "2026-11", phase: "ph-1", workFrom: "2026-11-01", workTo: "2026-11-25", refNo: "ABC-028" });
  });

  it("the form stars and asks for every field, in the client's order, the amount too", () => {
    const source = read("src/components/contractor-ops/package-claim-parts.tsx");
    expect(source).toContain('<FieldWrapper label={t("claimInfo.period")} required={needsSub}>');
    expect(source).toContain('<FieldWrapper label={words("phase")} required hint={words("phaseHint")}>');
    expect(source).toContain('<FieldWrapper label={words("workDates")} required>');
    expect(source).toContain('<FieldWrapper label={words("refNo")} required hint={words("refNoHint")}>');
    const order = ['jb309("phase")', 'jb309("workDates")', 't("claimInfo.period")', 'jb309("refNo")', 'jb309("amount")'];
    const missing = source.slice(source.indexOf("export function useClaimInfoMissing"));
    const at = order.map((key) => missing.indexOf(`missing.push(${key})`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const page = read("src/components/contractor-ops/multi-engine.tsx");
    expect(page).toContain("useClaimInfoReason(project, claimInfo, claimAmount)");
    expect(page).toContain("required={isClaim && application}");
    expect(page).toContain("claimInfoPayload(claimInfo, application)");
  });

  it("the package window shows the new fields", () => {
    const pkg = {
      id: "pkg-29",
      project: "p-1",
      package_type: "PROGRESS_CLAIM",
      claim_other_name: "",
      claim_amount: "56000.00",
      claim_info: {
        claim_id: null,
        claim_no: "",
        period: "2026-11-01",
        kind: "PROGRESS",
        category: "c-1",
        category_name: "Subcontractor Claim",
        subcontractor: "s-1",
        subcontractor_name: "ABC Con",
        phase: "ph-1",
        phase_name: "Piling",
        work_from: "2026-11-01",
        work_to: "2026-11-25",
        ref_no: "ABC-029",
      },
      claim_history: history,
    } as unknown as EvidencePackageDetail;
    const shown = text(render(<ClaimInfoBlock pkg={pkg} canEdit={false} onChanged={() => undefined} />));
    expect(shown).toContain("施工分类 Piling");
    expect(shown).toContain("实际施工日期范围");
    expect(shown).toContain("分包商工程款申请编号（Claim No.） ABC-029");
    // ...and 028 beside it for the reviewers.
    expect(shown).toContain("历史申请");
    expect(shown).toContain("PKG-PRJ-0003-028");
  });
});

describe("JB309-3 「历史申请」", () => {
  it("lists the other application with its amounts, numbers and state", () => {
    const shown = text(render(<ClaimHistoryPanel history={history} variant="window" />));
    expect(shown).toContain("PKG-PRJ-0003-028");
    expect(shown).toContain("Claim No. ABC-028");
    expect(shown).toContain("期数相同");
    expect(shown).toContain("施工日期重叠");
    expect(shown).toContain("期数 2026-11");
    expect(shown).toContain("批准金额 RM 200,000.00");
    expect(shown).toContain("结算金额 RM 200,000.00");
    expect(shown).toContain("已结算");
    expect(shown).toContain("CL-RC001");
    expect(shown).toContain("CL-ST001");
  });

  it("shows no amount without 「金额查看」", () => {
    const locked: PackageClaimHistory = {
      amounts_locked: true,
      rows: [{ ...pkg028, claim_amount: null, approved_amount: null, checked_amount: null, settled_amount: null }],
    };
    const shown = text(render(<ClaimHistoryPanel history={locked} variant="window" />));
    expect(shown).toContain("你的「金额查看」已关闭");
    expect(shown).not.toContain("RM ");
    expect(shown).toContain("PKG-PRJ-0003-028");
  });

  it("says a draft is a draft; the form says nothing when there is nothing", () => {
    const draft: PackageClaimHistory = {
      amounts_locked: false,
      rows: [{ ...pkg028, state: "DRAFT", review_progress: "NOT_SENT", settle_state: "WAITING", settled_amount: null }],
    };
    expect(text(render(<ClaimHistoryPanel history={draft} variant="form" />))).toContain("草稿 · 待归档");
    expect(render(<ClaimHistoryPanel history={{ rows: [], amounts_locked: false }} variant="form" />)).toBe("");
    expect(text(render(<ClaimHistoryPanel history={{ rows: [], amounts_locked: false }} variant="window" />))).toContain(
      "没有期数相同或施工日期重叠的申请",
    );
  });

  it("a row opens that package in the window", () => {
    const html = render(<ClaimHistoryPanel history={history} variant="window" onOpenPackage={() => undefined} />);
    expect(html).toMatch(/<button[^>]*>PKG-PRJ-0003-028<\/button>/);
    const page = read("src/components/contractor-ops/multi-engine.tsx");
    expect(page).toContain("onOpenPackage={onOpenPackage}");
  });
});

describe("JB309 words in every language", () => {
  it("has the refusals and the screen words", () => {
    for (const messages of [en, ms, zhTW, zh]) {
      for (const key of [
        "package_claim_phase_required",
        "package_claim_work_dates_required",
        "package_claim_work_dates_order",
        "package_claim_period_required",
        "package_claim_ref_no_required",
        "package_claim_amount_required",
        "package_claim_ref_no_taken",
      ]) {
        expect((messages.errors.api as Record<string, string>)[key], key).toBeTruthy();
      }
      expect((messages.errors.api as Record<string, string>).package_claim_ref_no_taken).toContain("{package_no}");
      expect(Object.keys(messages.jb309d).sort()).toEqual(Object.keys(zh.jb309d).sort());
      expect(Object.keys(messages.jb309d.history).sort()).toEqual(Object.keys(zh.jb309d.history).sort());
    }
  });
});
