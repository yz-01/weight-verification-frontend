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

export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const config = await getPushConfig();
  if (!config.configured || !config.public_key) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(config.public_key) as BufferSource,
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await api.post("/api/notifications/subscribe_push/", {
    endpoint: json.endpoint,
    keys: json.keys,
    device_label: navigator.platform,
  });
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
