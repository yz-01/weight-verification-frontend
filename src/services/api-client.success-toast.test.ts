import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { success, dismiss } = vi.hoisted(() => ({
  success: vi.fn<(message: string, options?: object) => string>(() => "toast-1"),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success, error: vi.fn(), info: vi.fn(), dismiss } }));

import { SUCCESS_TOAST_MS, showSuccessToast } from "./api-client";

/**
 * 「资料已更新」 stayed on an iPhone after a language change because sonner
 * paused its own timer for a hover that never ended. The toast must also be
 * dismissed by us a little after its normal duration.
 */
describe("success toast always goes away", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("asks for the normal duration and hard-dismisses it afterwards", () => {
    showSuccessToast("ok");
    expect(success).toHaveBeenCalledWith("ok", { duration: SUCCESS_TOAST_MS });
    vi.advanceTimersByTime(SUCCESS_TOAST_MS);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(dismiss).toHaveBeenCalledWith("toast-1");
  });
});
