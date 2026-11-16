/**
 * JB209 (Lucas 11-16 audit), partner management - B-P1-1, B-P2-1, B-P3-4,
 * X-2 and the Part B usability items on this page.
 *
 * - 「分配客户」 sends empty dates as null, reads the row's own dates and notes
 *   back when editing, and names its two date boxes (JB209-1).
 * - 续签 with no expiry sends `effective_to: null` (JB209-2).
 * - A rejected payout is closed: no 「处理」, a line saying so (JB209-15).
 * - Lists a hundred at a time with 「加载更多」; pickers read every page (JB209-14).
 * - 🗑 asks first; the 业绩统计 filter bar stays; the 阶梯 box shows an example and
 *   the server's complaint; every partner save says it went through, with a
 *   message that exists in all four languages (JB209-16).
 *
 * The runner has no DOM: rendered to static markup with the queries answered
 * from the cache, or read from the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PartnerAgreement, PartnerCommissionPayout } from "@/interfaces/partner";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ codes: new Set<string>(["partner.view", "partner.manage"]) }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-admin", company_type: null, is_platform_staff: true },
    can: (code: string) => reader.codes.has(code),
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PartnerManagementWorkspace, PAYOUT_NEXT_STATES, referralPayload } = await import(
  "@/components/partners/partner-management-workspace"
);

const SRC = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");
const workspace = read("components/partners/partner-management-workspace.tsx");
const service = read("services/partner.service.ts");
const words = zh.adminPartnerManagement;

function page<T>(results: T[], count = results.length) {
  return { pages: [{ count, page: 1, page_size: 100, total_pages: Math.ceil(count / 100), results }], pageParams: [1] };
}

const AGREEMENT = {
  id: "a-1", agreement_number: "PAG-0001", title: "2026", partner: { id: "p-1", code: "PART-0001", name: "Lim Install" },
  version: 1, effective_from: "2026-01-01", effective_to: null, commission_basis: "FIXED_PER_CUSTOMER", commission_rate: "100.00",
  payout_cycle: "MONTHLY", status: "ACTIVE", document_name: "a.pdf",
} as unknown as PartnerAgreement;

function payout(id: string, state: string): PartnerCommissionPayout {
  return {
    id, payout_code: `PCOM-${id}`, partner: { id: "p-1", code: "PART-0001", name: "Lim Install" }, period_start: "2026-10-01",
    period_end: "2026-10-31", new_customers: 1, saas_revenue: "100.00", platform_commission_revenue: "0.00", gross_amount: "100.00",
    net_amount: "100.00", state, payment_reference: "", payment_proof: null,
  } as unknown as PartnerCommissionPayout;
}

function renderSchemes(payouts: PartnerCommissionPayout[], count = payouts.length) {
  return renderDetail(<PartnerManagementWorkspace section="schemes" />, (client) => {
    client.setQueryData(["partner-agreements", "schemes", "paged"], page([AGREEMENT]));
    client.setQueryData(["partner-payouts", "paged"], page(payouts, count));
  });
}

describe("JB209-1 分配客户 (B-P1-1)", () => {
  it("sends empty dates as null and keeps filled ones", () => {
    const form = { partner_id: "p", company_id: "c", commission_start: "", commission_end: "", notes: "n" };
    expect(referralPayload(form)).toMatchObject({ commission_start: null, commission_end: null, notes: "n" });
    expect(referralPayload({ ...form, commission_start: "2026-11-01", commission_end: "2027-10-31" })).toMatchObject({
      commission_start: "2026-11-01",
      commission_end: "2027-10-31",
    });
  });

  it("sends the payload, not the raw form, both ways", () => {
    expect(workspace).toContain("row ? updateReferral(row.id, referralPayload(form)) : createReferral(referralPayload(form))");
  });

  it("reads the row's dates and notes back when editing", () => {
    expect(workspace).toContain('commission_start: row?.commission_start ?? ""');
    expect(workspace).toContain('commission_end: row?.commission_end ?? ""');
    expect(workspace).toContain('notes: row?.notes ?? ""');
  });

  it("names both date boxes and the notes", () => {
    expect(workspace).toContain('<FieldWrapper label={t("field.commissionStart")} hint={t("field.commissionStartHint")}>');
    expect(workspace).toContain('<FieldWrapper label={t("field.commissionEnd")} hint={t("field.commissionEndHint")}>');
    expect(workspace).not.toContain('placeholder={t("field.notes")}');
    expect(words.field.commissionStartHint).toBe("不填就从今天开始算");
  });
});

describe("JB209-2 续签 with no expiry (B-P2-1)", () => {
  it("sends null, not an empty string", () => {
    expect(workspace).toContain("renewAgreement(row.id, { effective_from: primary, effective_to: secondary || null })");
  });
});

describe("JB209-15 a rejected partner payout is closed (B-P3-4)", () => {
  it("has nowhere to go", () => {
    expect(PAYOUT_NEXT_STATES.REJECTED).toBeUndefined();
    expect(PAYOUT_NEXT_STATES.DRAFT).toEqual(["PENDING_APPROVAL"]);
    expect(PAYOUT_NEXT_STATES.PAID).toBeUndefined();
  });

  it("shows no 处理 on a rejected row, says why, and keeps 处理 on a draft", () => {
    const rejected = renderSchemes([payout("1", "REJECTED")]);
    expect(rejected).toContain(words.payout.rejectedClosed);
    expect(rejected).not.toContain(`>${words.action.process}<`);
    const draft = renderSchemes([payout("2", "DRAFT")]);
    expect(draft).toContain(`>${words.action.process}<`);
    expect(draft).not.toContain(words.payout.rejectedClosed);
  });
});

describe("JB209-14 lists past 100 rows (X-2)", () => {
  it("no list or picker asks for 200 any more", () => {
    expect(workspace).not.toMatch(/page_size:\s*200/);
    expect(service).not.toMatch(/page_size:\s*200/);
  });

  it("offers 加载更多 when the server holds more than is loaded", () => {
    const html = renderSchemes([payout("1", "DRAFT")], 150);
    expect(html).toContain(zh.pagedList.loadMore);
    expect(html).toContain("已显示 1 笔，共 150 笔");
  });

  it("does not when everything is loaded", () => {
    expect(renderSchemes([payout("1", "DRAFT")])).not.toContain(zh.pagedList.loadMore);
  });
});

describe("JB209-16 usability", () => {
  it("territory and type 🗑 ask first", () => {
    expect(workspace).not.toContain("onClick={() => remove.mutate(row.id)}");
    expect(workspace.match(/onClick=\{\(\) => setRemoving\(row\)\}/g)).toHaveLength(2);
    expect(workspace).toContain('title={t("remove.territoryTitle", { name: removing?.name ?? "" })}');
    expect(workspace).toContain('title={t("remove.typeTitle", { name: removing?.name ?? "" })}');
  });

  it("the 业绩统计 filter bar is always drawn", () => {
    expect(workspace).not.toContain("!rows.isLoading && !rows.isError && <FilterBar>");
    expect(workspace).toContain('<SectionListHeader section="performance" /><FilterBar>');
  });

  it("the 阶梯 box shows an example and the server's complaint", () => {
    expect(workspace).toContain(`TIERED: '{"tiers":[{"minimum":1,"rate":100}]}'`);
    expect(workspace).toContain('save.error.fieldError("calculation_config")');
    expect(words.field.calculationConfigExample).toContain("{example}");
  });

  it("every partner write says it went through", () => {
    for (const fn of [
      "createPartnerType", "updatePartnerType", "deletePartnerType", "createTerritory", "updateTerritory", "deleteTerritory",
      "createReferral", "updateReferral", "submitAgreement", "activateAgreement", "renewAgreement", "terminateAgreement",
      "adjustPartnerPayout", "transitionPartnerPayout",
    ]) {
      const start = service.indexOf(`export async function ${fn}(`);
      const end = service.indexOf("export ", start + 10);
      expect(service.slice(start, end === -1 ? undefined : end), fn).toContain("toastSuccess(");
    }
  });

  it("every toast the partner service names exists in all four languages", () => {
    const keys = [...service.matchAll(/toastSuccess\("([\w.]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(15);
    const lookup = (catalogue: unknown, key: string) =>
      key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalogue);
    for (const catalogue of [zh, zhTW, en, ms]) {
      for (const key of keys) expect(typeof lookup(catalogue, key), key).toBe("string");
    }
  });
});
