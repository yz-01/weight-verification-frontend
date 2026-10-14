/**
 * The package link's calls never carry the office's session (H17 六 1).
 *
 * A browser that is signed in to the office - the packer testing the link
 * they just made - must see exactly what the owner sees: the token is the
 * whole credential, so no Authorization header and no cookies go with it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import { whatsappHref } from "@/components/contractor-ops/package-exchange";
import {
  getPackageLink,
  reviewLinkItem,
  signPackageLink,
} from "@/services/package-link.service";

function answer(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("package link calls", () => {
  it("open the page with no session and say it is an open", async () => {
    const fetchMock = vi.fn(() => answer(200, { success: true, data: { package_no: "PKG-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getPackageLink("abc", { open: true, lang: "zh" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/package-link\/abc\/\?open=1&lang=zh$/);
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });

  it("send the typed name with a confirm and a signature", async () => {
    const fetchMock = vi.fn(() => answer(200, { success: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await reviewLinkItem("abc", { item: "i1", decision: "RETURNED", reason: "blurred", name: "Olive" });
    await signPackageLink("abc", "Olive");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)));
    expect(bodies[0]).toEqual({ item: "i1", decision: "RETURNED", reason: "blurred", name: "Olive" });
    expect(bodies[1]).toEqual({ name: "Olive" });
  });

  it("turn the server's 「找不到」 into an error with its code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => answer(404, { success: false, message: "Not found.", code: "package_link_not_found" })),
    );
    const failure = await getPackageLink("nope").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("package_link_not_found");
    expect((failure as ApiError).status).toBe(404);
  });
});

describe("用 WhatsApp 发送", () => {
  it("opens the chat of a number written internationally", () => {
    expect(whatsappHref("hi", "+60 12-345 6789")).toBe("https://wa.me/60123456789?text=hi");
    expect(whatsappHref("hi", "60123456789")).toBe("https://wa.me/60123456789?text=hi");
  });

  it("lets the person pick the contact for anything else, never guessing a country", () => {
    expect(whatsappHref("a b", "012-345 6789")).toBe("https://wa.me/?text=a%20b");
    expect(whatsappHref("a b", "owner@example.com")).toBe("https://wa.me/?text=a%20b");
  });
});
