import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addressWithoutParams,
  dropFromAddress,
  isSamePage,
  openOnSamePage,
} from "@/lib/same-page-link";

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

/**
 * JB187 (客户 11-13): 「打开事项，然后按 X 一直会重新弹出来」. A system
 * notification opened 通知中心 at `?notice=<id>`, which went on to the record;
 * the record's X went back to `?notice=<id>`, which went on to the record
 * again. The address lets go of the parameter in the entry it has, at once.
 */
describe("an address that goes on to another lets go of what a link put in it", () => {
  it("takes the parameter out and keeps the rest", () => {
    expect(addressWithoutParams("/notifications?notice=n-1", ["notice"])).toBe("/notifications");
    expect(addressWithoutParams("/notifications?today=1&notice=n-1#top", ["notice"])).toBe(
      "/notifications?today=1#top",
    );
    expect(addressWithoutParams("/incoming?dispatch=d-1&state=RELEASED", ["dispatch"])).toBe(
      "/incoming?state=RELEASED",
    );
  });

  it("is null when the address does not carry it, so nothing is written", () => {
    expect(addressWithoutParams("/notifications?today=1", ["notice"])).toBeNull();
    const calls = fakeWindow("https://app.test/notifications?today=1");
    dropFromAddress(["notice"]);
    expect(calls).toEqual([]);
  });

  it("rewrites the entry it is in - never a new one - before it returns", () => {
    const calls = fakeWindow("https://app.test/notifications?notice=n-1");
    dropFromAddress(["notice"]);
    // `replace`, with a state that is not the router's own, so the App Router follows it.
    expect(calls).toEqual([{ kind: "replace", state: null, path: "/notifications" }]);
  });
});
