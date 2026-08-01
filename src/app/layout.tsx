import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono, Noto_Sans_SC } from "next/font/google";

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

// Geist carries no CJK glyphs, so a Chinese user would fall through to
// whatever the operating system happens to supply and the interface would
// change shape between machines. Loading a CJK face keeps it consistent.
const notoSansSC = Noto_Sans_SC({
  variable: "--font-cjk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MSE Trace",
  description: "Verified weight and traceable waste for construction and recycling.",
  applicationName: "MSE Trace",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/mse-icon.svg", type: "image/svg+xml" },
      { url: "/mse-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/mse-icon-192.png", sizes: "192x192" }],
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

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansSC.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
