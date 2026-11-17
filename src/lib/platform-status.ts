/**
 * What the public branding answer says about the platform itself (JB211,
 * Lucas 11-16 「把它们真的做出来」): the 11.2.11 维护 notice and MSE's 11.2.1
 * 联络资料. Read before anybody signs in, so the sign-in page can say it too.
 */

export interface PlatformMaintenance {
  /** Customers are kept out right now. */
  active: boolean;
  /** 维护模式 is on and its start is still ahead. */
  upcoming: boolean;
  /** 服务可用 is off: kept out until it is switched back on. */
  service_stopped: boolean;
  starts_at: string | null;
  ends_at: string | null;
  /** 维护通知, MSE's own words, shown as written. */
  notice: string;
}

export interface PlatformContact {
  company_name: string;
  registration_no: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export interface PlatformStatus {
  maintenance: PlatformMaintenance | null;
  contact: PlatformContact | null;
}

/** Shown on the sign-in page and on every signed-in page while true. */
export function showsMaintenanceBanner(maintenance?: PlatformMaintenance | null): boolean {
  return Boolean(maintenance && (maintenance.active || maintenance.upcoming));
}

/** Which sentence describes the window: `maintenance.window.<this>`. */
export type MaintenanceWindowWording = "stopped" | "between" | "from" | "until" | "open";

export function maintenanceWindowWording(maintenance: PlatformMaintenance): MaintenanceWindowWording {
  if (maintenance.service_stopped) return "stopped";
  if (maintenance.starts_at && maintenance.ends_at) return "between";
  if (maintenance.starts_at) return "from";
  if (maintenance.ends_at) return "until";
  return "open";
}

export interface ContactLine {
  kind: "phone" | "email" | "website";
  value: string;
  href: string;
}

/** The ways to reach MSE that were filled in; a blank one is simply left out. */
export function contactLines(contact?: PlatformContact | null): ContactLine[] {
  if (!contact) return [];
  const lines: ContactLine[] = [];
  const phone = contact.phone?.trim();
  if (phone) lines.push({ kind: "phone", value: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  const email = contact.email?.trim();
  if (email) lines.push({ kind: "email", value: email, href: `mailto:${email}` });
  const website = contact.website?.trim();
  if (website) {
    const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    lines.push({ kind: "website", value: website, href });
  }
  return lines;
}

/** The issuer on a customer's bill (开票方): name, SSM number, address. */
export interface IssuerLines {
  name: string;
  registrationNo: string;
  address: string;
}

export function issuerLines(
  contact?: PlatformContact | null,
  platformName = "",
): IssuerLines | null {
  const name = contact?.company_name?.trim() || platformName.trim();
  const registrationNo = contact?.registration_no?.trim() ?? "";
  const address = contact?.address?.trim() ?? "";
  if (!contact?.company_name?.trim() && !registrationNo && !address) return null;
  return { name, registrationNo, address };
}
