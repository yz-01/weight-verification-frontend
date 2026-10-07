import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import {
  Chakra_Petch,
  Geist_Mono,
  IBM_Plex_Sans,
  Noto_Sans_SC,
  Noto_Sans_TC,
} from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { BRANDING_BOOTSTRAP_SCRIPT } from "@/lib/branding";
import { FIELD_INSTALL_PROMPT_BOOTSTRAP_SCRIPT } from "@/lib/pwa-install";

import "./globals.css";

/*
 * Typography (UI phase, Lucas 2026-10-07: 「成熟稳重」, not childish).
 *
 * - IBM Plex Sans: English and Malay. An engineering face with open shapes
 *   and clear tabular figures; it reads as a serious instrument rather than a
 *   friendly app, and it covers Malay's Latin fully.
 * - Noto Sans SC / Noto Sans TC (思源黑体): Chinese. Google serves CJK fonts as
 *   about a hundred small unicode-range slices, so a page downloads only the
 *   slices its characters need. Not preloaded: preloading would fetch slices
 *   a page may not use. TC is declared for every page but its files are only
 *   fetched where `lang="zh-TW"` puts it into the font stack (globals.css).
 * - Chakra Petch: the canvas's techy figure face, used ONLY for large KPI
 *   numbers on the dashboards and the HQ big screen (`.kpi-figure`).
 *
 * All are self-hosted by next/font at build time; nothing is fetched from
 * Google by the browser. Weights are the ones the theme uses: 400 body, 500
 * labels, 600 titles, 700 figures.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["Microsoft YaHei", "PingFang SC", "sans-serif"],
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["Microsoft JhengHei", "PingFang TC", "sans-serif"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "MSE Trace",
  description: "Verified weight and traceable waste for construction and recycling.",
  applicationName: "MSE Trace",
  // Declared here rather than as a literal <link> in <head> below, because a
  // browser installs the **first** `rel="manifest"` it finds and ignores the
  // rest. A literal tag here always won, so the field portal's own manifest -
  // rendered second by route metadata - was never the one installed, and the
  // installed app started at "/" and landed on the portal chooser instead of
  // the worker's screen (F-172). Route metadata replaces this value rather
  // than adding to it, so every page carries exactly one.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MSE Trace",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#060b16" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read from the locale cookie rather than a URL segment. Language is a
  // property of the account, so it must not appear in any shareable link.
  const locale = await getLocale();
  const deploymentId =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    "development";

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${plexSans.variable} ${notoSansSC.variable} ${notoSansTC.variable} ${chakraPetch.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="icon"
          href="/mse-icon-192.png"
          sizes="any"
          data-mse-branding="icon"
        />
        <link
          rel="apple-touch-icon"
          href="/mse-icon-192.png"
          sizes="180x180"
          data-mse-branding="apple-touch-icon"
        />
      </head>
      <body className="flex min-h-full flex-col">
        <script
          data-mse-field-install-bootstrap
          dangerouslySetInnerHTML={{ __html: FIELD_INSTALL_PROMPT_BOOTSTRAP_SCRIPT }}
        />
        <script
          data-mse-branding-bootstrap
          dangerouslySetInnerHTML={{ __html: BRANDING_BOOTSTRAP_SCRIPT }}
        />
        <NextIntlClientProvider>
          <AppProviders deploymentId={deploymentId}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
