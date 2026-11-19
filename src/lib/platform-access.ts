/**
 * Who MSE's buttons are waiting for (JB220, 客户 11-18).
 *
 * The server decides; these only read what it already said, so a screen can
 * grey a button with its reason before the press instead of after it. When an
 * older server says nothing, nothing is greyed - the press is then answered
 * by the server's own refusal sentence.
 */
import type { CompanyPlatformAccess } from "@/interfaces/platform-access";

type Viewer = { is_platform_staff?: boolean } | null | undefined;

/**
 * An MSE account looking at a customer's account row while the customer has
 * not opened 「允许 MSE 管理账号」: its write buttons wait for the customer.
 * `company_accounts_open` is true for MSE's own staff, for a company still
 * onboarding and for an open window (contract §6).
 */
export function accountWritesClosed(viewer: Viewer, row: { company_accounts_open?: boolean } | null | undefined): boolean {
  return Boolean(viewer?.is_platform_staff) && row?.company_accounts_open === false;
}

/** The company has opened 「允许 MSE 查看」 right now; `null` when the server did not say. */
export function companyViewOpen(access: CompanyPlatformAccess | null | undefined): boolean | null {
  if (!access) return null;
  return Boolean(access.can_create_external_link || access.view_until);
}

/** MSE may set up or change this company's accounts right now; `null` when not said. */
export function companyAccountsOpen(access: CompanyPlatformAccess | null | undefined): boolean | null {
  if (!access) return null;
  return Boolean(access.accounts_onboarding || access.accounts_until);
}
