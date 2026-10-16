import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import {
  api,
  formDataBytes,
  proxyFailureMessage,
  UPLOAD_TIMEOUT_MAX_MS,
  UPLOAD_TIMEOUT_MS,
  uploadTimeoutMs,
} from "./api-client";

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

describe("a big upload gets the time it needs (P-phonefix)", () => {
  const MB = 1024 * 1024;

  it("a few photos keep the two minutes; a 20 MB file gets six; nothing waits past 30", () => {
    expect(uploadTimeoutMs(0)).toBe(UPLOAD_TIMEOUT_MS);
    expect(uploadTimeoutMs(3 * MB)).toBe(UPLOAD_TIMEOUT_MS);
    // 15 MB over the floor at 64 KB/s is 240 s more.
    expect(uploadTimeoutMs(20 * MB)).toBe(UPLOAD_TIMEOUT_MS + 240_000);
    expect(uploadTimeoutMs(2000 * MB)).toBe(UPLOAD_TIMEOUT_MAX_MS);
  });

  it("counts the files and the text of a multipart body", () => {
    const data = new FormData();
    data.append("note", "abc");
    data.append("file", new File([new Uint8Array(1000)], "a.pdf"));
    expect(formDataBytes(data)).toBe(1003);
  });

  it("a 20 MB upload is not cut off at two minutes", async () => {
    globalThis.fetch = stalledFetch() as unknown as typeof fetch;
    const data = new FormData();
    data.append("attachment", new File([new Uint8Array(20 * MB)], "plan.pdf"));
    const failure = api
      .post("/api/safety-incidents/i1/post_hazard_message/", data, { silent: true })
      .catch((error: unknown) => error);
    let settled = false;
    void failure.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(await failure).toMatchObject({ status: 0, code: "timeout" });
  });
});

describe("a proxy's error page says what happened", () => {
  it("413 says the file is too big, 502 / 504 say to try later", () => {
    expect(proxyFailureMessage(413).code).toBe("upload_too_large");
    expect(proxyFailureMessage(502).code).toBe("server_busy");
    expect(proxyFailureMessage(504).code).toBe("server_busy");
    expect(proxyFailureMessage(500).code).toBe("");
  });

  it("an HTML 413 from nginx reaches the caller with its own message, not the generic one", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html><body>413 Request Entity Too Large</body></html>", {
          status: 413,
          headers: { "Content-Type": "text/html" },
        }),
    ) as unknown as typeof fetch;
    const data = new FormData();
    data.append("attachment", new File(["x"], "plan.pdf"));
    const error = await api
      .post("/api/safety-incidents/i1/post_hazard_message/", data, { silent: true })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 413, code: "upload_too_large" });
    expect((error as ApiError).message).toBe(proxyFailureMessage(413).message);
    expect((error as ApiError).message).not.toBe(proxyFailureMessage(500).message);
  });
});
