import { ApiError } from "@/interfaces/api";
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

/** Said on `window` when opening the app re-registered this phone, or could not (JB156). */
export const PUSH_REGISTRATION_CHANGED = "mse:push-registration-changed";

/**
 * Where the driver's 「通知」 switch turned pushes off on this phone. The
 * permission stays granted, so without it opening the app would register
 * the phone again behind the person's back (JB156).
 */
const PUSH_OFF_KEY = "mse.push.off";

function pushTurnedOff(): boolean {
  try {
    return window.localStorage.getItem(PUSH_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberPushOff(off: boolean): void {
  try {
    if (off) window.localStorage.setItem(PUSH_OFF_KEY, "1");
    else window.localStorage.removeItem(PUSH_OFF_KEY);
  } catch {
    // Storage refused: the switch holds for this visit only.
  }
}

/** One fresh registration per app open, however often the account reloads (JB156). */
let renewTried = false;
/** Opening the app could not register this phone; cleared by 「打开通知」. */
let registrationFailed = false;

/**
 * Whether this phone is registered for pushes - false too when registering
 * again on opening the app failed (JB156), so the hint and the bell offer
 * 「打开通知」 even while a dead registration is still on the phone.
 */
export async function getPushSubscriptionStatus(): Promise<boolean> {
  if (!isPushSupported() || registrationFailed) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return Boolean(await registration.pushManager.getSubscription());
}

/** The server's answer to a posted registration. */
interface SubscribeAnswer {
  /** Apple / Google had dropped it (404 / 410): register afresh (JB156). */
  expired?: boolean;
}

/**
 * This phone's registration, posted. `silent` when the app opens: a failure
 * there is never toasted - the hint offering 「打开通知」 says it. From the
 * tap, a refusal is toasted as before.
 */
async function postSubscription(
  subscription: PushSubscription,
  silent = false,
): Promise<{ expired: boolean }> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new PushEnableError("subscribe");
  const path = "/api/notifications/subscribe_push/";
  const body = { endpoint: json.endpoint, keys: json.keys, device_label: navigator.platform };
  const answer = await (silent
    ? api.post<SubscribeAnswer | undefined>(path, body, { silent: true })
    : api.post<SubscribeAnswer | undefined>(path, body));
  return { expired: Boolean(answer?.expired) };
}

function subscribeWith(registration: ServiceWorkerRegistration, publicKey: string) {
  return within(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey) as BufferSource,
    }),
    20_000,
    "subscribe",
  );
}

/**
 * This phone's registration taken off the server and the phone, best-effort:
 * the fresh one made next is what counts.
 */
async function dropSubscription(subscription: PushSubscription): Promise<void> {
  await within(
    api.post("/api/notifications/unsubscribe_push/", { endpoint: subscription.endpoint }, { silent: true }),
    5_000,
    "server",
  ).catch(() => undefined);
  await within(subscription.unsubscribe(), 10_000, "subscribe");
}

/** What opening the app did about this phone's registration (JB156). */
export type PushRefreshOutcome =
  /** No push in this browser. */
  | "unsupported"
  /** Not allowed yet, or refused: the hint asks, or says where to allow it. */
  | "not-granted"
  /** Turned off on purpose in the driver's settings: left off. */
  | "off"
  /** The server has no push keys: nothing to register with. */
  | "not-configured"
  /** None on the phone, and this open already tried to make one. */
  | "none"
  /** The registration the phone had, posted as before. */
  | "synced"
  /** Posting it did not reach the server; left as it was. */
  | "unreached"
  /** A fresh registration made and posted. */
  | "renewed"
  /** Could not register again: the hint shows 「打开通知」. */
  | "failed";

/**
 * Every app open (JB156, 客户 11-10 第四批: 「苹果手机重启了之后，声音红点都没有」).
 *
 * An iPhone sometimes loses this phone's registration - `getSubscription()`
 * comes back empty for an app still on the Home Screen, or Apple stops
 * knowing it and answers 404 / 410 - and the phone then stayed silent until
 * somebody pressed 「打开通知」 again. Now, with notifications already
 * allowed: none on the phone → register again, no tap needed; one the server
 * says Apple / Google dropped → drop it and register afresh. At most one
 * fresh registration per open, and nothing is thrown at the person: a failure
 * only brings the 「打开通知」 hint back. One that is there and fine is posted
 * as before, which also joins it to whoever just signed in (JB80).
 */
export async function refreshPushRegistration(): Promise<PushRefreshOutcome> {
  const outcome = await refreshOnce().catch((): PushRefreshOutcome => "failed");
  if (outcome === "failed") registrationFailed = true;
  if (outcome === "synced" || outcome === "renewed") registrationFailed = false;
  if ((outcome === "renewed" || outcome === "failed") && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(PUSH_REGISTRATION_CHANGED));
  }
  return outcome;
}

async function refreshOnce(): Promise<PushRefreshOutcome> {
  if (!isPushSupported()) return "unsupported";
  const registration = await within(navigator.serviceWorker.ready, 15_000, "worker");
  const current = await registration.pushManager.getSubscription();
  const granted = Notification.permission === "granted";
  if (current) {
    let answer: { expired: boolean };
    try {
      answer = await within(postSubscription(current, true), 15_000, "server");
    } catch {
      return "unreached";
    }
    if (!answer.expired) return "synced";
    if (!granted || renewTried) return "failed";
    renewTried = true;
    await within(current.unsubscribe(), 10_000, "subscribe");
  } else {
    if (!granted) return "not-granted";
    if (pushTurnedOff()) return "off";
    if (renewTried) return "none";
    renewTried = true;
  }
  const { configured, public_key: publicKey } = await within(
    getPushConfig({ silent: true }),
    15_000,
    "config",
  );
  if (!configured || !publicKey) return "not-configured";
  const fresh = await subscribeWith(registration, publicKey);
  const answer = await within(postSubscription(fresh, true), 15_000, "server");
  return answer.expired ? "failed" : "renewed";
}

/**
 * Turn this phone's notifications on. Throws a `PushEnableError` naming the
 * step that failed or took too long; resolves false when the person said no.
 *
 * `renew` (JB156): pressed again after a test push did not go - the old
 * registration is dropped and a fresh one made, inside the tap.
 */
export async function enablePushNotifications(
  options: { renew?: boolean } = {},
): Promise<boolean> {
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
  let existing = await registration.pushManager.getSubscription();
  if (existing && options.renew) {
    await dropSubscription(existing);
    existing = null;
  }
  let subscription = existing ?? (await subscribeWith(registration, publicKey));
  let answer = await within(postSubscription(subscription), 15_000, "server");
  if (answer.expired) {
    // JB156: Apple / Google had dropped the one on the phone - a fresh one, once.
    await within(subscription.unsubscribe(), 10_000, "subscribe");
    subscription = await subscribeWith(registration, publicKey);
    answer = await within(postSubscription(subscription), 15_000, "server");
    if (answer.expired) throw new PushEnableError("subscribe");
  }
  registrationFailed = false;
  rememberPushOff(false);
  return true;
}

export async function disablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;
  // Kept off when the app opens again (JB156).
  rememberPushOff(true);
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  const endpoint = subscription.endpoint;
  await api.post("/api/notifications/unsubscribe_push/", { endpoint });
  await subscription.unsubscribe();
  return true;
}

/** What 「发一条测试通知」 heard back (JB156). */
export type PushTestOutcome =
  | { sent: true }
  /** `code` names why (`errors.api.<code>`); `message` is the server's refusal, already worded. */
  | { sent: false; code: string; message?: string };

/**
 * 「发一条测试通知」 (JB156, 客户 11-10 第四批): the server pushes to this phone
 * only and says at once whether Apple / Google took it. Never throws.
 */
export async function sendTestPush(): Promise<PushTestOutcome> {
  try {
    if (!isPushSupported()) return { sent: false, code: "push_subscription_not_found" };
    const registration = await within(navigator.serviceWorker.ready, 15_000, "worker");
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { sent: false, code: "push_subscription_not_found" };
    const answer = await api.post<{ sent: boolean; error: string }>(
      "/api/notifications/send_test_push/",
      { endpoint: subscription.endpoint },
      { silent: true },
    );
    return answer.sent ? { sent: true } : { sent: false, code: answer.error || "push_provider_unreachable" };
  } catch (error) {
    if (error instanceof ApiError) return { sent: false, code: error.code, message: error.message };
    return { sent: false, code: "push_subscription_not_found" };
  }
}

/**
 * JB80 (客户 10-29 晚: 「不同公司、不同项目、不同用户的通知不会混乱」): signing
 * out stops this phone hearing that account's notices. The phone keeps its
 * permission and subscription, so the next account to sign in here is joined
 * to it again (`refreshPushRegistration` on every sign-in) - without this, the
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
