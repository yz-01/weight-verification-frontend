import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { ApiError } from "@/interfaces/api";
import { api } from "./api-client";

/**
 * Whether a failure on the server's side reaches the reader in their language.
 *
 * The catalogues have carried a `server_error` sentence in all four languages
 * since 2026-09-08, and nothing could ever use it: the envelope named only
 * 400 and 422, so every 5xx arrived with `code: ""` and the client fell
 * through to whatever English sentence the server had generated. A Malay site
 * crew read "A server error occurred." on a screen the platform promised them
 * in Malay - and the backend's orphan-translation guard had been red about it
 * the whole time, unseen, because `core` was not in any regression run
 * (F-308, F-330, T-229).
 *
 * The backend now sends `server_error` for anything 5xx it can still wrap.
 * These two halves have to agree for the sentence to appear, and neither half
 * fails loudly on its own: the server would just send an unused code, and the
 * client would just word a 500 in English. So both are asserted, and the third
 * case pins the difference the fix actually makes.
 */

function failureFrom(body: unknown, status: number): Promise<ApiError> {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch;

  return api
    .post("/api/tasks/create_task/", {}, { silent: true })
    .then(() => {
      throw new Error("The request was expected to fail and did not.");
    })
    .catch((error: unknown) => error as ApiError);
}

/** What the backend's envelope now sends for a 5xx it can wrap. */
const WRAPPED_500 = {
  success: false,
  message: "A server error occurred.",
  code: "server_error",
  errors: {},
};

/** What it sent before: the same failure with nothing to word it by. */
const UNNAMED_500 = {
  success: false,
  message: "A server error occurred.",
  code: "",
  errors: {},
};

describe("a failure on the server's side", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("in English", () => {
    beforeEach(() => {
      publishTranslator("en", en as unknown as Record<string, unknown>);
    });

    it("is worded from the catalogue, not from the server's own sentence", async () => {
      const failure = await failureFrom(WRAPPED_500, 500);

      expect(failure.message).toBe(en.errors.api.server_error);
      expect(failure.status).toBe(500);
      // The catalogue tells the reader what to do next. The server's sentence
      // only says that something happened, which is why this is not a
      // cosmetic difference.
      expect(failure.message).toContain("Try again shortly");
    });

    it("falls back to the server's English when the code is missing", async () => {
      const failure = await failureFrom(UNNAMED_500, 500);

      expect(failure.message).toBe("A server error occurred.");
    });
  });

  describe("in Malay", () => {
    beforeEach(() => {
      publishTranslator("ms", ms as unknown as Record<string, unknown>);
    });

    it("reads in Malay, which is the whole point of the code", async () => {
      const failure = await failureFrom(WRAPPED_500, 500);

      expect(failure.message).toBe(ms.errors.api.server_error);
      // Named explicitly: an `ms.json` that had quietly kept the English
      // string would satisfy the line above and fail the reader.
      expect(failure.message).toContain("Pelayan");
      expect(failure.message).not.toBe("A server error occurred.");
    });
  });
});
