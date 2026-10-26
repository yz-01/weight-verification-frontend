import { type InstallEnvironment, isIosEnvironment } from "@/lib/field-install";

/**
 * What the field phone tells its worker about sound and the icon's number (JB36).
 *
 * 客户 10-26 事项 11: 「iPhone/Android 开机状态等候信息也无法接收通知声音」 and
 * 「图2图3红点，通知要显示在桌面的图标上」. Both need the phone's own
 * notifications, and those depend on how the app was put on the phone - which
 * we cannot change from here, only say:
 *
 * - **iPhone**: push and the icon's number exist only in an app added to the
 *   Home Screen from Safari, on iOS 16.4 or later, with notifications allowed.
 *   In a Safari tab the install banner already says to add it, so nothing more
 *   is said here.
 * - **Android**: the icon's number is the launcher counting the app's
 *   notifications. An app installed from Chrome (「安装应用」) has its own; a
 *   shortcut a browser puts on the home screen - Samsung Internet's has the
 *   browser's small logo on the icon (the client's 图 15) - belongs to the
 *   browser, so its icon never shows one.
 * - **Everywhere**: notifications must be allowed, and this phone subscribed.
 *
 * Plain data, so the rules are tested without a phone.
 */
export type FieldAlertsAdvice =
  /** Android in a browser tab, or a browser's home-screen shortcut. */
  | "android-install"
  /** An iPhone app that cannot receive push: iOS older than 16.4. */
  | "ios-update"
  /** Allowed nowhere yet: one tap asks the phone. */
  | "turn-on"
  /** The worker (or the phone) said no: only the phone's settings undo it. */
  | "denied";

export type FieldAlertsInput = {
  environment: InstallEnvironment;
  standalone: boolean;
  /** Samsung Internet: its home-screen icons are its own shortcuts. */
  samsungBrowser: boolean;
  /** Service worker, PushManager and Notification all present. */
  pushSupported: boolean;
  /** The server has its push keys; without them there is nothing to turn on. */
  pushConfigured: boolean;
  permission: NotificationPermission | "unsupported";
  /** This phone has a push subscription. */
  subscribed: boolean;
};

export function fieldAlertsAdvice(input: FieldAlertsInput): FieldAlertsAdvice[] {
  const advice: FieldAlertsAdvice[] = [];
  if (isIosEnvironment(input.environment)) {
    // A Safari tab: the install banner comes first; push cannot work there.
    if (!input.standalone) return advice;
    if (!input.pushSupported) return ["ios-update"];
  } else if (input.environment === "android") {
    if (!input.standalone || input.samsungBrowser) advice.push("android-install");
  }
  if (!input.pushSupported || !input.pushConfigured) return advice;
  if (input.permission === "denied") advice.push("denied");
  else if (input.permission !== "granted" || !input.subscribed) advice.push("turn-on");
  return advice;
}

export function isSamsungBrowser(userAgent: string): boolean {
  return /SamsungBrowser/i.test(userAgent);
}

/** Where 「知道了」 on one piece of advice is remembered, on this phone. */
export function fieldAlertsDismissKey(advice: FieldAlertsAdvice): string {
  return `mse.field-alerts.dismissed:${advice}`;
}
