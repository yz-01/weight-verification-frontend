/**
 * Which of MSE's buttons wait for the customer (JB220, contract §6): only an
 * MSE account, only a customer's account row the server marks closed. MSE's own
 * staff, a company still onboarding and an open 「允许 MSE 管理账号」 come back
 * `company_accounts_open: true`; an older server that says nothing greys nothing.
 */
import { describe, expect, it } from "vitest";

import { accountWritesClosed, companyAccountsOpen, companyViewOpen } from "@/lib/platform-access";

const MSE = { is_platform_staff: true };
const CUSTOMER = { is_platform_staff: false };

describe("an account row's write buttons", () => {
  it("wait for the customer only when MSE looks at a closed customer's account", () => {
    expect(accountWritesClosed(MSE, { company_accounts_open: false })).toBe(true);
  });

  it("work for MSE's own staff, an onboarding company and an open window", () => {
    expect(accountWritesClosed(MSE, { company_accounts_open: true })).toBe(false);
  });

  it("never wait for a customer's own administrator, and never on an older server", () => {
    expect(accountWritesClosed(CUSTOMER, { company_accounts_open: false })).toBe(false);
    expect(accountWritesClosed(MSE, {})).toBe(false);
    expect(accountWritesClosed(null, { company_accounts_open: false })).toBe(false);
    expect(accountWritesClosed(MSE, undefined)).toBe(false);
  });
});

describe("a company's doors, from the directory row", () => {
  const SHUT = { view_until: null, accounts_until: null, accounts_onboarding: false, can_create_external_link: false };

  it("reads 查看 open from the server's own word", () => {
    expect(companyViewOpen(SHUT)).toBe(false);
    expect(companyViewOpen({ ...SHUT, view_until: "2026-11-19T15:00:00+08:00", can_create_external_link: true })).toBe(true);
    expect(companyViewOpen(undefined)).toBeNull();
  });

  it("reads accounts open while onboarding or within the window", () => {
    expect(companyAccountsOpen(SHUT)).toBe(false);
    expect(companyAccountsOpen({ ...SHUT, accounts_onboarding: true })).toBe(true);
    expect(companyAccountsOpen({ ...SHUT, accounts_until: "2026-11-19T15:00:00+08:00" })).toBe(true);
    expect(companyAccountsOpen(null)).toBeNull();
  });
});
