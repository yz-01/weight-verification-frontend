import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OCR_READ_TIMEOUT_MS, readWithin } from "@/lib/delivery-note-read";

/**
 * The phone stops waiting for a DO read (hotfix after the October deploy).
 *
 * Lucas's iPhone sat on 「读取中」 for good because the read had no end. It
 * now always settles - read, failed, or out of time - and an answer that
 * arrives after the deadline is ignored rather than refilling the form.
 */
describe("readWithin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands back a read that answers in time", async () => {
    const outcome = readWithin(() => Promise.resolve({ proof: "p" }), 1_000);
    await expect(outcome).resolves.toEqual({ kind: "read", result: { proof: "p" } });
  });

  it("reports a failed read instead of throwing", async () => {
    const reason = new Error("502");
    await expect(readWithin(() => Promise.reject(reason), 1_000)).resolves.toEqual({
      kind: "failed",
      reason,
    });
    await expect(
      readWithin(() => {
        throw reason;
      }, 1_000),
    ).resolves.toEqual({ kind: "failed", reason });
  });

  it("stops waiting at the deadline when the server never answers", async () => {
    let settled: unknown = null;
    void readWithin(() => new Promise(() => {}), OCR_READ_TIMEOUT_MS).then((outcome) => {
      settled = outcome;
    });

    await vi.advanceTimersByTimeAsync(OCR_READ_TIMEOUT_MS - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ kind: "timedOut" });
  });

  it("ignores an answer that arrives after the deadline", async () => {
    let answer: (value: string) => void = () => {};
    const outcomes: unknown[] = [];
    void readWithin(
      () => new Promise<string>((resolve) => {
        answer = resolve;
      }),
      1_000,
    ).then((outcome) => outcomes.push(outcome));

    await vi.advanceTimersByTimeAsync(1_000);
    answer("late");
    await vi.runAllTimersAsync();
    expect(outcomes).toEqual([{ kind: "timedOut" }]);
  });

  it("waits longer than the server's own 20 s budget, but not for ever", () => {
    expect(OCR_READ_TIMEOUT_MS).toBeGreaterThan(20_000);
    expect(OCR_READ_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
  });
});
