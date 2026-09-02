import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, withOfflineProvenance } from "./api-client";

/**
 * The offline provenance stamp, checked where it can actually go wrong.
 *
 * A record created on a phone at 09:05 and uploaded at 14:00 because the site
 * had no signal, and one typed in at 13:58 about that morning, reach the server
 * with the same occurrence time and the same upload time. The queue has always
 * known which is which — `queuedAt` sits in IndexedDB — and the whole feature
 * is whether that knowledge survives the trip.
 *
 * The stamp is ambient rather than an argument, because the replay reaches the
 * server through fourteen service functions and several build their own
 * FormData. Ambient state has one classic failure mode: leaking past the scope
 * it was meant for. That is what most of these check.
 */

const CREATED_AT = "2026-08-28T09:05:00.000Z";

function lastBody(): FormData | Record<string, unknown> {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const init = mock.mock.calls.at(-1)?.[1] as RequestInit;
  const body = init.body;
  if (body instanceof FormData) return body;
  return JSON.parse(String(body)) as Record<string, unknown>;
}

describe("offline provenance", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stamps a JSON body sent inside the scope", async () => {
    await withOfflineProvenance(CREATED_AT, () =>
      api.post("/api/attendance/clock/", { event: "CLOCK_IN" }, { silent: true }),
    );

    expect(lastBody()).toMatchObject({
      event: "CLOCK_IN",
      offline_created_at: CREATED_AT,
    });
  });

  it("stamps a FormData body, which is how most offline paths upload", async () => {
    const form = new FormData();
    form.append("event", "CLOCK_IN");

    await withOfflineProvenance(CREATED_AT, () =>
      api.post("/api/attendance/clock/", form, { silent: true }),
    );

    const body = lastBody() as FormData;
    expect(body.get("offline_created_at")).toBe(CREATED_AT);
  });

  it("leaves an ordinary online request alone", async () => {
    await api.post("/api/attendance/clock/", { event: "CLOCK_IN" }, { silent: true });

    expect(lastBody()).not.toHaveProperty("offline_created_at");
  });

  it("stops stamping once the scope ends", async () => {
    await withOfflineProvenance(CREATED_AT, () =>
      api.post("/api/attendance/clock/", { event: "CLOCK_IN" }, { silent: true }),
    );

    await api.post("/api/attendance/clock/", { event: "CLOCK_OUT" }, { silent: true });

    expect(lastBody()).not.toHaveProperty("offline_created_at");
  });

  it("stops stamping even when the request inside the scope throws", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      withOfflineProvenance(CREATED_AT, () =>
        api.post("/api/attendance/clock/", { event: "CLOCK_IN" }, { silent: true }),
      ),
    ).rejects.toThrow();

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    await api.post("/api/attendance/clock/", { event: "CLOCK_OUT" }, { silent: true });

    expect(lastBody()).not.toHaveProperty("offline_created_at");
  });

  it("does not overwrite a stamp the caller set explicitly", async () => {
    const form = new FormData();
    form.append("offline_created_at", "2026-01-01T00:00:00.000Z");

    await withOfflineProvenance(CREATED_AT, () =>
      api.post("/api/attendance/clock/", form, { silent: true }),
    );

    const body = lastBody() as FormData;
    expect(body.getAll("offline_created_at")).toEqual([
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("does not stamp an array body, which is not a record to annotate", async () => {
    await withOfflineProvenance(CREATED_AT, () =>
      api.post("/api/task-positions/record_positions/", [{ a: 1 }], {
        silent: true,
      }),
    );

    expect(lastBody()).toEqual([{ a: 1 }]);
  });
});
