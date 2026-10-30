import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「打开通知」 spun for ever on an iPhone (Lucas 10-30). The permission is
 * asked straight from the tap, before any network wait, and a step that
 * never answers ends in a `PushEnableError` naming it.
 */

const getConfig = vi.fn();
const post = vi.fn();
vi.mock("@/services/api-client", () => ({
  api: { get: (...args: unknown[]) => getConfig(...args), post: (...args: unknown[]) => post(...args) },
}));

const { enablePushNotifications, PushEnableError } = await import("@/services/push-notification.service");

const order: string[] = [];
const never = <T>() => new Promise<T>(() => {});

function phone({ ready }: { ready: Promise<unknown> }) {
  const requestPermission = vi.fn(async () => {
    order.push("permission");
    return "granted";
  });
  vi.stubGlobal("Notification", Object.assign(function Notification() {}, { permission: "default", requestPermission }));
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", {
    platform: "iPhone",
    serviceWorker: {
      getRegistration: vi.fn(async () => ({})),
      register: vi.fn(async () => ({})),
      ready,
    },
  });
  return requestPermission;
}

beforeEach(() => {
  order.length = 0;
  getConfig.mockImplementation(async () => {
    order.push("config");
    return { configured: true, public_key: "AAAA" };
  });
  post.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("turning notifications on", () => {
  it("asks for the permission before waiting on the network", async () => {
    getConfig.mockImplementation(() => {
      order.push("config asked");
      return new Promise((resolve) => setTimeout(() => resolve({ configured: true, public_key: "AAAA" }), 0));
    });
    const subscription = { toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }) };
    phone({ ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }) });
    await expect(enablePushNotifications()).resolves.toBe(true);
    // The request starts first, but nothing waits for it before the question.
    expect(order).toEqual(["config asked", "permission"]);
    expect(post).toHaveBeenCalledWith("/api/notifications/subscribe_push/", expect.objectContaining({ endpoint: "https://push.example/1" }));
  });

  it("names the step that never answers instead of spinning", async () => {
    vi.useFakeTimers();
    phone({ ready: never() });
    const result = enablePushNotifications().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(16_000);
    const error = await result;
    expect(error).toBeInstanceOf(PushEnableError);
    expect((error as InstanceType<typeof PushEnableError>).step).toBe("worker");
  });
});
