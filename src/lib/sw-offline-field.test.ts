import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

/**
 * H12 (事项12): 「手机断网后重新打开 H5，直接显示 ERR_FAILED」.
 *
 * The phone signs in through `/trace/field-ready?bootstrap=…` and the
 * installed app starts at `/field-pwa-bootstrap?token=…`. The service worker
 * sent both to the network with no fallback, and kept no copy of the field
 * app at all, so a phone opened offline had nothing to show. `sw.js` runs
 * here against an in-memory Cache Storage and a network that can be cut.
 */

const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "https://mse.example";

class MemoryCache {
  entries = new Map<string, Response>();
  private key(request: { url: string } | string, ignoreSearch = false) {
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN);
    if (ignoreSearch) url.search = "";
    return url.href;
  }
  async match(request: { url: string } | string, options?: { ignoreSearch?: boolean }) {
    const exact = this.entries.get(this.key(request));
    if (exact || !options?.ignoreSearch) return exact?.clone();
    const bare = this.key(request, true);
    for (const [key, value] of this.entries) {
      if (this.key(key, true) === bare) return value.clone();
    }
    return undefined;
  }
  async put(request: { url: string } | string, response: Response) {
    this.entries.set(this.key(request), response);
  }
  async delete(request: { url: string } | string) {
    return this.entries.delete(this.key(request));
  }
  async keys() {
    return [...this.entries.keys()].map((key) => new Request(key));
  }
  async addAll() {}
}

class MemoryCaches {
  stores = new Map<string, MemoryCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache());
    return this.stores.get(name)!;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async match(request: { url: string } | string, options?: { ignoreSearch?: boolean }) {
    for (const store of this.stores.values()) {
      const hit = await store.match(request, options);
      if (hit) return hit;
    }
    return undefined;
  }
  cachedUrls() {
    return [...this.stores.values()].flatMap((store) => [...store.entries.keys()]);
  }
}

type Listener = (event: Record<string, unknown>) => void;

function worker() {
  const listeners = new Map<string, Listener>();
  const caches = new MemoryCaches();
  const net = { online: true };
  const fetch = vi.fn(async (input: { url: string } | string) => {
    if (!net.online) throw new TypeError("Failed to fetch");
    const url = typeof input === "string" ? input : input.url;
    return new Response(`<html>${url}</html>`, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  });
  const self = {
    location: new URL(`${ORIGIN}/`),
    navigator: { onLine: true },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
  };
  runInNewContext(SOURCE, {
    self, caches, fetch, URL, Request, Response, Headers, Blob, Date, Number, String, Set, Promise, console,
  });

  /** A page opened in the browser: a navigation request. */
  async function open(path: string) {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url: `${ORIGIN}${path}`, method: "GET", mode: "navigate" },
      respondWith: (response: Promise<Response>) => {
        answer = response;
      },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    const response = answer ? await answer : undefined;
    await Promise.all(waits);
    return response;
  }

  return { open, caches, net, fetch };
}

describe("the field app opens offline (H12)", () => {
  it("sends the installed app's start page to the cached field app when offline", async () => {
    const sw = worker();
    await sw.open("/field-staff?tab=home");
    sw.net.online = false;

    const response = await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");

    expect(response?.status).toBe(302);
    expect(response?.headers.get("Location")).toBe(`${ORIGIN}/field-staff`);
  });

  it("does the same for the sign-in link's landing page", async () => {
    const sw = worker();
    await sw.open("/field-staff");
    sw.net.online = false;

    const response = await sw.open("/trace/field-ready?bootstrap=abcdefghijklmnopqrstuvwxyz");

    expect(response?.status).toBe(302);
  });

  it("shows the offline page, not ERR_FAILED, on a phone that never opened the app", async () => {
    const sw = worker();
    const offline = await sw.caches.open("mse-trace-shell-v15");
    await offline.put(`${ORIGIN}/offline`, new Response("offline page"));
    sw.net.online = false;

    const response = await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");

    expect(response).toBeDefined();
    expect(await response!.text()).toBe("offline page");
  });

  it("opens any address inside the field app from the cached app", async () => {
    const sw = worker();
    await sw.open("/field-staff?tab=home");
    sw.net.online = false;

    const response = await sw.open("/field-staff?tab=records&record=gate");

    expect(response?.status).toBe(200);
    expect(await response!.text()).toContain("/field-staff");
  });

  it("never keeps a page whose address holds a sign-in or bootstrap token", async () => {
    const sw = worker();
    await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");
    await sw.open("/trace/field-ready?bootstrap=abcdefghijklmnopqrstuvwxyz");
    await sw.open("/trace/field-activate?token=abcdefghijklmnopqrstuvwxyz");
    await sw.open("/trace/reset-password?token=abc");
    await sw.open("/trace/field-login");

    const kept = sw.caches.cachedUrls();
    expect(kept.some((url) => /token=|bootstrap=/.test(url))).toBe(false);
    expect(kept).toContain(`${ORIGIN}/trace/field-login`);
  });

  it("bumps the shell cache so phones drop the old worker's copy", () => {
    expect(SOURCE).toMatch(/const CACHE_NAME = "mse-trace-shell-v15";/);
  });
});
