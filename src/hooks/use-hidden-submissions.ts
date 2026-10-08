import * as React from "react";

import {
  HIDDEN_SUBMISSIONS_CHANGED,
  readHidden,
  type HiddenMap,
} from "@/lib/hidden-submissions";

function subscribe(onChange: () => void) {
  window.addEventListener(HIDDEN_SUBMISSIONS_CHANGED, onChange);
  // Another tab of the app on the same phone.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HIDDEN_SUBMISSIONS_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The records this worker took off their own list (`lib/hidden-submissions`).
 *
 * The snapshot is the stored string, so React sees a new value only when the
 * list really changed; parsed once per change.
 */
export function useHiddenSubmissions(userId: string | undefined): HiddenMap {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => (userId ? JSON.stringify(readHidden(userId)) : "{}"),
    () => "{}",
  );
  return React.useMemo(() => JSON.parse(raw) as HiddenMap, [raw]);
}
