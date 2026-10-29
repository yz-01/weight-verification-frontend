import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * JB80 (客户 10-29 晚: 通知不会混乱): signing out detaches this phone from the
 * account, so a shared phone stops ringing with the last person's notices.
 */
const post = vi.fn();
vi.mock("@/services/api-client", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

const { detachPushFromAccount } = await import("@/services/push-notification.service");

function phone(subscription: { endpoint: string } | null) {
  const registration = { pushManager: { getSubscription: () => Promise.resolve(subscription) } };
  vi.stubGlobal("window", { PushManager: {}, Notification: {} });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: () => Promise.resolve(registration) } });
}

describe("signing out detaches this phone (JB80)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    post.mockReset();
  });

  it("tells the server to stop sending this account's notices here", async () => {
    phone({ endpoint: "https://push.example/abc" });
    post.mockResolvedValue({ updated: 1 });
    await detachPushFromAccount();
    expect(post).toHaveBeenCalledWith(
      "/api/notifications/unsubscribe_push/",
      { endpoint: "https://push.example/abc" },
      { silent: true },
    );
  });

  it("never holds up signing out", async () => {
    phone({ endpoint: "https://push.example/abc" });
    post.mockReturnValue(new Promise(() => undefined));
    const started = Date.now();
    await detachPushFromAccount(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("is called before the session ends, and clears the icon's number", () => {
    const provider = readFileSync(
      path.join(process.cwd(), "src/components/providers/auth-provider.tsx"),
      "utf8",
    );
    expect(provider.indexOf("await detachPushFromAccount();")).toBeLessThan(
      provider.indexOf("await authService.logout();"),
    );
    expect(provider).toContain("setAppBadgeCount(0);");
  });
});
