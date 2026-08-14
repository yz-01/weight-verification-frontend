import type { Branding } from "@/interfaces/auth";

const STANDARD_BRANDING_KEY = "mse_branding_standard";
const FIELD_BRANDING_KEY = "mse_branding_field";

export const BUILTIN_BRANDING: Branding = {
  name: "MSE Trace",
  short_name: "MSE Trace",
  company_id: null,
  company_name: null,
  company_logo_url: null,
  platform_icon_url: null,
  icon_url: null,
  uses_platform_default: true,
};

export function getCachedBranding(fieldSession = false): Branding | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(
      fieldSession ? FIELD_BRANDING_KEY : STANDARD_BRANDING_KEY,
    );
    return value ? (JSON.parse(value) as Branding) : null;
  } catch {
    return null;
  }
}

export function cacheBranding(
  branding: Branding,
  fieldSession = false,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    fieldSession ? FIELD_BRANDING_KEY : STANDARD_BRANDING_KEY,
    JSON.stringify(branding),
  );
}

export function brandingQuery(input?: {
  company?: string | null;
  bootstrap?: string | null;
  invitation?: string | null;
  revision?: string | null;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (input?.company) query.set("company", input.company);
  if (input?.bootstrap) query.set("bootstrap", input.bootstrap);
  if (input?.invitation) query.set("invitation", input.invitation);
  if (input?.revision) query.set("v", input.revision);
  return query;
}

export function iconPath(
  size: 32 | 180 | 192 | 512,
  input?: Parameters<typeof brandingQuery>[0],
): string {
  const query = brandingQuery(input);
  const suffix = query.toString();
  return `/brand-icon/${size}${suffix ? `?${suffix}` : ""}`;
}
