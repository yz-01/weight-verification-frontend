"use client";

import { useEffect } from "react";

import {
  getFieldBootstrapToken,
  isStandaloneApp,
  readFieldBootstrapCookie,
  syncFieldBootstrapCookie,
} from "@/lib/auth-token";
import {
  detectInstallEnvironment,
  fieldManifestHref,
  manifestReloadNeeded,
} from "@/lib/field-install";

/** Fired by `setFieldBootstrapToken` when this tab gets a new hand-off. */
const FIELD_BOOTSTRAP_EVENT = "mse:field-bootstrap";

const RELOADED_KEY = "mse_field_manifest_reloaded";

function alreadyReloaded(): boolean {
  try {
    return window.sessionStorage.getItem(RELOADED_KEY) === "1";
  } catch {
    // Without session storage a reload could not be limited to once.
    return true;
  }
}

/**
 * Make "add to home screen" work from anywhere in the field app.
 *
 * A browser reads the manifest when somebody installs, and the `start_url`
 * it finds there is where the installed app opens for good. On iPhone that
 * app has storage of its own, so the start must carry the hand-off.
 *
 * iPhone Safari (iOS 26) installs from the manifest *the server rendered*:
 * WebKit loads the first `rel="manifest"` link once per page and keeps it, so
 * changing the link in the browser afterwards is not seen (Lucas 2026-10-23:
 * added from the workspace with Safari's own Share, the new icon opened on
 * "not linked"). So:
 *
 * 1. the hand-off is mirrored into a first-party cookie in a Safari tab, and
 *    the field layout renders the manifest link from it;
 * 2. a page that was rendered before the cookie existed (the first field page
 *    after this update, or a hand-off made on this page) loads itself once
 *    more, so its server-rendered link carries the hand-off;
 * 3. the link is still rewritten here as a last resort for browsers that read
 *    the manifest late.
 */
export function FieldManifestToken() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const rendered = link
      ? (() => {
          const url = new URL(link.getAttribute("href") ?? "", window.location.origin);
          return `${url.pathname}${url.search}`;
        })()
      : "";

    const sync = (allowReload: boolean) => {
      syncFieldBootstrapCookie();
      const held = getFieldBootstrapToken();
      if (
        allowReload &&
        manifestReloadNeeded({
          renderedHref: rendered,
          held,
          cookie: readFieldBootstrapCookie(),
          environment: detectInstallEnvironment(),
          standalone: isStandaloneApp(),
          alreadyReloaded: alreadyReloaded(),
        })
      ) {
        try {
          window.sessionStorage.setItem(RELOADED_KEY, "1");
        } catch {
          return;
        }
        window.location.reload();
        return;
      }
      if (!held || !link) return;
      const next = fieldManifestHref(held);
      if (next === "/field-manifest.webmanifest") return;
      const current = new URL(link.href, window.location.origin);
      if (`${current.pathname}${current.search}` !== next) link.href = next;
    };

    // Only on arrival. A hand-off made later on this page (the install banner
    // makes one and is already leaving for the ready page) must not start a
    // reload that races its navigation.
    sync(true);
    const later = () => sync(false);
    window.addEventListener(FIELD_BOOTSTRAP_EVENT, later);
    return () => window.removeEventListener(FIELD_BOOTSTRAP_EVENT, later);
  }, []);

  return null;
}
