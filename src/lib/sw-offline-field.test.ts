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
    if (url.includes("/_next/static/")) return new Response("/* chunk */");
    return new Response(`<html>${url}<script src="/_next/static/chunks/app-field.js"></script></html>`, {
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

  /** The worker installs: its shell cache exists, with the offline page. */
  async function install() {
    const waits: Promise<unknown>[] = [];
    listeners.get("install")!({ waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
    const shell = (await caches.keys()).find((name) => name.startsWith("mse-trace-shell-"))!;
    await (await caches.open(shell)).put(`${ORIGIN}/offline`, new Response("offline page"));
  }

  /**
   * A `fetch` made by the page (not a navigation): it passes the worker, which
   * answers it or lets it through to the network.
   */
  async function pageFetch(input: string | URL, init?: RequestInit) {
    const url = new URL(String(input), ORIGIN).href;
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url, method: init?.method ?? "GET", mode: "cors" },
      respondWith: (response: Promise<Response>) => {
        answer = response;
      },
      waitUntil: () => undefined,
    });
    return answer ? await answer : fetch({ url });
  }

  return { open, install, pageFetch, caches, net, fetch };
}

/**
 * The page the phone runs: the app's own warm-up (`lib/shell-cache`) with
 * this worker's caches and network, as `FieldStaffShell` calls it.
 */
async function warmUp(sw: ReturnType<typeof worker>, path: string) {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
  vi.stubGlobal("navigator", { onLine: sw.net.online });
  vi.stubGlobal("caches", sw.caches);
  vi.stubGlobal("fetch", sw.pageFetch);
  try {
    const { cacheShellPage } = await import("@/lib/shell-cache");
    return await cacheShellPage(path);
  } finally {
    vi.unstubAllGlobals();
  }
}

/**
 * The real way in (H12 review): the sign-in link, or the installed app's
 * start page, loads as a full page - and carries the token, so it is never
 * kept. It then moves to `/field-staff` with `router.replace`: a soft
 * navigation under the one root layout, which the worker never sees as a
 * page. Only the app's warm-up stores the field app's home.
 */
async function signInThroughBootstrap(sw: ReturnType<typeof worker>, { warm }: { warm: boolean }) {
  await sw.install();
  await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");
  // The soft navigation fetches the next page's data, not its document.
  await sw.pageFetch("/field-staff?_rsc=abc12");
  if (warm) expect(await warmUp(sw, "/field-staff")).toBe(true);
}

describe("the field app opens offline (H12)", () => {
  it("opens the installed app's start page offline after one normal online visit", async () => {
    const sw = worker();
    await signInThroughBootstrap(sw, { warm: true });
    sw.net.online = false;

    const start = await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");
    expect(start?.status).toBe(302);
    expect(start?.headers.get("Location")).toBe(`${ORIGIN}/field-staff`);

    const home = await sw.open("/field-staff");
    expect(home?.status).toBe(200);
    expect(await home!.text()).toContain(`${ORIGIN}/field-staff`);
  });

  it("without the warm-up the soft navigation leaves nothing to open - the gap it closes", async () => {
    const sw = worker();
    await signInThroughBootstrap(sw, { warm: false });
    sw.net.online = false;

    const start = await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");
    expect(await start!.text()).toBe("offline page");
  });

  it("does the same for the sign-in link's landing page", async () => {
    const sw = worker();
    await signInThroughBootstrap(sw, { warm: true });
    sw.net.online = false;

    const response = await sw.open("/trace/field-ready?bootstrap=abcdefghijklmnopqrstuvwxyz");

    expect(response?.status).toBe(302);
  });

  it("opens any address inside the field app from the stored home", async () => {
    const sw = worker();
    await signInThroughBootstrap(sw, { warm: true });
    sw.net.online = false;

    const response = await sw.open("/field-staff?tab=records&record=gate");

    expect(response?.status).toBe(200);
    expect(await response!.text()).toContain("/field-staff");
  });

  it("shows the offline page, not ERR_FAILED, on a phone that never opened the app", async () => {
    const sw = worker();
    await sw.install();
    sw.net.online = false;

    const response = await sw.open("/field-pwa-bootstrap?token=abcdefghijklmnopqrstuvwxyz");

    expect(await response!.text()).toBe("offline page");
  });

  it("never keeps a page whose address holds a sign-in or bootstrap token", async () => {
    const sw = worker();
    await signInThroughBootstrap(sw, { warm: true });
    await sw.open("/trace/field-ready?bootstrap=abcdefghijklmnopqrstuvwxyz");
    await sw.open("/trace/field-activate?token=abcdefghijklmnopqrstuvwxyz");
    await sw.open("/trace/reset-password?token=abc");
    await sw.open("/trace/field-login");
    // The warm-up refuses an address with a query at all.
    expect(await warmUp(sw, "/field-staff?token=abc")).toBe(false);

    const kept = sw.caches.cachedUrls();
    expect(kept.some((url) => /token=|bootstrap=|_rsc=/.test(url))).toBe(false);
    expect(kept).toContain(`${ORIGIN}/trace/field-login`);
    expect(kept).toContain(`${ORIGIN}/field-staff`);
  });

  it("stores the scripts the page names, which the first visit loaded before the worker ran", async () => {
    const sw = worker();
    await signInThroughBootstrap(sw, { warm: true });

    expect(sw.caches.cachedUrls()).toContain(`${ORIGIN}/_next/static/chunks/app-field.js`);
  });

  it("stores nothing before the worker has made its cache - never a guessed old name", async () => {
    const sw = worker();
    expect(await warmUp(sw, "/field-staff")).toBe(false);
    expect(await sw.caches.keys()).toEqual([]);
  });

  it("is what the field app does once it is open", () => {
    const shell = readFileSync(
      join(process.cwd(), "src", "components", "field-staff", "field-staff-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain('keepShellPageStored("/field-staff")');
  });

  it("bumps the shell cache so phones drop the old worker's copy", () => {
    expect(SOURCE).toMatch(/const CACHE_NAME = "mse-trace-shell-v15";/);
  });
});
