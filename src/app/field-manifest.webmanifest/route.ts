import { NextResponse, type NextRequest } from "next/server";

import { iconPath } from "@/lib/branding";
import { getPublicBranding } from "@/lib/branding-server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { fieldManifestLocale, fieldManifestWords } from "@/lib/field-manifest-words";
import {
  FIELD_BOOTSTRAP_COOKIE,
  fieldManifestStartUrl,
  MANIFEST_TOKEN,
} from "@/lib/field-install";

export async function GET(request: NextRequest) {
  const search = new URL(request.url).searchParams;
  // A link with no hand-off falls back to the browser's own cookie copy (sent
  // only when the manifest link asks for credentials, or the browser sends
  // them anyway). The page itself is normally rendered with the token in the
  // link already - see the field layout.
  const cookieValue = request.cookies.get(FIELD_BOOTSTRAP_COOKIE)?.value ?? "";
  const cookieToken =
    !search.get("invitation") && MANIFEST_TOKEN.test(cookieValue) ? cookieValue : "";
  const value = search.get("bootstrap") ?? "";
  const token = MANIFEST_TOKEN.test(value) ? value : cookieToken;
  const invitationValue = search.get("invitation") ?? "";
  const invitation = MANIFEST_TOKEN.test(invitationValue) ? invitationValue : "";
  const branding = await getPublicBranding(
    token ? { bootstrap: token } : { invitation },
  );
  const startUrl = fieldManifestStartUrl(search, cookieToken);
  // The install name in the company's language (JB164): 「示范建筑有限公司 现场」,
  // not 「示范建筑有限公司 Field Staff」 on a Chinese company's phones.
  const words = await fieldManifestWords(
    branding.name,
    fieldManifestLocale({
      companyLanguage: (branding as { language?: string | null }).language,
      cookie: request.cookies.get(LOCALE_COOKIE)?.value,
      acceptLanguage: request.headers.get("accept-language"),
    }),
  );
  return NextResponse.json(
    {
      name: words.name,
      short_name: branding.short_name,
      id: branding.company_id
        ? `/field-staff/${branding.company_id}`
        : "/field-staff",
      description: words.description,
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      background_color: "#f3f6fa",
      theme_color: "#0e7490",
      orientation: "any",
      icons: [
        {
          src: iconPath(192, {
            bootstrap: token,
            revision: branding.icon_url,
          }),
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: iconPath(512, {
            bootstrap: token,
            revision: branding.icon_url,
          }),
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/manifest+json",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
