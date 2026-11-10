import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * JB156 (客户 11-10 第四批: 「苹果手机重启了之后，声音红点都没有」). Every app
 * open posts this phone's push registration and makes it again when the phone
 * or Apple / Google lost it - once per open, quietly, and never against the
 * person's own 「关」.
 */

const get = vi.fn();
const post = vi.fn();
vi.mock("@/services/api-client", () => ({
  api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) },
}));

type Service = typeof import("@/services/push-notification.service") & {
  ApiError: typeof import("@/interfaces/api").ApiError;
};

/**
 * A fresh module: what one app open starts with. `ApiError` comes from the
 * same fresh load, so the service recognises the refusals a test throws.
 */
async function openApp(): Promise<Service> {
  vi.resetModules();
  const service = await import("@/services/push-notification.service");
  const { ApiError } = await import("@/interfaces/api");
  return { ...service, ApiError };
}

function registrationFor(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: `p-${endpoint}`, auth: `a-${endpoint}` } }),
    unsubscribe: vi.fn(async () => true),
  };
}

type Registration = ReturnType<typeof registrationFor>;

const said: string[] = [];
const storage = new Map<string, string>();

function phone({
  permission,
  current,
  subscribe = async () => registrationFor("https://push.example/fresh"),
}: {
  permission: NotificationPermission;
  current: Registration | null;
  subscribe?: () => Promise<Registration>;
}) {
  let held = current;
  const pushManager = {
    getSubscription: vi.fn(async () => held),
    subscribe: vi.fn(async () => {
      held = await subscribe();
      return held;
    }),
  };
  if (current) {
    current.unsubscribe.mockImplementation(async () => {
      held = null;
      return true;
    });
  }
  const registration = { pushManager };
  vi.stubGlobal("Notification", { permission });
  vi.stubGlobal("window", {
    PushManager: function PushManager() {},
    Notification: { permission },
    atob: (value: string) => globalThis.atob(value),
    dispatchEvent: (event: Event) => {
      said.push(event.type);
      return true;
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
  vi.stubGlobal("navigator", {
    platform: "iPhone",
    serviceWorker: {
      ready: Promise.resolve(registration),
      getRegistration: async () => registration,
    },
  });
  return pushManager;
}

const SUBSCRIBE = "/api/notifications/subscribe_push/";

function posted(path: string) {
  return post.mock.calls.filter(([url]) => url === path).map(([, body]) => body as { endpoint: string });
}

beforeEach(() => {
  said.length = 0;
  storage.clear();
  get.mockResolvedValue({ configured: true, public_key: "AAAA" });
  post.mockResolvedValue({ expired: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  get.mockReset();
  post.mockReset();
});

describe("registering this phone again when the app opens (JB156)", () => {
  it("posts a registration that is there and fine, as before", async () => {
    const pushManager = phone({ permission: "granted", current: registrationFor("https://push.example/ok") });
    const { refreshPushRegistration } = await openApp();

    await expect(refreshPushRegistration()).resolves.toBe("synced");

    expect(posted(SUBSCRIBE).map((body) => body.endpoint)).toEqual(["https://push.example/ok"]);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    // Quiet: a refusal here is never toasted at the person.
    expect(post).toHaveBeenCalledWith(SUBSCRIBE, expect.anything(), { silent: true });
  });

  it("registers again, without a tap, when the phone lost it and notifications are allowed", async () => {
    const pushManager = phone({ permission: "granted", current: null });
    const { refreshPushRegistration, PUSH_REGISTRATION_CHANGED } = await openApp();

    await expect(refreshPushRegistration()).resolves.toBe("renewed");

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(posted(SUBSCRIBE).map((body) => body.endpoint)).toEqual(["https://push.example/fresh"]);
    expect(said).toEqual([PUSH_REGISTRATION_CHANGED]);
  });

  it("drops one Apple / Google dropped and registers afresh, once", async () => {
    const dead = registrationFor("https://push.example/dead");
    const pushManager = phone({ permission: "granted", current: dead });
    post.mockImplementation(async (url: string, body: { endpoint: string }) =>
      url === SUBSCRIBE && body.endpoint === dead.endpoint ? { expired: true } : { expired: false },
    );
    const { refreshPushRegistration } = await openApp();

    await expect(refreshPushRegistration()).resolves.toBe("renewed");

    expect(dead.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(posted(SUBSCRIBE).map((body) => body.endpoint)).toEqual([
      "https://push.example/dead",
      "https://push.example/fresh",
    ]);
  });

  it("does nothing where notifications are not allowed - the hint asks", async () => {
    for (const permission of ["denied", "default"] as const) {
      const pushManager = phone({ permission, current: null });
      const { refreshPushRegistration } = await openApp();
      await expect(refreshPushRegistration()).resolves.toBe("not-granted");
      expect(pushManager.subscribe).not.toHaveBeenCalled();
    }
    expect(post).not.toHaveBeenCalled();
    expect(said).toEqual([]);
  });

  it("tries once per open, and a failure only brings 「打开通知」 back", async () => {
    const pushManager = phone({
      permission: "granted",
      current: null,
      subscribe: async () => {
        throw new Error("NotAllowedError");
      },
    });
    const service = await openApp();

    await expect(service.refreshPushRegistration()).resolves.toBe("failed");
    // The account reloads (the same open): no second try, no loop.
    await expect(service.refreshPushRegistration()).resolves.toBe("none");
    await expect(service.refreshPushRegistration()).resolves.toBe("none");

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(said).toEqual([service.PUSH_REGISTRATION_CHANGED]);
    await expect(service.getPushSubscriptionStatus()).resolves.toBe(false);
  });

  it("a dead one still on the phone that cannot be dropped reads as not registered, so the hint offers 「打开通知」", async () => {
    const dead = registrationFor("https://push.example/dead");
    const pushManager = phone({ permission: "granted", current: dead });
    dead.unsubscribe.mockRejectedValue(new Error("InvalidStateError"));
    post.mockResolvedValue({ expired: true });
    const service = await openApp();

    await expect(service.refreshPushRegistration()).resolves.toBe("failed");
    await expect(pushManager.getSubscription()).resolves.toBe(dead);
    await expect(service.getPushSubscriptionStatus()).resolves.toBe(false);
  });

  it("leaves a phone whose driver turned notifications off, off", async () => {
    const pushManager = phone({ permission: "granted", current: registrationFor("https://push.example/mine") });
    post.mockResolvedValue({});
    const service = await openApp();
    await service.disablePushNotifications();

    await expect(service.refreshPushRegistration()).resolves.toBe("off");
    expect(pushManager.subscribe).not.toHaveBeenCalled();

    // Turned on again by hand: kept on from then.
    await service.enablePushNotifications();
    expect(storage.size).toBe(0);
  });

  it("a registration the server cannot be reached for is left as it is", async () => {
    const mine = registrationFor("https://push.example/mine");
    const pushManager = phone({ permission: "granted", current: mine });
    const service = await openApp();
    post.mockRejectedValue(new service.ApiError("offline", 0));

    await expect(service.refreshPushRegistration()).resolves.toBe("unreached");
    expect(mine.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe("「打开通知」 after a dropped registration (JB156)", () => {
  it("makes a fresh one when the server says the old one is gone", async () => {
    const dead = registrationFor("https://push.example/dead");
    const pushManager = phone({ permission: "granted", current: dead });
    post.mockImplementation(async (url: string, body: { endpoint: string }) =>
      url === SUBSCRIBE && body.endpoint === dead.endpoint ? { expired: true } : { expired: false },
    );
    const { enablePushNotifications } = await openApp();

    await expect(enablePushNotifications()).resolves.toBe(true);

    expect(dead.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(posted(SUBSCRIBE).at(-1)?.endpoint).toBe("https://push.example/fresh");
  });

  it("`renew` drops the one on the phone first, after a test that did not go", async () => {
    const old = registrationFor("https://push.example/old");
    const pushManager = phone({ permission: "granted", current: old });
    const { enablePushNotifications } = await openApp();

    await expect(enablePushNotifications({ renew: true })).resolves.toBe(true);

    expect(posted("/api/notifications/unsubscribe_push/").map((body) => body.endpoint)).toEqual([old.endpoint]);
    expect(old.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(posted(SUBSCRIBE).map((body) => body.endpoint)).toEqual(["https://push.example/fresh"]);
  });
});

describe("「发一条测试通知」 (JB156)", () => {
  const SEND = "/api/notifications/send_test_push/";

  it("asks the server to push to this phone's own registration", async () => {
    phone({ permission: "granted", current: registrationFor("https://push.example/mine") });
    post.mockResolvedValue({ sent: true, error: "" });
    const { sendTestPush } = await openApp();

    await expect(sendTestPush()).resolves.toEqual({ sent: true });
    expect(post).toHaveBeenCalledWith(SEND, { endpoint: "https://push.example/mine" }, { silent: true });
  });

  it("says why it did not go: Apple / Google's answer, or the server's refusal", async () => {
    phone({ permission: "granted", current: registrationFor("https://push.example/mine") });
    const { sendTestPush, ApiError } = await openApp();

    post.mockResolvedValueOnce({ sent: false, error: "push_endpoint_gone" });
    await expect(sendTestPush()).resolves.toEqual({ sent: false, code: "push_endpoint_gone" });

    post.mockRejectedValueOnce(new ApiError("测试通知刚发过，请等 9 秒再发。", 429, {}, "push_test_too_soon"));
    await expect(sendTestPush()).resolves.toEqual({
      sent: false,
      code: "push_test_too_soon",
      message: "测试通知刚发过，请等 9 秒再发。",
    });
  });

  it("a phone with no registration asks nothing of the server", async () => {
    phone({ permission: "granted", current: null });
    const { sendTestPush } = await openApp();

    await expect(sendTestPush()).resolves.toEqual({ sent: false, code: "push_subscription_not_found" });
    expect(post).not.toHaveBeenCalled();
  });
});
