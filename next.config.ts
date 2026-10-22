import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isTypeGeneration = process.env.npm_lifecycle_event === "typecheck";
const deploymentId =
  (
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA
  )?.slice(0, 32);

if (process.env.NODE_ENV === "production" && !isTypeGeneration) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for a production build.",
    );
  }

  const apiUrl = new URL(apiBaseUrl);
  if (
    apiUrl.protocol !== "https:" ||
    ["127.0.0.1", "localhost", "::1"].includes(apiUrl.hostname)
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must use a public HTTPS origin in production.",
    );
  }
}

/**
 * Next streams `generateMetadata` output and, when it resolves after the
 * <head> was sent, appends the tags to <body>. iPhone Safari only looks in
 * <head> for `rel="manifest"` (WebKit `DocumentLoader::loadApplicationManifest`
 * walks the head's children) and for the apple-touch-icon, so a field page
 * whose metadata waited on a fetch (the ready page's branding) installed
 * without its token-carrying manifest. iPhones therefore get blocking
 * metadata, like the crawlers in Next's own default list (copied from
 * next/dist/shared/lib/router/utils/html-bots.js, Next 16.2) - Lucas
 * 2026-10-23.
 */
const NEXT_DEFAULT_HTML_LIMITED_BOTS =
  "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight";
const HTML_LIMITED_BOTS = new RegExp(
  `${NEXT_DEFAULT_HTML_LIMITED_BOTS}|iPhone|iPad|iPod`,
  "i",
);

const nextConfig: NextConfig = {
  htmlLimitedBots: HTML_LIMITED_BOTS,
  // A browser can remain open while Vercel promotes a newer build. Mark every
  // production build so Next.js can detect that version skew and fall back to
  // a full navigation instead of leaving a menu click on the old page.
  deploymentId,
  // This repository is not a workspace. Pinning the root prevents a stray
  // lockfile in a parent directory from changing module resolution locally.
  turbopack: {
    root: process.cwd(),
  },
  // Evidence photos, CCTV stills and weigh tickets are served from the API's
  // media host. Listing hosts explicitly keeps next/image from becoming an
  // open proxy for arbitrary remote URLs.
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8002",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8002",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "ap-south-1.linodeobjects.com",
        pathname: "/weight-verification/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
