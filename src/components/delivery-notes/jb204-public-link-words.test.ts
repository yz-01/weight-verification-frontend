/**
 * JB204-6 (Lucas 11-16 audit): the public delivery-note and disposal links
 * speak the reader's language when something stops them.
 *
 * - Delivery note, location off: only English 「Allow location access before
 *   recording site evidence.」 - now a catalogue line that says what to do.
 * - Delivery note, a server refusal without a code: the server's English
 *   sentence - now a catalogue line that says what to do.
 * - Disposal link, location off: 「操作无法完成，请检查网络后重试。」 sent the
 *   driver to check his signal - now 「请允许本页面使用定位」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { deliveryNoteErrorText } = await import("@/components/delivery-notes/public-delivery-note");
const { isLocationRefusal } = await import("@/components/contractor-ops/site-disposal-workspaces");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const REFUSED = zh.deliveryNotePublic.error.refused;
const ACTION = zh.deliveryNotePublic.error.action;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the delivery-note link", () => {
  it("words a refusal that names no code, instead of the server's English", () => {
    const refusal = new ApiError("Record vehicle arrival before adding delivery evidence.", 409);
    expect(deliveryNoteErrorText(refusal, REFUSED, ACTION)).toBe(REFUSED);
  });

  it("keeps what is already in the reader's words", () => {
    // A coded refusal is worded from the catalogue by the API client.
    const coded = new ApiError(zh.errors.api.equipment_hours_outside_fence, 400, {}, "equipment_hours_outside_fence");
    expect(deliveryNoteErrorText(coded, REFUSED, ACTION)).toBe(zh.errors.api.equipment_hours_outside_fence);
    // No answer at all: the network sentence.
    const offline = new ApiError(zh.errors.network, 0);
    expect(deliveryNoteErrorText(offline, REFUSED, ACTION)).toBe(zh.errors.network);
    // The page's own sentences.
    expect(deliveryNoteErrorText(new Error(zh.deliveryNotePublic.error.location), REFUSED, ACTION)).toBe(
      zh.deliveryNotePublic.error.location,
    );
    expect(deliveryNoteErrorText(new Error(zh.deliveryNotePublic.error.signatureRequired), REFUSED, ACTION)).toBe(
      zh.deliveryNotePublic.error.signatureRequired,
    );
    expect(deliveryNoteErrorText("??", REFUSED, ACTION)).toBe(ACTION);
  });

  it("asks for the location in the reader's words wherever it reads one", () => {
    const page = read("src/components/delivery-notes/public-delivery-note.tsx");
    expect(page).not.toContain('new Error("Allow location access');
    expect(page).not.toContain('new Error("Location access is required');
    expect(page.match(/getLocation\(t\("error\.location"\)\)/g)).toHaveLength(3);
    expect(page.match(/deliveryNoteErrorText\(reason, t\("error\.refused"\), t\("error\.action"\)\)/g)).toHaveLength(3);
  });

  it("has both lines in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.deliveryNotePublic.error.location).toBeTruthy();
      expect(messages.deliveryNotePublic.error.refused).toBeTruthy();
    }
    expect(zh.deliveryNotePublic.error.location).toContain("定位");
  });
});

describe("the disposal link", () => {
  it("tells a refused location from a network failure", () => {
    class GeolocationPositionError extends Error {
      code = 1;
    }
    vi.stubGlobal("GeolocationPositionError", GeolocationPositionError);
    expect(isLocationRefusal(new GeolocationPositionError("User denied Geolocation"))).toBe(true);
    expect(isLocationRefusal(new Error("location_unavailable"))).toBe(true);
    expect(isLocationRefusal(new ApiError(zh.errors.network, 0))).toBe(false);
    expect(isLocationRefusal(new ApiError("Refused.", 400, {}, "disposal_link_closed"))).toBe(false);
  });

  it("says 「请允许定位」 when the photo had no position", () => {
    const page = read("src/components/contractor-ops/site-disposal-workspaces.tsx");
    expect(page).toContain(
      'setError(isLocationRefusal(reason) ? t("error.location") : reasonText(reason, t("error.action")));',
    );
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.siteDisposal.external.error.location).toBeTruthy();
      expect(messages.siteDisposal.external.error.location).not.toBe(messages.siteDisposal.external.error.action);
    }
    expect(zh.siteDisposal.external.error.location).toContain("允许本页面使用定位");
  });
});
