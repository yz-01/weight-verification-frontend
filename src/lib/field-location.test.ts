import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LocationRefused,
  isIos,
  locationHelpTarget,
  problemOf,
  requestLocation,
} from "./field-location";

/**
 * Which instructions a phone gets, and which kind of "no" it gave.
 *
 * Both matter for the same reason: a worker who is refused location sees one
 * set of steps, and steps for the wrong phone are worse than none - they send
 * somebody hunting through a Settings screen that does not exist on their
 * device, and the next thing they do is give up.
 *
 * The user agents below are real ones, kept verbatim. Sniffing a user agent is
 * unpleasant but there is no alternative here: no API reports which Settings
 * app the person in front of you is holding.
 */

const AGENTS = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

function pretendDevice(userAgent: string, maxTouchPoints = 5) {
  vi.stubGlobal("navigator", {
    userAgent,
    maxTouchPoints,
    geolocation: (globalThis.navigator as Navigator | undefined)?.geolocation,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which instructions a device gets", () => {
  it("sends an iPhone on Safari to the Safari page menu", () => {
    pretendDevice(AGENTS.iphoneSafari);

    expect(locationHelpTarget()).toBe("iosSafari");
  });

  it("keeps Chrome on iOS apart from Safari", () => {
    // Both are WebKit, but they hold separate entries under Location Services
    // and only Safari has the page menu that undoes a per-site refusal.
    pretendDevice(AGENTS.iphoneChrome);

    expect(locationHelpTarget()).toBe("iosOtherBrowser");
  });

  it("recognises an iPad that calls itself a Mac", () => {
    // iPadOS reports a desktop Safari user agent; the touch points are the
    // only thing that gives it away, and getting this wrong sends an iPad user
    // to instructions about a Windows address bar.
    pretendDevice(AGENTS.ipadOs, 5);

    expect(isIos()).toBe(true);
    expect(locationHelpTarget()).toBe("iosSafari");
  });

  it("does not mistake a real Mac for an iPad", () => {
    pretendDevice(AGENTS.ipadOs, 0);

    expect(isIos()).toBe(false);
    expect(locationHelpTarget()).toBe("desktop");
  });

  it("sends Android Chrome to the address-bar permission menu", () => {
    pretendDevice(AGENTS.androidChrome);

    expect(locationHelpTarget()).toBe("androidChrome");
  });

  it("sends other Android browsers to the app permission screen", () => {
    pretendDevice(AGENTS.androidFirefox);

    expect(locationHelpTarget()).toBe("androidOtherBrowser");
  });

  it("falls back to the desktop instructions", () => {
    pretendDevice(AGENTS.desktopChrome, 0);

    expect(locationHelpTarget()).toBe("desktop");
  });
});

describe("which kind of no it was", () => {
  function pretendGeolocation(
    handler: (
      ok: PositionCallback,
      fail: PositionErrorCallback,
    ) => void | Promise<void>,
  ) {
    vi.stubGlobal("navigator", {
      userAgent: AGENTS.androidChrome,
      maxTouchPoints: 5,
      geolocation: { getCurrentPosition: handler },
    });
  }

  const errorWithCode = (code: number) =>
    ({
      code,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: "",
    }) as GeolocationPositionError;

  it("reports a refusal as a refusal, which is what changes the screen", async () => {
    pretendGeolocation((_ok, fail) => fail(errorWithCode(1)));

    await expect(requestLocation()).rejects.toMatchObject({
      problem: "denied",
    });
  });

  it("keeps 'could not get a fix' apart from 'you said no'", async () => {
    // Standing indoors is not a permission problem, and telling somebody to go
    // and change a setting they already granted wastes their time.
    pretendGeolocation((_ok, fail) => fail(errorWithCode(2)));

    await expect(requestLocation()).rejects.toMatchObject({
      problem: "unavailable",
    });
  });

  it("reports a timeout as a timeout", async () => {
    pretendGeolocation((_ok, fail) => fail(errorWithCode(3)));

    await expect(requestLocation()).rejects.toMatchObject({
      problem: "timeout",
    });
  });

  it("says so when the browser has no geolocation at all", async () => {
    vi.stubGlobal("navigator", {
      userAgent: AGENTS.desktopChrome,
      maxTouchPoints: 0,
    });

    await expect(requestLocation()).rejects.toMatchObject({
      problem: "unsupported",
    });
  });

  it("rounds a fix to what the server column can hold", async () => {
    // A raw reading carries more decimals than the column stores, and the
    // rejection reaches the worker as a sentence about a field they cannot
    // see. Seven places for a coordinate, two for the accuracy.
    pretendGeolocation((ok) =>
      ok({
        coords: {
          latitude: 3.114947512345,
          longitude: 101.729469598765,
          accuracy: 13.456789,
        },
      } as GeolocationPosition),
    );

    await expect(requestLocation()).resolves.toEqual({
      latitude: "3.1149475",
      longitude: "101.7294696",
      accuracy: "13.46",
    });
  });

  it("treats anything that is not a LocationRefused as unavailable", () => {
    expect(problemOf(new Error("boom"))).toBe("unavailable");
    expect(problemOf(new LocationRefused("denied"))).toBe("denied");
  });
});
