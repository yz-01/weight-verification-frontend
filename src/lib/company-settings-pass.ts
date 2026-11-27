/**
 * 公司设置 behind the six-digit sign-off PIN (JB239, 客户 11-23 事项 11 第 1 点:
 * 「点击「公司设置」时，必须先输入六位数签核密码，验证成功才能进入」).
 *
 * The server refuses every 公司设置 read and write without a pass
 * (`company_settings_pin_required`). The page's gate (`CompanySettingsGate`)
 * asks for the PIN in the shared dialog, the server hands back a pass, and it
 * is kept HERE, in memory only - never in storage - and sent by the API
 * client as `X-Company-Settings-Pass`. Leaving the page drops it
 * (`clearCompanySettingsPass`), so coming back asks again.
 *
 * The server takes a pass for 30 minutes. When it runs out while the page is
 * open, the API client asks the gate's renewer for a new one (the PIN dialog
 * again) and sends the same request once more - a half-typed form is not lost.
 */

export const COMPANY_SETTINGS_PIN_REQUIRED = "company_settings_pin_required";
export const COMPANY_SETTINGS_PASS_HEADER = "X-Company-Settings-Pass";

let current: string | null = null;
/** `true` when a new pass was got, `false` when not (dialog closed, failed). */
type Renew = () => Promise<boolean>;
let renewer: Renew | null = null;
let renewing: Promise<boolean> | null = null;

export function companySettingsPass(): string | null {
  return current;
}

export function setCompanySettingsPass(pass: string | null): void {
  current = pass || null;
}

export function clearCompanySettingsPass(): void {
  current = null;
}

/** The gate registers how to get a new pass; the returned function unregisters it. */
export function registerCompanySettingsRenewer(renew: Renew): () => void {
  renewer = renew;
  return () => {
    if (renewer === renew) renewer = null;
  };
}

/**
 * A pass refused (expired, or the PIN changed): get a new one through the
 * gate. Several refused calls at once share one PIN dialog. `false` when no
 * gate is mounted (the page was left) or the person closed the dialog.
 */
export function renewCompanySettingsPass(): Promise<boolean> {
  current = null;
  const renew = renewer;
  if (!renew) return Promise.resolve(false);
  if (!renewing) {
    renewing = renew()
      .catch(() => false)
      .finally(() => {
        renewing = null;
      });
  }
  return renewing;
}

/** A test's way back to nothing held. */
export function resetCompanySettingsPassForTests(): void {
  current = null;
  renewer = null;
  renewing = null;
}
