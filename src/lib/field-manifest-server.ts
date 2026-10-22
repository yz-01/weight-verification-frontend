import { cookies } from "next/headers";

import { FIELD_BOOTSTRAP_COOKIE, fieldManifestHref } from "@/lib/field-install";

/**
 * The manifest link a field page is rendered with: the token-carrying one
 * when this browser tab holds a hand-off (its cookie), else the plain one.
 *
 * Rendered by the server on purpose. iPhone Safari installs from the
 * manifest it loaded for the page and keeps it; a link rewritten afterwards
 * in the browser is not read again (Lucas 2026-10-23).
 */
export async function fieldManifestFromCookie(): Promise<string> {
  const store = await cookies();
  return fieldManifestHref(store.get(FIELD_BOOTSTRAP_COOKIE)?.value);
}
