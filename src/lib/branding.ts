import type { Branding } from "@/interfaces/auth";

export const STANDARD_BRANDING_KEY = "mse_branding_standard";
export const FIELD_BRANDING_KEY = "mse_branding_field";
export const DRIVER_BRANDING_KEY = "mse_branding_driver";

export const BUILTIN_BRANDING: Branding = {
  name: "MSE Trace",
  short_name: "MSE Trace",
  company_id: null,
  company_name: null,
  company_logo_url: null,
  platform_icon_url: null,
  icon_url: null,
  revision: null,
  uses_platform_default: true,
};

export function versionedBrandIconUrl(
  branding?: Branding | null,
  fallback = "/mse-icon-192.png",
  size: 32 | 180 | 192 | 512 = 192,
): string {
  const source = branding?.icon_url || fallback;
  if (!branding?.revision || !branding.icon_url) return source;
  const query = brandingQuery({
    company: branding.company_id,
    brand: branding.revision,
  });
  return `/brand-icon/${size}?${query}`;
}

/**
 * Runs before React hydrates so a returning browser never waits for /auth/me
 * before showing the correct tenant title and favicon.
 */
export const BRANDING_BOOTSTRAP_SCRIPT = `(()=>{try{const p=location.pathname;const f=p.startsWith('/field-staff')||p.startsWith('/trace/field-')||p.startsWith('/field-pwa-bootstrap');const d=p==='/driver'||p.startsWith('/driver/');const key=f?'${FIELD_BRANDING_KEY}':d?'${DRIVER_BRANDING_KEY}':'${STANDARD_BRANDING_KEY}';const raw=localStorage.getItem(key);const b=raw?JSON.parse(raw):{name:'MSE Trace',icon_url:'/mse-icon-192.png',revision:null,company_id:null};if(typeof b.name==='string'&&b.name.trim())document.title=b.name.trim();let u;if(typeof b.revision==='string'&&b.revision&&typeof b.icon_url==='string'&&b.icon_url){u=new URL('/brand-icon/192',location.origin);if(typeof b.company_id==='string'&&b.company_id)u.searchParams.set('company',b.company_id);u.searchParams.set('brand',b.revision)}else if(typeof b.icon_url==='string'&&b.icon_url){u=new URL(b.icon_url,location.origin)}else{return}if(u.protocol!=='http:'&&u.protocol!=='https:')return;for(const rel of ['icon','apple-touch-icon']){const l=document.head.querySelector('link[data-mse-branding="'+rel+'"]');if(!l)continue;l.href=u.href}}catch{}})();`;

export function getCachedBranding(
  fieldSession = false,
  driverSession = false,
): Branding | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(
      fieldSession
        ? FIELD_BRANDING_KEY
        : driverSession
          ? DRIVER_BRANDING_KEY
          : STANDARD_BRANDING_KEY,
    );
    return value ? (JSON.parse(value) as Branding) : null;
  } catch {
    return null;
  }
}

export function cacheBranding(
  branding: Branding,
  fieldSession = false,
  driverSession = false,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    fieldSession
      ? FIELD_BRANDING_KEY
      : driverSession
        ? DRIVER_BRANDING_KEY
        : STANDARD_BRANDING_KEY,
    JSON.stringify(branding),
  );
}

/** Remove only branding that an older Driver login wrote into the console slot. */
export function clearStandardBrandingForCompany(companyId: string | null): void {
  if (typeof window === "undefined" || !companyId) return;
  const cached = getCachedBranding();
  if (cached?.company_id === companyId) {
    window.localStorage.removeItem(STANDARD_BRANDING_KEY);
  }
}

export function brandingQuery(input?: {
  company?: string | null;
  bootstrap?: string | null;
  invitation?: string | null;
  revision?: string | null;
  brand?: string | null;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (input?.company) query.set("company", input.company);
  if (input?.bootstrap) query.set("bootstrap", input.bootstrap);
  if (input?.invitation) query.set("invitation", input.invitation);
  if (input?.revision) query.set("v", input.revision);
  if (input?.brand) query.set("brand", input.brand);
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
