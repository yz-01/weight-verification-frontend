import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { BRANDING_BOOTSTRAP_SCRIPT } from "@/lib/branding";
import { FIELD_INSTALL_PROMPT_BOOTSTRAP_SCRIPT } from "@/lib/pwa-install";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    { media: "(prefers-color-scheme: light)", color: "#087f8c" },
    { media: "(prefers-color-scheme: dark)", color: "#111a20" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
