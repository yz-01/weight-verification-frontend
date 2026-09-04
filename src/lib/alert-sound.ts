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

/** True when the tone actually started. Never throws. */
export async function playAlertTone(): Promise<boolean> {
  try {
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
