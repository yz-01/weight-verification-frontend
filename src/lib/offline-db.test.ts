import { describe, expect, it } from "vitest";

import { upgradeOfflineStores } from "@/lib/offline-db";

/**
 * Version 4 adds the originals store (H5 三, WP1). A phone upgrading from
 * version 3 has queued jobs in it - work the server has not accepted yet - so
 * the upgrade may only add what is missing and never recreate a store.
 */
function fakeDatabase(existing: string[]) {
  const stores = new Set(existing);
  const created: Array<{ name: string; indexes: string[] }> = [];
  return {
    created,
    objectStoreNames: { contains: (name: string) => stores.has(name) } as DOMStringList,
    createObjectStore(name: string) {
      if (stores.has(name)) throw new Error(`${name} already exists`);
      stores.add(name);
      const entry = { name, indexes: [] as string[] };
      created.push(entry);
      return {
        createIndex: (index: string) => {
          entry.indexes.push(index);
        },
      } as unknown as IDBObjectStore;
    },
  };
}

describe("upgradeOfflineStores", () => {
  it("adds only the originals store to a version 3 database", () => {
    const database = fakeDatabase(["jobs", "driverSnapshots", "recyclerSnapshots"]);
    upgradeOfflineStores(database);
    expect(database.created).toEqual([{ name: "originals", indexes: ["ownerId", "sha256"] }]);
  });

  it("builds every store on a new phone", () => {
    const database = fakeDatabase([]);
    upgradeOfflineStores(database);
    expect(database.created.map((store) => store.name)).toEqual([
      "jobs",
      "driverSnapshots",
      "recyclerSnapshots",
      "originals",
    ]);
  });
});
