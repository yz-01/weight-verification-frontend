/**
 * The number on the installed app's home-screen icon (J4, Q4).
 *
 * The client 10-20: the icon and the menus show a number, the bell's - unread
 * notices and to-dos, each once. Set wherever the bell's count changes and when
 * a push arrives (`public/sw.js`, from the push's `badge`); cleared at zero.
 * A browser without the Badging API (iPhone before 16.4, a desktop tab) is
 * skipped - the bell and the menus still show it.
 */
export function setAppBadgeCount(count: number): void {
  if (typeof navigator === "undefined") return;
  const badging = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) void badging.setAppBadge?.(count)?.catch(() => undefined);
    else void badging.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    // Not allowed here (an iframe, a browser that refuses) - nothing to show.
  }
}
