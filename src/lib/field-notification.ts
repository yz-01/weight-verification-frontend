/**
 * Where a notification takes a field worker, if anywhere.
 *
 * The field app is a different set of routes from the office console, so an
 * href written for the office cannot be pushed at a phone. What this used to
 * do with one was send the worker to `/field-staff` - the home screen. The
 * customer's complaint was 「每个通知也是可以点进去看细节的」, and landing on the
 * home after tapping a notification about a specific delivery is the same
 * answer as landing nowhere, only more confusing: it looks like the app
 * decided to go there (F-273).
 *
 * So an office path now returns `null`, meaning "no destination on this app",
 * and the caller opens the notification where it stands instead of navigating.
 * Two things follow from that, and both are deliberate:
 *
 * - A worker always gets to read the whole message, which is what they needed
 *   from a notification with no screen behind it.
 * - The office path is no longer quietly swallowed, so the fix for a
 *   notification that *should* have a field destination belongs where the href
 *   is written - on the server, per notifier - rather than being guessed at
 *   here. Guessing would mean a table of office-to-field translations that
 *   nobody updates when a route moves.
 *
 * The hazard-thread branch is kept and is the one exception, because that
 * link's shape is the field app's own. See T-211 and F-317 for what it can and
 * cannot currently open.
 */
export function fieldNotificationHref(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/")) return null;

  const parsed = new URL(href, "https://field.mse-trace.local");
  const thread = parsed.searchParams.get("thread");
  if (thread) {
    return `/field-staff?tab=incidents&thread=${encodeURIComponent(thread)}`;
  }

  // Field paths pass through with their query intact; everything else has no
  // destination here. Returning the home screen was the bug.
  return parsed.pathname === "/field-staff"
    ? `${parsed.pathname}${parsed.search}`
    : null;
}
