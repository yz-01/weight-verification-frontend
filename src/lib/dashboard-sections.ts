/**
 * Which project-dashboard sections a viewer has opened (F7, Q21).
 *
 * 「安全巡检与整改、施工计划进度可以收起来」: every section under the six cards
 * starts collapsed, and each one a viewer opens stays open for them next time.
 * A per-viewer convenience, so it lives in this browser's storage under the
 * viewer's id - two accounts on one office PC keep their own choice - and a
 * storage that cannot be read (private window, blocked site data) only means
 * everything starts collapsed.
 */
const PREFIX = "mse.dashboard.openSections.";
const CHANGED = "mse-dashboard-sections";

/** Where the choice is kept when the browser refuses storage: this visit only. */
const memory = new Map<string, string>();

function key(viewer: string) {
  return PREFIX + (viewer || "anonymous");
}

/** The raw stored value: a stable string, for `useSyncExternalStore`. */
export function readOpenSectionsRaw(viewer: string): string {
  try {
    return window.localStorage.getItem(key(viewer)) ?? "";
  } catch {
    return memory.get(key(viewer)) ?? "";
  }
}

export function parseOpenSections(raw: string): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function setSectionOpen(viewer: string, section: string, open: boolean): void {
  const sections = parseOpenSections(readOpenSectionsRaw(viewer));
  if (open) sections.add(section);
  else sections.delete(section);
  const raw = JSON.stringify([...sections].sort());
  memory.set(key(viewer), raw);
  try {
    window.localStorage.setItem(key(viewer), raw);
  } catch {
    // Storage refused: the section still opens for this visit, it just will
    // not be remembered.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Calls `onChange` when this tab or another one changes the choice. */
export function subscribeOpenSections(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
