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
  "/field-pwa-bootstrap",
  "/sw.js",
  "/mse-icon",
  "/offline",
  "/external",
  "/field-staff",
  "/scan",
  "/verify",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
