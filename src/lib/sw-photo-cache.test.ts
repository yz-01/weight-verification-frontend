import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { PHOTO_CACHE_PRUNE } from "@/lib/photo-cache";

/**
 * The service worker's thumbnail cache (`public/sw.js`, client 2026-10-09
 * 二.5, 五.4, 五.8, 四.2).
 *
 * `sw.js` runs here as it does on the phone - a classic script with a `self`
 * - against an in-memory Cache Storage and a fake network, so what it keeps,
 * what it fetches and what it leaves alone are checked without a browser.
 */

const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const BUCKET = "https://ap-south-1.linodeobjects.com/weight-verification";
const THUMB = `${BUCKET}/evidence/thumbnails/v2/w400/a1.webp`;
const DAY = 24 * 60 * 60 * 1000;

class MemoryCache {
  entries = new Map<string, Response>();
  private key(request: Request | string, ignoreSearch = false) {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (ignoreSearch) url.search = "";
    return url.href;
  }
  async match(request: Request | string, options?: { ignoreSearch?: boolean }) {
    const exact = this.entries.get(this.key(request));
    if (exact || !options?.ignoreSearch) return exact?.clone();
    const bare = this.key(request, true);
    for (const [key, value] of this.entries) {
      if (this.key(key, true) === bare) return value.clone();
    }
    return undefined;
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(this.key(request), response);
  }
  async delete(request: Request | string) {
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
  async match(request: Request | string) {
    for (const store of this.stores.values()) {
      const hit = await store.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

type Listener = (event: Record<string, unknown>) => void;

/** One service worker, freshly started, with its own cache and network. */
function worker(network: (input: string | Request, init?: RequestInit) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const caches = new MemoryCaches();
  const fetch = vi.fn(network);
  const self = {
    location: new URL("https://mse.example/"),
    navigator: { onLine: true },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
  };
  runInNewContext(SOURCE, {
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
    Headers,
    Blob,
    Date,
    Number,
    String,
    Set,
    Promise,
    console,
  });

  /** Fire a fetch; `undefined` when the worker leaves it to the browser. */
  async function get(url: string) {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: new Request(url),
      respondWith: (response: Promise<Response>) => {
        answer = response;
      },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    const response = answer ? await answer : undefined;
    await Promise.all(waits);
    return response;
  }

  async function message(data: unknown) {
    const waits: Promise<unknown>[] = [];
    listeners.get("message")!({ data, waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  }

  async function activate() {
    const waits: Promise<unknown>[] = [];
    listeners.get("activate")!({ waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  }

  return { get, message, activate, fetch, caches, self };
}

const picture = (bytes = 20_000) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { "Content-Type": "image/webp" } });

const photos = async (sw: ReturnType<typeof worker>) =>
  sw.caches.stores.get("mse-trace-photos-v1") ?? new MemoryCache();

describe("the service worker keeps thumbnails", () => {
  it("downloads a thumbnail once, whatever signature its link carries", async () => {
    const sw = worker(async () => picture());

    const first = await sw.get(`${THUMB}?X-Amz-Date=20261009T000000Z&X-Amz-Signature=aaa`);
    const again = await sw.get(`${THUMB}?X-Amz-Date=20261009T005000Z&X-Amz-Signature=bbb`);

    expect(first?.status).toBe(200);
    expect(again?.status).toBe(200);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    // Read with CORS, so the cache holds the real ~20 KB, not an opaque blob.
    expect(sw.fetch.mock.calls[0][1]).toMatchObject({ mode: "cors", credentials: "omit" });
    expect([...(await photos(sw)).entries.keys()]).toEqual([THUMB]);
  });

  it("falls back to the plain request when the bucket sends no CORS headers, and keeps nothing", async () => {
    const sw = worker(async (_input, init) => {
      if (init?.mode === "cors") throw new TypeError("Failed to fetch");
      return new Response(null, { status: 200 });
    });

    const response = await sw.get(`${THUMB}?sig=1`);

    expect(response?.status).toBe(200);
    expect((await photos(sw)).entries.size).toBe(0);
    // That bucket is not asked with CORS again until the worker restarts.
    sw.fetch.mockClear();
    await sw.get(`${BUCKET}/evidence/thumbnails/v2/w400/b2.webp?sig=2`);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    expect(sw.fetch.mock.calls[0][1]).toBeUndefined();
  });

  it("keeps nothing that failed", async () => {
    const sw = worker(async () => new Response("expired", { status: 403 }));

    const response = await sw.get(`${THUMB}?sig=old`);

    expect(response?.status).toBe(403);
    expect((await photos(sw)).entries.size).toBe(0);
  });

  it("leaves full photos, the API's thumbnail maker and other hosts' files to the browser", async () => {
    const sw = worker(async () => picture());

    expect(await sw.get(`${BUCKET}/evidence/watermarked/v2/a1.jpg?sig=1`)).toBeUndefined();
    expect(await sw.get("https://api.example/api/evidence/thumbnails/tok3n/")).toBeUndefined();
    expect(await sw.get("https://api.example/api/my-submissions/get_my_submissions/")).toBeUndefined();
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("drops thumbnails first kept longer ago than the history window", async () => {
    const sw = worker(async () => picture());
    const cache = await sw.caches.open("mse-trace-photos-v1");
    const keptAt = (days: number) =>
      new Response("x", { headers: { "x-mse-kept-at": String(Date.now() - days * DAY) } });
    await cache.put(`${BUCKET}/evidence/thumbnails/v2/w400/old.webp`, keptAt(200));
    await cache.put(`${BUCKET}/evidence/thumbnails/v2/w400/recent.webp`, keptAt(10));

    await sw.message({ type: PHOTO_CACHE_PRUNE, days: 180 });
    expect([...cache.entries.keys()]).toEqual([`${BUCKET}/evidence/thumbnails/v2/w400/recent.webp`]);

    // A company with a shorter window: the page says so, and it applies.
    await sw.message({ type: PHOTO_CACHE_PRUNE, days: 7 });
    expect(cache.entries.size).toBe(0);
  });

  it("holds the cache to 2000 thumbnails, the oldest out first", async () => {
    const sw = worker(async () => picture());
    const cache = await sw.caches.open("mse-trace-photos-v1");
    for (let index = 0; index < 2005; index += 1) {
      await cache.put(
        `${BUCKET}/evidence/thumbnails/v2/w400/${index}.webp`,
        new Response("x", { headers: { "x-mse-kept-at": String(Date.now()) } }),
      );
    }

    await sw.message({ type: PHOTO_CACHE_PRUNE, days: 180 });

    const left = [...cache.entries.keys()];
    expect(left).toHaveLength(2000);
    expect(left[0]).toBe(`${BUCKET}/evidence/thumbnails/v2/w400/5.webp`);
  });

  it("keeps the thumbnails through an app update, and still drops old shells", async () => {
    const sw = worker(async () => picture());
    await sw.get(`${THUMB}?sig=1`);
    await sw.caches.open("mse-trace-shell-v1");

    await sw.activate();

    const names = await sw.caches.keys();
    expect(names).toContain("mse-trace-photos-v1");
    expect(names).not.toContain("mse-trace-shell-v1");
  });
});
