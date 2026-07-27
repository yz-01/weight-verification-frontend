import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(onChange: () => void) {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the viewport is phone-sized.
 *
 * Uses `useSyncExternalStore` rather than seeding state from an effect. The
 * effect version renders once with the wrong answer and corrects itself on the
 * next tick, which on a phone shows as the sidebar flashing into its desktop
 * layout before collapsing.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // The server has no viewport. Assume desktop, matching the layout the
    // markup is authored for, so hydration has nothing to correct.
    () => false,
  );
}
