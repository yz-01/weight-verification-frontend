import type { Metadata, Viewport } from "next";
import { getLocale, getNow, getTimeZone } from "next-intl/server";
import localFont from "next/font/local";

import { AppProviders } from "@/components/providers/app-providers";
import { IntlProvider } from "@/components/providers/intl-provider";
import { resolveLocale } from "@/i18n/config";
import { BRANDING_BOOTSTRAP_SCRIPT } from "@/lib/branding";
import { FIELD_INSTALL_PROMPT_BOOTSTRAP_SCRIPT } from "@/lib/pwa-install";

import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/noto-sans-tc";
import "./globals.css";

/*
 * Typography (UI phase, Lucas 2026-10-07: 「成熟稳重」, not childish).
 *
 * - IBM Plex Sans: English and Malay. An engineering face with open shapes
 *   and clear tabular figures; it reads as a serious instrument rather than a
 *   friendly app, and it covers Malay's Latin fully.
 * - Noto Sans SC / Noto Sans TC (思源黑体): Chinese. Served as about a hundred
 *   small unicode-range slices, so a page downloads only the slices its
 *   characters need. Not preloaded: preloading would fetch slices a page may
 *   not use. TC is declared for every page but its files are only fetched
 *   where `lang="zh-TW"` puts it into the font stack (globals.css).
 * - Chakra Petch: the canvas's techy figure face, used ONLY for large KPI
 *   numbers on the dashboards and the HQ big screen (`.kpi-figure`).
 *
 * Weights are the ones the theme uses: 400 body, 500 labels, 600 titles, 700
 * figures.
 *
 * Nothing is fetched from Google, neither by the browser nor by the build.
 * next/font/google downloads at build time, and Google sometimes answers with
 * font URLs that carry `&skey=`, which Turbopack cannot resolve: production
 * builds failed on that twice (#43 on Plex, then #45 on Noto TC) with no code
 * change. So:
 * - Plex, Chakra Petch and Geist Mono are committed under ./fonts and loaded
 *   with next/font/local. Plex is IBM's own release (@ibm/plex-sans 1.1.0)
 *   cut to Latin, Latin Extended, Vietnamese and common symbols with every
 *   OpenType feature kept; its digits are tabular by default. Chakra Petch
 *   (600, 700) and Geist Mono (variable) are the Latin files from Fontsource.
 * - Noto Sans SC/TC come from the @fontsource-variable packages, imported as
 *   CSS above: one variable file set covers every weight, with the same
 *   unicode-range slicing Google uses. The families are named in globals.css
 *   (`--font-noto-sc`, `--font-noto-tc`).
 * All are OFL; each ./fonts folder carries its licence.
 */
const plexSans = localFont({
  variable: "--font-plex",
  src: [
    { path: "./fonts/ibm-plex-sans/IBMPlexSans-Regular.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-sans/IBMPlexSans-Medium.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-sans/IBMPlexSans-SemiBold.woff2", weight: "600" },
    { path: "./fonts/ibm-plex-sans/IBMPlexSans-Bold.woff2", weight: "700" },
  ],
  style: "normal",
  display: "swap",
});

const chakraPetch = localFont({
  variable: "--font-chakra",
  src: [
    { path: "./fonts/chakra-petch/ChakraPetch-SemiBold.woff2", weight: "600" },
    { path: "./fonts/chakra-petch/ChakraPetch-Bold.woff2", weight: "700" },
  ],
  style: "normal",
  display: "swap",
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  src: "./fonts/geist-mono/GeistMono-Variable.woff2",
  weight: "100 900",
  style: "normal",
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
  const locale = resolveLocale(await getLocale());
  const timeZone = await getTimeZone();
  const now = await getNow();
  const deploymentId =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    "development";

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${plexSans.variable} ${chakraPetch.variable} ${geistMono.variable} h-full antialiased`}
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
        {/* Translations are loaded by the browser, not written into every
            page (perf #7); see IntlProvider. */}
        <IntlProvider locale={locale} timeZone={timeZone} now={now}>
          <AppProviders deploymentId={deploymentId}>{children}</AppProviders>
        </IntlProvider>
      </body>
    </html>
  );
}
