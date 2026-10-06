import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import { api, UPLOAD_TIMEOUT_MS } from "./api-client";

/**
 * An upload that never answers is given up after two minutes (A9).
 *
 * On a weak site signal a photo upload could hang with no answer, and the
 * offline queue waited on it for good - the record said 「等待上传」 and
 * everything behind it waited too. The fetch here never answers on its own;
 * only the abort signal ends it, exactly as a stalled mobile link behaves.
 */

function stalledFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("an upload with no answer", () => {
  it("fails as a timeout after UPLOAD_TIMEOUT_MS, so the queue can say why and retry", async () => {
    globalThis.fetch = stalledFetch() as unknown as typeof fetch;
    const data = new FormData();
    data.append("image", new File(["jpeg"], "do.jpg", { type: "image/jpeg" }));

    const failure = api
      .post("/api/field-tasks/t1/add_photo/", data, { silent: true })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
    let settled = false;
    void failure.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await failure;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "timeout" });
    expect((error as ApiError).isNetwork).toBe(true);
  });

  it("does not time a plain JSON request", async () => {
    let answer: (response: Response) => void = () => undefined;
    globalThis.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          expect(init?.signal).toBeUndefined();
          answer = resolve;
        }),
    ) as unknown as typeof fetch;

    const reply = api.post<{ ok: boolean }>("/api/tasks/create_task/", {}, { silent: true });
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS * 2);
    answer(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(reply).resolves.toEqual({ ok: true });
  });

  it("still lets the caller cancel an upload as an abort, not a timeout", async () => {
    globalThis.fetch = stalledFetch() as unknown as typeof fetch;
    const controller = new AbortController();
    const data = new FormData();
    data.append("image", new File(["jpeg"], "do.jpg", { type: "image/jpeg" }));
    const failure = api
      .post("/api/field-tasks/t1/add_photo/", data, { silent: true, signal: controller.signal })
      .catch((error: unknown) => error);
    controller.abort();
    const error = await failure;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
