import { afterEach, describe, expect, it, vi } from "vitest";

import { isSamePage, openOnSamePage } from "@/lib/same-page-link";

function fakeWindow(href: string) {
  const calls: { kind: string; state: unknown; path: string }[] = [];
  const location = new URL(href);
  vi.stubGlobal("window", {
    location,
    history: {
      state: { __NA: true, tree: [] },
      pushState: (state: unknown, _title: string, path: string) =>
        calls.push({ kind: "push", state, path }),
      replaceState: (state: unknown, _title: string, path: string) =>
        calls.push({ kind: "replace", state, path }),
    },
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("moving between tabs of the page already showing", () => {
  it("knows a query-only change is the same page", () => {
    fakeWindow("https://app.test/site-access");
    expect(isSamePage("/site-access?tab=gate")).toBe(true);
    expect(isSamePage("/site-access/")).toBe(false);
    expect(isSamePage("/permits")).toBe(false);
  });

  it("never hands Next.js its own router state back, or the page ignores the change", () => {
    const calls = fakeWindow("https://app.test/site-access");
    openOnSamePage("/site-access?tab=gate");
    openOnSamePage("/site-access?tab=devices", true);
    expect(calls).toEqual([
      { kind: "push", state: null, path: "/site-access?tab=gate" },
      { kind: "replace", state: null, path: "/site-access?tab=devices" },
    ]);
  });
});
