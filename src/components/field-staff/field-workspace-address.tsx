"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  getFieldBootstrapToken,
  isStandaloneApp,
  setFieldBootstrapToken,
} from "@/lib/auth-token";
import {
  detectInstallEnvironment,
  fieldWorkspaceAddress,
  showIosInstallGuide,
} from "@/lib/field-install";
import { createFieldPwaBootstrap } from "@/services/field-access.service";

/** One request per page load at most, however often the effect runs. */
let creating: Promise<string | null> | null = null;

function ensureToken(): Promise<string | null> {
  const held = getFieldBootstrapToken();
  if (held) return Promise.resolve(held);
  creating ??= createFieldPwaBootstrap()
    .then((fresh) => {
      setFieldBootstrapToken(fresh.token);
      return fresh.token;
    })
    .catch(() => null);
  return creating;
}

/** Test seam: forget the in-flight request between tests. */
export function resetWorkspaceAddressForTests(): void {
  creating = null;
}

/**
 * Keep the live hand-off on the address of every workspace page in an iPhone
 * browser tab, and off it inside the installed app (`fieldWorkspaceAddress`).
 *
 * Rendered only once the worker is signed in. The address is changed with
 * `history.replaceState`, which the App Router follows, so the page does not
 * reload and no history entry is added.
 */
export function FieldWorkspaceAddress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    let cancelled = false;
    const apply = (token: string | null) => {
      if (cancelled) return;
      const address = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const next = fieldWorkspaceAddress({
        address,
        token,
        standalone: isStandaloneApp(),
        environment: detectInstallEnvironment(),
      });
      if (next) window.history.replaceState(window.history.state, "", next);
    };
    const sync = () => {
      const tab = showIosInstallGuide({
        environment: detectInstallEnvironment(),
        standalone: isStandaloneApp(),
      });
      if (!tab) {
        apply(null);
        return;
      }
      void ensureToken().then(apply);
    };
    sync();
    // A newer hand-off made in this tab (the install banner) replaces the one
    // on the address; so does coming back to the tab after one was made.
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [pathname, query]);

  return null;
}
