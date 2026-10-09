/**
 * A short alert tone for notices that are worth interrupting someone for.
 *
 * Synthesised rather than loaded from a file: the artifact/CSP surface here
 * only admits a narrow set of hosts, and a missing audio file would fail
 * silently in exactly the situation the sound exists for.
 *
 * Browsers refuse to start audio until the person has interacted with the
 * page, and that refusal is correct — a page that could make noise before you
 * touched it would be worse. So this reports honestly whether it played, and
 * callers must not present the sound as guaranteed.
 */

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  // One context for the tab. Creating one per beep leaks them: browsers cap
  // the number a page may hold, and the cap is reached long before anyone
  // notices the sound has quietly stopped working.
  context ??= new Ctor();
  return context;
}

/**
 * Whether the person has touched this tab yet (2026-10-09).
 *
 * Browsers only let a page make noise after a click or a key press, and a
 * page that tried before then would only collect a console warning. So the
 * tone is not even attempted until then: the browser's own "has been active"
 * flag where it has one, and our own listener below where it does not.
 */
let interacted = false;
let unlockInstalled = false;
const readyListeners = new Set<() => void>();

function browserSaysActive(): boolean {
  if (typeof navigator === "undefined") return false;
  const activation = (navigator as { userActivation?: { hasBeenActive?: boolean } })
    .userActivation;
  return Boolean(activation?.hasBeenActive);
}

/** True once this tab has been clicked or typed in. */
export function alertSoundUnlocked(): boolean {
  return interacted || browserSaysActive();
}

/**
 * Start listening for the first click or key press, and wake the audio
 * device then, inside the gesture, where the browser allows it. Idempotent.
 */
export function installAlertSoundUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  const unlock = () => {
    interacted = true;
    for (const type of events) window.removeEventListener(type, unlock, true);
    const ctx = audioContext();
    void (ctx && ctx.state === "suspended" ? ctx.resume() : Promise.resolve())
      .catch(() => undefined)
      .finally(() => readyListeners.forEach((listener) => listener()));
  };
  for (const type of events) window.addEventListener(type, unlock, true);
}

/** Be told when the first interaction has unlocked the sound. */
export function onAlertSoundUnlocked(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/** True when the tone actually started. Never throws. */
export async function playAlertTone(): Promise<boolean> {
  try {
    // Never before the person has touched the tab: the browser would refuse,
    // and the bell shows a small "turn the sound on" hint instead.
    if (!alertSoundUnlocked()) return false;
    const ctx = audioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      // Only succeeds if this call is inside a user gesture, or the person has
      // already interacted with the page at some point.
      await ctx.resume();
    }
    if (ctx.state !== "running") return false;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    // Two short rising notes: distinguishable from a system chime, and short
    // enough not to be the thing people mute the tab to escape.
    for (const [index, frequency] of [880, 1174.66].entries()) {
      const start = now + index * 0.18;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      // Ramped, not switched: an abrupt gain change clicks.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.start(start);
      osc.stop(start + 0.18);
    }
    return true;
  } catch {
    // A blocked or unavailable audio device is not an error worth surfacing:
    // the notification itself still arrived and is visible.
    return false;
  }
}

/** Whether a notification asked to be sounded. */
export function wantsAlertSound(data: unknown): boolean {
  return Boolean(
    data && typeof data === "object" && (data as { alert_sound?: unknown }).alert_sound,
  );
}

/** Where one person's "sound off" choice is kept, in this browser. */
export function alertSoundMuteKey(userId: string | undefined): string {
  return `mse.alert-sound.muted:${userId ?? "anonymous"}`;
}

export function readAlertSoundMuted(userId: string | undefined): boolean {
  try {
    return window.localStorage.getItem(alertSoundMuteKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeAlertSoundMuted(userId: string | undefined, muted: boolean): void {
  try {
    if (muted) window.localStorage.setItem(alertSoundMuteKey(userId), "1");
    else window.localStorage.removeItem(alertSoundMuteKey(userId));
  } catch {
    // Private windows and blocked storage: the choice lasts for this page only.
  }
}

/** What one look at the notice list did about the sound. */
export type SoundOutcome = "none" | "played" | "blocked" | "muted";

interface NoticeLike {
  id: string;
  data?: unknown;
}

/**
 * Rings once for each notice that is new to this tab (2026-10-09).
 *
 * Lucas: 「手机端的任何申请后台都需要收到通知 … 然后有 notification 和声音
 * 提示」. The bell's list is read on the live stream's `notification.created`
 * and whenever the polled count moves, so both arrive here; a notice is
 * remembered by id and never sounds twice, whichever path brought it.
 *
 * The first answer is the backlog already waiting when the page opened: it is
 * remembered, not rung - beeping through a pile on every page load is how
 * people turn the sound off for good.
 */
export function createNoticeSounder(options: {
  play: () => Promise<boolean>;
  /** Whether this notice should ring at all (the office: every one). */
  rings: (notice: NoticeLike) => boolean;
  muted: () => boolean;
}) {
  const seen = new Set<string>();
  let primed = false;
  return {
    async observe(notices: readonly NoticeLike[] | undefined): Promise<SoundOutcome> {
      if (notices === undefined) return "none";
      if (!primed) {
        primed = true;
        notices.forEach((notice) => seen.add(notice.id));
        return "none";
      }
      const fresh = notices.filter((notice) => !seen.has(notice.id) && options.rings(notice));
      notices.forEach((notice) => seen.add(notice.id));
      if (fresh.length === 0) return "none";
      if (options.muted()) return "muted";
      // One tone for a batch: three notices in one refresh are one interruption.
      return (await options.play()) ? "played" : "blocked";
    },
  };
}
