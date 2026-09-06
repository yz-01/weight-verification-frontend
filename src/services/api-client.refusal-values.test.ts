import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { ApiError } from "@/interfaces/api";
import { api } from "./api-client";

/**
 * Whether the number in a refusal reaches the reader.
 *
 * A refusal worded from its code alone is a refusal with the facts taken out.
 * "You are outside the site fence" leaves a worker standing in a car park with
 * nothing to act on; "you are outside the site fence, 137 m from the nearest
 * one" tells them to walk. So the server sends the measured value alongside
 * the code in `values`, and the catalogue entry has a slot for it.
 *
 * That is a three-part chain - server, envelope, catalogue - and every part of
 * it is silent when it breaks: a dropped `values` does not raise anything, it
 * just prints a sentence with a gap where the number was. These tests are the
 * only thing that notices.
 */

function respondWith(body: unknown, status = 400) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

async function failureFrom(body: unknown): Promise<ApiError> {
  respondWith(body);
  try {
    await api.post("/api/attendance/clock/", {}, { silent: true });
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("The request was expected to fail and did not.");
}

const OUTSIDE = {
  success: false,
  message: "Attendance can only be recorded inside the project geofence.",
  code: "attendance_outside_geofence",
  errors: { location: ["Reported location is outside every geofence."] },
  values: { distance: 137 },
};

describe("a refusal that carries a measurement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("in English", () => {
    beforeEach(() => {
      publishTranslator("en", en as unknown as Record<string, unknown>);
    });

    it("puts the distance in the sentence the worker reads", async () => {
      const failure = await failureFrom(OUTSIDE);

      expect(failure.message).toContain("137");
      expect(failure.message).toBe(
        "You are outside the site fence, 137 m from the nearest one. " +
          "Move closer and try again.",
      );
    });

    it("keeps the code so a screen can tell this refusal from the rest", async () => {
      const failure = await failureFrom(OUTSIDE);

      expect(failure.code).toBe("attendance_outside_geofence");
      expect(failure.status).toBe(400);
    });

    it("never shows a key path when the value is missing", async () => {
      // The server omits `values` when it could not measure a distance. The
      // catalogue entry still wants one, so the wording has to be abandoned
      // rather than rendered half-empty - the reader gets the server sentence.
      const failure = await failureFrom({ ...OUTSIDE, values: undefined });

      expect(failure.message).not.toContain("errors.api");
      expect(failure.message).toBe(OUTSIDE.message);
    });

    it("still words a coded refusal that needs no value", async () => {
      const failure = await failureFrom({
        success: false,
        message: "GPS is required when the project has a geofence.",
        code: "attendance_gps_required",
        errors: { location: ["Send latitude and longitude."] },
      });

      expect(failure.message).toBe(en.errors.api.attendance_gps_required);
    });
  });

  describe("in Chinese", () => {
    beforeEach(() => {
      publishTranslator("zh", zh as unknown as Record<string, unknown>);
    });

    it("puts the distance in the sentence the user asked for", async () => {
      // The exact wording the user wrote (2026-09-05):
      // 你不在工地围栏内，离最近围栏 N 米
      const failure = await failureFrom(OUTSIDE);

      expect(failure.message).toContain("137");
      expect(failure.message).toContain("离最近围栏 137 米");
    });
  });
});
