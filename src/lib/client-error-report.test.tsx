/**
 * The error screens report what crashed (Lucas 2026-10-22: a one-second error
 * on the first open of the home-screen app that nobody could read).
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_ERROR_ENDPOINT,
  MAX_REPORTS_PER_PAGE,
  SAME_ERROR_MS,
  buildClientErrorReport,
  clientErrorCode,
  clientErrorLine,
  redactAddress,
  reportClientError,
  resetClientErrorReporterForTests,
} from "@/lib/client-error-report";

const TOKEN = "jsC_VZY1C-xi_XN8xJQ4xiFkICa2tF3xRfZqTuRqMMqC4tUG1trVwQ";
const chunk = () =>
  Object.assign(new Error("Loading chunk 812 failed."), { name: "ChunkLoadError" });

beforeEach(() => {
  resetClientErrorReporterForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reportClientError", () => {
  it("posts one report to the log endpoint", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("{}")));
    expect(reportClientError(chunk(), { boundary: "global" }, { fetch, online: () => true })).toBe(true);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith(CLIENT_ERROR_ENDPOINT)).toBe(true);
    expect(init.credentials).toBe("omit");
    const body = JSON.parse(String(init.body));
    expect(body.name).toBe("ChunkLoadError");
    expect(body.boundary).toBe("global");
  });

  it("sends the same error once per window, and at most a few per page", async () => {
    let now = 1_000;
    const fetch = vi.fn(() => Promise.resolve(new Response("{}")));
    const deps = { fetch, online: () => true, now: () => now };
    expect(reportClientError(chunk(), { boundary: "app" }, deps)).toBe(true);
    expect(reportClientError(chunk(), { boundary: "app" }, deps)).toBe(false);
    now += SAME_ERROR_MS;
    expect(reportClientError(chunk(), { boundary: "app" }, deps)).toBe(true);
    for (let index = 0; index < 20; index += 1) {
      reportClientError(new Error(`different ${index}`), { boundary: "app" }, deps);
    }
    await flush();
    expect(fetch).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });

  it("sends nothing offline and never throws when the request fails", async () => {
    const offlineFetch = vi.fn();
    expect(
      reportClientError(chunk(), { boundary: "app" }, { fetch: offlineFetch, online: () => false }),
    ).toBe(false);
    expect(offlineFetch).not.toHaveBeenCalled();

    const rejecting = vi.fn(() => Promise.reject(new TypeError("Load failed")));
    expect(() =>
      reportClientError(chunk(), { boundary: "app" }, { fetch: rejecting, online: () => true }),
    ).not.toThrow();
    const throwing = vi.fn(() => {
      throw new TypeError("no fetch");
    });
    expect(() =>
      reportClientError(new Error("x"), { boundary: "app" }, { fetch: throwing, online: () => true }),
    ).not.toThrow();
    await flush();
    // A failed report is not retried: no loop.
    expect(rejecting).toHaveBeenCalledTimes(1);
    expect(throwing).toHaveBeenCalledTimes(1);
  });

  it("blanks credentials in the address", () => {
    expect(
      redactAddress(`https://app.example/field-pwa-bootstrap?token=${TOKEN}&next=%2Ffield-staff`),
    ).toBe("https://app.example/field-pwa-bootstrap?token=-&next=%2Ffield-staff");
    vi.stubGlobal("window", {
      location: { href: `https://app.example/field-staff?bootstrap=${TOKEN}` },
    });
    expect(buildClientErrorReport(chunk(), { boundary: "x" }).url).not.toContain(TOKEN);
  });
});

describe("the code on the screen", () => {
  it("is the digest when the server gave one, else a stable short hash", () => {
    expect(clientErrorCode({ digest: "1234567" })).toBe("1234567");
    expect(clientErrorCode(chunk())).toBe(clientErrorCode(chunk()));
    expect(clientErrorCode(chunk())).toMatch(/^E-[0-9A-Z]{7}$/);
    expect(clientErrorCode(new Error("other"))).not.toBe(clientErrorCode(chunk()));
  });

  it("shows the code and the first 80 characters of the message", () => {
    const line = clientErrorLine(new Error("x".repeat(200)));
    expect(line).toMatch(/^E-[0-9A-Z]{7} · x{80}$/);
  });

  it("is rendered under the friendly words, in the page's language", async () => {
    vi.stubGlobal("document", { documentElement: { lang: "zh" } });
    vi.stubGlobal("navigator", { language: "zh", userAgent: "test", onLine: true });
    const { RouteErrorScreen } = await import("@/components/shared/route-error");
    const html = renderToStaticMarkup(
      <RouteErrorScreen error={chunk()} boundary="app" />,
    );
    expect(html).toContain("页面打不开");
    expect(html).toContain("重新加载");
    expect(html).toContain(`错误代码: ${clientErrorCode(chunk())}`);
  });

  it("every place the field app can start has our screen, and so does the root", () => {
    for (const file of [
      "app/global-error.tsx",
      "app/error.tsx",
      "app/(auth)/error.tsx",
      "app/(field-staff)/error.tsx",
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, file).toMatch(/^"use client";/);
      expect(source, file).toMatch(/RouteErrorScreen/);
    }
  });
});
