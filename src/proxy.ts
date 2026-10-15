import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "mse_session";
const PORTAL_COOKIE = "mse_portal";

const LOGIN_BY_PORTAL = {
  MSE_ADMIN: "/admin/login",
  MSE_TRACE: "/trace/login",
  MSE_SCRAP: "/scrap/login",
} as const;

const AUTH_PREFIXES = [
  "/admin",
  "/trace",
  "/scrap",
  "/login",
  "/forgot-password",
  "/reset-password",
];
const PUBLIC_PREFIXES = [
  "/_next",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/field-manifest.webmanifest",
  "/brand-icon",
  "/field-pwa-bootstrap",
  "/sw.js",
  "/mse-icon.svg",
  "/mse-icon-192.png",
  "/mse-icon-512.png",
  "/offline",
  "/external",
  "/disposal-task",
  // A driver's link for one trip: no account, the token is the credential.
  "/driver-task",
  // A worker's location link (I20): no account, the token is the credential.
  "/worker-location",
  // A package's link for an owner, a supplier or anybody else (H17 五 3).
  "/package",
  "/delivery-note",
  "/field-staff",
  "/scan",
  "/verify",
];

/**
 * H17 六 5 on the package link's page: not indexed, the address never sent on
 * as a referrer, nothing kept in the browser's cache. The API answers carry
 * the same three.
 */
const PACKAGE_LINK_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, max-age=0",
} as const;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/package/")) {
    const response = NextResponse.next();
    for (const [name, value] of Object.entries(PACKAGE_LINK_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  }
  if (isPublicPath(pathname) || isAuthPath(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value === "1") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = loginPathFor(request.cookies.get(PORTAL_COOKIE)?.value);
  url.search = "";
  return NextResponse.redirect(url);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function loginPathFor(portal: string | undefined): string {
  if (
    portal === "MSE_ADMIN" ||
    portal === "MSE_TRACE" ||
    portal === "MSE_SCRAP"
  ) {
    return LOGIN_BY_PORTAL[portal];
  }
  return "/login";
}

export const config = {
  matcher: ["/((?!api).*)"],
};
