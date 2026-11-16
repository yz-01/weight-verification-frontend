/**
 * JB208 (Lucas 11-16 audit), 账单与佣金:
 *
 * - JB208-6: the server refuses 关闭账单 once a payment is confirmed, so the
 *   menu item is greyed with its reason instead of pressed and refused.
 * - JB208-12: 发出账单 is a button of its own on a draft row; 收款管理 opens on
 *   待确认; the 已收款 report says 银行转账 / 已确认, not BANK_TRANSFER /
 *   CONFIRMED.
 *
 * Logic and source only: the runner has no DOM.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { paymentColumns } from "@/components/billing/financial-reports";
import { hasConfirmedPayment } from "@/components/billing/invoice-list";
import messages from "@/messages/zh.json";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("JB208 billing", () => {
  it("JB208-6: a confirmed payment greys 关闭账单 with its reason", () => {
    expect(hasConfirmedPayment({ amount_paid: "0.00" })).toBe(false);
    expect(hasConfirmedPayment({ amount_paid: "200.00" })).toBe(true);

    const code = source("src/components/billing/invoice-list.tsx");
    expect(code).toContain("disabled={hasConfirmedPayment(row.original)}");
    expect(code).toContain('t("close.paidReason")');
  });

  it("JB208-12: 发出账单 is a visible button on a draft row", () => {
    const code = source("src/components/billing/invoice-list.tsx");
    const cell = code.slice(code.indexOf('id: "actions"'));
    const button = cell.indexOf('row.original.state === "DRAFT" && <Button');
    const menu = cell.indexOf("<DropdownMenu>");
    expect(button).toBeGreaterThan(-1);
    // Outside the ⋮ menu, ahead of it.
    expect(menu).toBeGreaterThan(button);
  });

  it("JB208-12: 收款管理 and 付款凭证 open on 待确认", () => {
    const code = source("src/components/billing/payment-manager.tsx");
    expect(code).toContain('useState("PENDING")');
  });

  it("JB208-12: the 已收款 report words the method and the state", () => {
    const t = ((key: string) => {
      const value = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages.billing);
      return typeof value === "string" ? value : key;
    }) as unknown as Parameters<typeof paymentColumns>[0];
    const columns = paymentColumns(t);
    const method = columns.find((column) => column.key === "method");
    const state = columns.find((column) => column.key === "state");
    expect(method?.values?.BANK_TRANSFER).toBe(messages.billing.paymentMethod.BANK_TRANSFER);
    expect(state?.values?.CONFIRMED).toBe(messages.billing.paymentState.CONFIRMED);
    expect(state?.values?.PENDING).toBe(messages.billing.paymentState.PENDING);
  });
});
