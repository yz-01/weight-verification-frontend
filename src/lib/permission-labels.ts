/**
 * Naming a permission in the reader's language (I31).
 *
 * The role editor used to print `permissions.code.safety.verify` wherever the
 * catalogue had no entry - half the grid, in the client's screenshot. Every
 * group and code is translated now, and `permission-catalogue.test.ts` keeps
 * it that way; this is the safety net under that guard. A missing message
 * falls back to the English the backend sends with the catalogue, and failing
 * that to a readable form of the code. Never to the raw key.
 *
 * Keys: `permissions.group.<group>` and `permissions.code.<domain>.<verb>` -
 * next-intl reads a dot as nesting, so the code's own dot nests the verb.
 */

import type { useTranslations } from "next-intl";

import type { PermissionEntry } from "@/interfaces/auth";

type Translate = ReturnType<typeof useTranslations>;

/** `material_target.manage` → `Material target: manage`. */
export function readablePermissionKey(key: string): string {
  const text = key.replace(/_/g, " ").replace(/\./g, ": ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

export function permissionLabel(
  entry: Pick<PermissionEntry, "code" | "label">,
  t: Translate,
): string {
  const key = `permissions.code.${entry.code}`;
  if (t.has(key)) return t(key);
  return entry.label?.trim() || readablePermissionKey(entry.code);
}

export function permissionGroupLabel(
  group: string,
  fallback: string | undefined,
  t: Translate,
): string {
  const key = `permissions.group.${group}`;
  if (t.has(key)) return t(key);
  return fallback?.trim() || readablePermissionKey(group);
}
