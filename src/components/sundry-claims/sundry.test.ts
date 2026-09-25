import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 杂费报销, the two ends (T-338, D-232, D-256).
 *
 * 「后台保留【确认】【拒绝】【沟通】；手机端不需要【确认】【拒绝】，但【沟通】必须
 * 继续保留」, and the voucher is finance's: 「付款凭证限财务／付款权限」.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const office = read("src/components/sundry-claims/sundry-claims-office.tsx");
const phoneForm = read("src/components/field-staff/sundry-claim-capture.tsx");
const phoneHistory = read("src/components/field-staff/my-submissions.tsx");

describe("the phone only asks and talks", () => {
  it("has no decision or payment actions", () => {
    for (const code of [phoneForm, phoneHistory]) {
      expect(code).not.toMatch(/reviewSundryClaim|confirmSundryClaimPaid|addSundryPaymentProof/);
    }
  });

  it("keeps the conversation and shows the payment result", () => {
    expect(phoneHistory).toMatch(/"SUNDRY_CLAIM",\n\]\);/);
    expect(phoneHistory).toMatch(/row\.kind === "SUNDRY_CLAIM" &&/);
    expect(phoneHistory).toMatch(/payment_proofs/);
  });
});

describe("the office decides; only finance pays", () => {
  it("confirm and reject sit behind the review permission, reject behind a switch", () => {
    expect(office).toMatch(/claim\.state === "SUBMITTED" && can\("sundry_claim\.review"\)/);
    expect(office).toMatch(/<Switch[\s\S]{0,200}setRejectArmed\(next\)/);
    expect(office).toMatch(/review\.mutate\("REJECTED"\)/);
  });

  it("the voucher and 【确认已付款】 sit behind the payment permission", () => {
    expect(office).toMatch(/!claim\.is_paid && can\("sundry_claim\.pay"\)/);
    expect(office).toMatch(/requires=\{\[\[claim\.payment_proofs\.length > 0/);
  });

  it("the record carries its own conversation", () => {
    expect(office).toMatch(/conversation=\{\{ kind: "SUNDRY_CLAIM", recordId: claim\.id \}\}/);
  });
});
