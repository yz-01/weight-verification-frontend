import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

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
  manifest: "/manifest.webmanifest",
  icons: {
    // Keep the initial document entirely local. Tenant branding is applied
    // from the cached/session profile after hydration without delaying routes.
    icon: [{ url: "/mse-icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/mse-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
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
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    "development";

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <AppProviders deploymentId={deploymentId}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
