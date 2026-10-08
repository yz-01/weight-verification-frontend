import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing out leaves no company photos behind on a shared phone (H5 audit
 * S3): the service worker's thumbnail caches (`mse-trace-photos-*`) go, even
 * when the sign-out request gets no answer. The app shell cache stays (the
 * app must still open offline), and the per-user hide list is untouched.
 */

const post = vi.fn();
vi.mock("@/services/api-client", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  toastSuccess: () => undefined,
}));
vi.mock("@/lib/auth-token", () => ({
  clearTokens: vi.fn(),
  getRefreshToken: () => "refresh",
  setDriverTokens: vi.fn(),
  setLocaleCookie: vi.fn(),
  setSessionPortal: vi.fn(),
  setTokens: vi.fn(),
}));
vi.mock("@/lib/project-context", () => ({
  clearActiveProjectId: vi.fn(),
  setActiveProjectId: vi.fn(),
}));

const { logout } = await import("./auth.service");

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

let names: Set<string>;
let storage: MemoryStorage;

beforeEach(() => {
  post.mockReset();
  names = new Set(["mse-trace-photos-v1", "mse-trace-photos-v0", "mse-trace-shell-v3"]);
  vi.stubGlobal("caches", {
    keys: async () => [...names],
    delete: async (name: string) => names.delete(name),
    open: async () => {
      throw new Error("sign-out must not read the caches");
    },
  });
  storage = new MemoryStorage();
  storage.setItem("mse-hidden-submissions:v1:u-1", JSON.stringify({ "MATERIAL_RECEIPT:r-1": { at: "x" } }));
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => vi.unstubAllGlobals());

describe("signing out", () => {
  it("clears the cached photos and keeps the app shell and the hide list", async () => {
    post.mockResolvedValueOnce({});
    await logout();
    expect([...names]).toEqual(["mse-trace-shell-v3"]);
    expect(storage.getItem("mse-hidden-submissions:v1:u-1")).not.toBeNull();
  });

  it("clears them even when the sign-out request gets no answer", async () => {
    post.mockRejectedValueOnce(new Error("offline"));
    await expect(logout()).rejects.toThrow("offline");
    expect([...names]).toEqual(["mse-trace-shell-v3"]);
  });

  it("still signs out when Cache Storage refuses", async () => {
    post.mockResolvedValueOnce({});
    vi.stubGlobal("caches", {
      keys: async () => {
        throw new Error("SecurityError");
      },
    });
    await expect(logout()).resolves.toBeUndefined();
  });
});
