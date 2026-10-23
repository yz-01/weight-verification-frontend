/**
 * Whether this tab is private browsing, where everything the site keeps is
 * thrown away when the browser is closed.
 *
 * Lucas 2026-10-24: a client signed in with the link and PIN, swiped Safari
 * away, reopened it and had to type the PIN again - not reproducible on
 * Lucas's iPhone or iPad. The sign-in lives in this site's storage, which
 * survives closing Safari in a normal tab and not in a private one; no code
 * can keep it there. So the PIN screen says so instead.
 *
 * WebKit (Safari, and Chrome / every other browser on iPhone) refuses the
 * origin private file system in a private tab with "The operation failed for
 * an unknown transient reason". A normal tab gets the directory. Browsers
 * without the API (iOS before 15.2) answer false: nothing to go on, so
 * nothing is said rather than guessing.
 */
export async function isPrivateBrowsing(
  storage: { getDirectory?: () => Promise<unknown> } | undefined =
    typeof navigator === "undefined" ? undefined : navigator.storage,
): Promise<boolean> {
  if (typeof storage?.getDirectory !== "function") return false;
  try {
    await storage.getDirectory();
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /unknown transient reason/i.test(message);
  }
}
