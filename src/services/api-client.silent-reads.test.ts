import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import en from "@/messages/en.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { api } from "./api-client";

/**
 * Which refusals the reader is told about, and which the screen absorbs.
 *
 * The customer photographed "You do not have permission to perform this
 * action" twice, on two screens they had just been let into. Both times a
 * background read was refused - a sidebar badge count, a notification total -
 * and `api-client` toasts every non-ok response, so a number nobody asked for
 * painted an accusation across the page (F-224).
 *
 * The fix was to make those reads silent, and that change had no test at all
 * when it was written. Silence is not observable from a type-checker and not
 * observable from a lint: the request still fails, the promise still rejects,
 * and the only difference is a call that does not happen. So this asserts
 * both directions, because a client that never toasted anything would satisfy
 * the first half on its own.
 *
 * A write is deliberately not covered by the same rule. Somebody pressed a
 * button; being told it was refused is the whole point.
 */

function refuse(status: number) {
  globalThis.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        success: false,
        message: "You do not have permission to perform this action.",
        code: "permission_denied",
        errors: {},
      }),
      { status, headers: { "Content-Type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
}

async function swallow(promise: Promise<unknown>) {
  try {
    await promise;
  } catch {
    // Every case here fails on purpose; the assertion is about the toast.
  }
}

describe("a refused background read does not accuse the reader", () => {
  beforeEach(() => {
    publishTranslator("en", en as unknown as Record<string, unknown>);
    toastError.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says nothing when a silent read is refused", async () => {
    refuse(403);

    await swallow(
      api.get("/api/contractor-dashboard/get_dashboard/", undefined, {
        silent: true,
      }),
    );

    expect(toastError).not.toHaveBeenCalled();
  });

  it("still speaks up when an ordinary read is refused", async () => {
    // The guard on the guard. Without this, an api-client that had lost the
    // ability to toast at all would pass the test above and nobody would
    // know until a real refusal went unreported.
    refuse(403);

    await swallow(api.get("/api/projects/get_projects/"));

    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("still speaks up when a write is refused", async () => {
    // Somebody pressed a button. Absorbing this would be the opposite of
    // the fix.
    refuse(403);

    await swallow(api.post("/api/projects/create_project/", { name: "x" }));

    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("says nothing when a silent read hits a network failure", async () => {
    // The other path that toasts: `send` throwing rather than answering.
    // The shell polls every thirty seconds, so a phone going through a
    // tunnel would otherwise produce a toast a minute.
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await swallow(
      api.get("/api/notifications/get_unread_count/", undefined, {
        silent: true,
      }),
    );

    expect(toastError).not.toHaveBeenCalled();
  });
});
