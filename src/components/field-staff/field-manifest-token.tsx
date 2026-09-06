"use client";

import { useEffect } from "react";

import { getFieldBootstrapToken } from "@/lib/auth-token";

/**
 * Make "add to home screen" work from anywhere in the field app.
 *
 * A browser reads the manifest at the moment somebody installs, and the
 * `start_url` it finds there is where the installed app opens for the rest of
 * its life. Only one page ever offered a manifest carrying the handoff token:
 * `/trace/field-ready`, the screen shown immediately after a PIN. Every other
 * field page declares the plain manifest, whose `start_url` is the PIN screen.
 *
 * So a worker who installed the app the ordinary way — Share, Add to Home
 * Screen, from whichever screen they happened to be on — got an app that
 * opens on the PIN. Forever. That is "I installed it and it still asks for
 * the PIN" (F-206), and it is worse on iOS, where a home-screen app gets its
 * own storage and cannot fall back on the session the browser already had.
 *
 * This points the manifest link at the token-carrying URL on every field
 * page, so wherever the install happens the installed app starts at the
 * bootstrap route and signs itself in. The token is not spent by being used:
 * the server extends it on each restore and retires it only when the PIN
 * window ends, the link is reissued, or the account stops being able to sign
 * in — which is exactly when a PIN should be asked for again.
 *
 * The href is rewritten rather than a second link being added. A browser
 * installs the *first* `rel="manifest"` it finds and ignores the rest, so
 * adding one would be a no-op on every page whose layout already declares
 * one — the same trap F-172 was.
 */
export function FieldManifestToken() {
  useEffect(() => {
    const token = getFieldBootstrapToken();
    if (!token) return;

    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    if (!link) return;

    const next = `/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`;
    // Compared as a pathname+search rather than against `link.href`, which the
    // DOM has already resolved to an absolute URL.
    const current = `${new URL(link.href, window.location.origin).pathname}${
      new URL(link.href, window.location.origin).search
    }`;
    if (current === next) return;
    link.href = next;
  }, []);

  return null;
}
