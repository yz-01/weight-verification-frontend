import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every permission, permission group and preset role is named in every
 * language (I31, I34, IB11).
 *
 * The client's screenshot of the role editor: half the rows read
 * `permissions.code.safety.verify` and the like - 180 codes in the backend,
 * translations for 68 - and 「Headquarters」 sat in English among Chinese role
 * names. next-intl prints the key when a message is missing, so nothing failed.
 *
 * `permission-catalogue.json` is written by the backend
 * (`python manage.py write_permission_catalogue`) from its registry, its
 * English labels and its role templates. Adding a permission or a preset role
 * there means re-running that command; this test then fails until all four
 * catalogues translate the new keys.
 */

interface Snapshot {
  groups: { key: string; label: string }[];
  codes: { code: string; group: string; label: string }[];
  roles: { audience: string; code: string; name: string; description: string }[];
}

const LOCALES = ["en", "zh", "zh-TW", "ms"] as const;

function read<T>(relative: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), relative), "utf8")) as T;
}

const snapshot = read<Snapshot>("src/lib/permission-catalogue.json");

type Catalogue = {
  permissions?: { group?: Record<string, unknown>; code?: Record<string, Record<string, unknown>> };
  roles?: { system_?: Record<string, unknown>; systemDescription?: Record<string, unknown> };
};

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

describe("the backend's permission catalogue snapshot", () => {
  it("lists every group its codes belong to, once", () => {
    const groups = snapshot.groups.map((group) => group.key);
    expect(new Set(groups).size).toBe(groups.length);
    expect(new Set(snapshot.codes.map((row) => row.group))).toEqual(new Set(groups));
    // Each code nests under its own domain: `permissions.code.<domain>.<verb>`.
    for (const row of snapshot.codes) {
      expect(row.code.split(".")).toHaveLength(2);
      expect(row.label.trim()).not.toBe("");
    }
  });
});

describe.each([...LOCALES])("the %s catalogue", (locale) => {
  const catalogue = read<Catalogue>(`src/messages/${locale}.json`);
  const groups = catalogue.permissions?.group ?? {};
  const codes = catalogue.permissions?.code ?? {};

  it("names every permission group", () => {
    const missing = snapshot.groups
      .map((group) => group.key)
      .filter((key) => !filled(groups[key]));
    expect(missing).toEqual([]);
  });

  it("names every permission", () => {
    const missing = snapshot.codes
      .map((row) => row.code)
      .filter((code) => {
        const [domain, verb] = code.split(".");
        return !filled(codes[domain]?.[verb]);
      });
    expect(missing).toEqual([]);
  });

  it("keeps no name for a permission that no longer exists", () => {
    const known = new Set(snapshot.codes.map((row) => row.code));
    const knownGroups = new Set(snapshot.groups.map((group) => group.key));
    const orphans = [
      ...Object.entries(codes).flatMap(([domain, verbs]) =>
        Object.keys(verbs ?? {})
          .map((verb) => `${domain}.${verb}`)
          .filter((code) => !known.has(code)),
      ),
      ...Object.keys(groups)
        .filter((key) => !knownGroups.has(key))
        .map((key) => `group:${key}`),
    ];
    expect(orphans).toEqual([]);
  });

  it("names and describes every preset role", () => {
    const names = catalogue.roles?.system_ ?? {};
    const descriptions = catalogue.roles?.systemDescription ?? {};
    const missing = snapshot.roles.flatMap((role) => [
      ...(filled(names[role.code]) ? [] : [`system_.${role.code}`]),
      ...(filled(descriptions[role.code]) ? [] : [`systemDescription.${role.code}`]),
    ]);
    expect(missing).toEqual([]);
  });
});
