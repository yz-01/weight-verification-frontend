import { afterEach, describe, expect, it, vi } from "vitest";

import { inAppBrowserName, isInstalledApp } from "./in-app-browser";

/**
 * Whether the page is running inside a chat app.
 *
 * A field phone is linked by an id kept in the storage of the browser the
 * invitation was opened in. A chat app web view has its own storage, so
 * activating there links that view and nothing else - and the same phone,
 * opened later in Safari or from the home screen, is refused as a device the
 * server has never seen.
 *
 * The last test is the important one, and it asserts a limit rather than a
 * capability: WhatsApp cannot be detected, so the screen must not rely on
 * detection to say the thing that matters.
 */

const AGENTS = {
  facebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/468.0.0.42.107;FBBV/604450631]",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 334.0.3.28.104 (iPhone14,2; iOS 17_5)",
  wechat:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.49(0x18003132) NetType/WIFI",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Line/14.9.1",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

function pretend(userAgent: string, extras: Record<string, unknown> = {}) {
  vi.stubGlobal("navigator", { userAgent, ...extras });
  vi.stubGlobal("window", {
    navigator: { userAgent, ...extras },
    matchMedia: () => ({ matches: false }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("naming the app a link opened inside", () => {
  it.each([
    ["facebook", "Facebook"],
    ["instagram", "Instagram"],
    ["wechat", "WeChat"],
    ["line", "LINE"],
  ] as const)("recognises %s", (key, expected) => {
    pretend(AGENTS[key]);

    expect(inAppBrowserName()).toBe(expected);
  });

  it("says nothing for a real browser", () => {
    pretend(AGENTS.safari);

    expect(inAppBrowserName()).toBeNull();
  });

  it("does not mistake Android Chrome for a web view", () => {
    pretend(AGENTS.androidChrome);

    expect(inAppBrowserName()).toBeNull();
  });

  it("cannot see WhatsApp, which is why the warning is unconditional", () => {
    // WhatsApp does not identify its web view. On Android it hands links to a
    // Chrome Custom Tab that shares Chrome storage and is fine; on iOS it has
    // used both a shared Safari view and its own. There is no signal, so the
    // screen says the sentence to everybody and this only decides how loudly.
    pretend(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    );

    expect(inAppBrowserName()).toBeNull();
  });
});

describe("telling an installed app from a browser tab", () => {
  it("recognises the iOS home-screen app", () => {
    pretend(AGENTS.safari, { standalone: true });

    expect(isInstalledApp()).toBe(true);
  });

  it("recognises a standalone display mode", () => {
    vi.stubGlobal("navigator", { userAgent: AGENTS.androidChrome });
    vi.stubGlobal("window", {
      navigator: { userAgent: AGENTS.androidChrome },
      matchMedia: (query: string) => ({
        matches: query.includes("standalone"),
      }),
    });

    expect(isInstalledApp()).toBe(true);
  });

  it("is false in an ordinary tab", () => {
    pretend(AGENTS.safari);

    expect(isInstalledApp()).toBe(false);
  });
});
