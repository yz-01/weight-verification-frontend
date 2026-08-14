import type { Metadata } from "next";

import { getPublicBranding } from "@/lib/branding-server";
import { iconPath } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicBranding();
  return {
    title: branding.name,
    applicationName: branding.name,
    icons: {
      icon: [
        {
          url: iconPath(32, { revision: branding.icon_url }),
          sizes: "32x32",
          type: "image/png",
        },
      ],
      apple: [
        {
          url: iconPath(180, { revision: branding.icon_url }),
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.short_name,
    },
  };
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
