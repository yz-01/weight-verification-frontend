/**
 * The package link's page is public and private at once (H17 五 3, 六 5):
 * no sign-in in front of it, and on the way out the three headers - not
 * indexed, no referrer, no cache.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

describe("the package link through the proxy", () => {
  it("opens without a session and carries noindex, no-referrer, no-store", () => {
    const response = proxy(new NextRequest("https://trace.example/package/abc123"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("does not open the consultant's review page the same way", () => {
    const response = proxy(new NextRequest("https://trace.example/package-reviews"));
    expect(response.headers.get("location")).toContain("/login");
  });
});

describe("the worker's location link through the proxy (I20)", () => {
  it("opens without a session: the worker has no account", () => {
    const response = proxy(new NextRequest("https://trace.example/worker-location/abcdefghijklmnopqrstuvwxyz"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not open the office's roster without a session", () => {
    const response = proxy(new NextRequest("https://trace.example/site-workers"));
    expect(response.headers.get("location")).toContain("/login");
  });
});
