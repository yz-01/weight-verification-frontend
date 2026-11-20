import { useSyncExternalStore } from "react";

import { detectInstallEnvironment, isHandheldEnvironment } from "@/lib/field-install";

/** The device does not change while the page is open: nothing to listen to. */
function subscribe() {
  return () => undefined;
}

/**
 * Whether this is a phone or a tablet, by the device rather than the window's
 * width (`useIsMobile`). A form somebody fills at a desk (JB223 audit F3)
 * keeps its computer box in a narrow or zoomed window.
 */
export function useIsHandheldDevice(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isHandheldEnvironment(detectInstallEnvironment()),
    // The server knows no device. Assume a computer, as `useIsMobile` does.
    () => false,
  );
}
