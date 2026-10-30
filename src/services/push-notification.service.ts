import { api } from "@/services/api-client";

export interface PushConfig {
  configured: boolean;
  public_key: string;
}

export function getPushConfig(
  options: { silent?: boolean } = {},
): Promise<PushConfig> {
  return api.get<PushConfig>(
    "/api/notifications/get_push_config/",
    undefined,
    options,
  );
}

function decodeVapidKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushSubscriptionStatus(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return Boolean(await registration.pushManager.getSubscription());
}

export async function syncPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await api.post("/api/notifications/subscribe_push/", {
    endpoint: json.endpoint,
    keys: json.keys,
    device_label: navigator.platform,
  });
  return true;
}

/** The step 「打开通知」 stopped at, for the screen to name (Lucas 10-30: it
 * spun for ever on an iPhone). */
export type PushStep = "permission" | "config" | "worker" | "subscribe" | "server";

export class PushEnableError extends Error {
  constructor(readonly step: PushStep) {
    super(`push: ${step}`);
  }
}

/** ``promise``, or a ``PushEnableError`` at ``step`` after ``ms``. */
function within<T>(promise: Promise<T>, ms: number, step: PushStep): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PushEnableError(step)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(new PushEnableError(step));
      },
    );
  });
}

/**
 * The service worker that receives pushes, registered again if the page
 * has none - `serviceWorker.ready` alone waits for ever when the first
 * registration failed.
 */
async function pushWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }
  return navigator.serviceWorker.ready;
}

/**
 * Turn this phone's notifications on. Throws a `PushEnableError` naming the
 * step that failed or took too long; resolves false when the person said no.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;
  // The setting is asked for alongside, not first: an iPhone shows the
  // permission question only straight from the tap, and a network wait in
  // between left it unanswered - the button spun for ever.
  const config = getPushConfig();
  config.catch(() => undefined);
  const permission =
    Notification.permission === "default"
      ? await within(Notification.requestPermission(), 60_000, "permission")
      : Notification.permission;
  if (permission !== "granted") return false;
  const { configured, public_key: publicKey } = await within(config, 15_000, "config");
  if (!configured || !publicKey) throw new PushEnableError("config");
  const registration = await within(pushWorker(), 15_000, "worker");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await within(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey) as BufferSource,
      }),
      20_000,
      "subscribe",
    ));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new PushEnableError("subscribe");
  await within(
    api.post("/api/notifications/subscribe_push/", {
      endpoint: json.endpoint,
      keys: json.keys,
      device_label: navigator.platform,
    }),
    15_000,
    "server",
  );
  return true;
}

export async function disablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  const endpoint = subscription.endpoint;
  await api.post("/api/notifications/unsubscribe_push/", { endpoint });
  await subscription.unsubscribe();
  return true;
}

/**
 * JB80 (客户 10-29 晚: 「不同公司、不同项目、不同用户的通知不会混乱」): signing
 * out stops this phone hearing that account's notices. The phone keeps its
 * permission and subscription, so the next account to sign in here is joined
 * to it again (`syncPushSubscription` on every sign-in) - without this, the
 * one who signed out went on ringing on a phone somebody else now used.
 * Best-effort and bounded: signing out never waits on it for long.
 */
export async function detachPushFromAccount(timeoutMs = 3000): Promise<void> {
  if (!isPushSupported()) return;
  const detach = (async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await api.post(
      "/api/notifications/unsubscribe_push/",
      { endpoint: subscription.endpoint },
      { silent: true },
    );
  })().catch(() => undefined);
  await Promise.race([
    detach,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
