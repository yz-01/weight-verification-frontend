import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { ApiError } from "@/interfaces/api";
import { api } from "./api-client";

/**
 * What a form actually shows when the server refuses it.
 *
 * The backend tags every field failure with DRF's code and sends its own
 * English alongside, and the catalogue words the code in the reader's
 * language. That is right for the structural failures — `required`, `blank`,
 * `max_length` — where the server's sentence is boilerplate and the
 * translation is the whole point.
 *
 * It is wrong for `invalid`, which DRF uses as the catch-all for every
 * hand-written `ValidationError("...")` in the codebase. Those sentences are
 * the only place the reason lives: which driver, which trip, what to do about
 * it. Translating the code threw all of that away and put "This value is not
 * valid" under the field instead — on the screen of a dispatcher trying to
 * work out why the lorry would not go out.
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
    await api.post("/api/tasks/create_task/", {}, { silent: true });
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("The request was expected to fail and did not.");
}

describe("field errors reaching the form", () => {
  beforeEach(() => {
    publishTranslator("en", en as unknown as Record<string, unknown>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the server's own sentence when the code is the catch-all", async () => {
    const written =
      "That driver is already on trip TK-YD-01-000004 (at yard, awaiting " +
      "weighing). Finish or cancel it before assigning another.";

    const failure = await failureFrom({
      success: false,
      message: "Validation failed.",
      code: "validation_failed",
      errors: { driver: [{ code: "invalid", message: written }] },
    });

    expect(failure.errors.driver).toBe(written);
  });

  it("still words the structural failures from the catalogue", async () => {
    const failure = await failureFrom({
      success: false,
      message: "Validation failed.",
      code: "validation_failed",
      errors: {
        site: [{ code: "required", message: "This field is required." }],
      },
    });

    expect(failure.errors.site).toBe(en.errors.field.required);
  });

  it("falls back to the catalogue when the server sent no sentence", async () => {
    const failure = await failureFrom({
      success: false,
      message: "Validation failed.",
      code: "validation_failed",
      errors: { driver: [{ code: "invalid", message: "" }] },
    });

    expect(failure.errors.driver).toBe(en.errors.field.invalid);
  });
});
