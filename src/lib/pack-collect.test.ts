/**
 * Multi Engine's 「添加资料」 on the modules' own lists (2026-10-10, 客户
 * 「添加资料及勾选关联优化」): which package is being put together survives
 * moving between modules and a reload (二 8), the way into each module opens
 * it on the package's project (三 8), and a list knows which rows can still
 * be ticked (补充 3).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { PackRowStatus } from "@/interfaces/contractor-ops";
import {
  PACK_PARAM,
  PACK_STORAGE_KEY,
  PACK_TARGETS,
  collectHref,
  keepTickable,
  packageHref,
  parseCollecting,
  readCollecting,
  resolveCollecting,
  showsPackColumn,
  tickableIds,
  writeCollecting,
  type KeyValueStore,
} from "@/lib/pack-collect";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const A = { id: "pkg-a", name: "三月进度 Claim", project: "p-1" };

describe("which package is being put together", () => {
  it("is remembered for the tab, so the next module still collects into it (二 8)", () => {
    const store = memoryStore();
    writeCollecting(store, A);
    expect(store.data.has(PACK_STORAGE_KEY)).toBe(true);
    // A reload, or the next page reached from the menu, reads it back.
    expect(readCollecting(store)).toEqual(A);
  });

  it("is forgotten on 「结束选择」", () => {
    const store = memoryStore();
    writeCollecting(store, A);
    writeCollecting(store, null);
    expect(readCollecting(store)).toBeNull();
  });

  it("treats a broken or foreign entry as none rather than failing the page", () => {
    expect(parseCollecting("{not json")).toBeNull();
    expect(parseCollecting(JSON.stringify({ id: "" }))).toBeNull();
    expect(parseCollecting(JSON.stringify({ id: 3, name: "x", project: "p" }))).toBeNull();
    expect(parseCollecting(null)).toBeNull();
    expect(readCollecting(null)).toBeNull();
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(readCollecting(throwing)).toBeNull();
    expect(() => writeCollecting(throwing, A)).not.toThrow();
  });

  it("follows the address when Multi Engine just sent the person here", () => {
    // Nothing remembered yet: the id from the address, the name once read.
    expect(resolveCollecting("pkg-b", null)).toEqual({ id: "pkg-b", name: "", project: "" });
    // The same package as remembered keeps its name.
    expect(resolveCollecting("pkg-a", A)).toEqual(A);
    // Another package in the address wins over the remembered one.
    expect(resolveCollecting("pkg-b", A)?.id).toBe("pkg-b");
    // No address: what the tab remembered.
    expect(resolveCollecting(null, A)).toEqual(A);
    expect(resolveCollecting("  ", null)).toBeNull();
  });
});

describe("the way into each module", () => {
  it("covers every column Multi Engine has always offered (补充 1)", () => {
    const kinds = new Set(PACK_TARGETS.map((target) => target.kind));
    for (const kind of [
      "MATERIAL_RECEIPT",
      "MATERIAL_OUTGOING",
      "EQUIPMENT_MOVEMENT",
      "HAZARD",
      "WASTE_OUTGOING",
      "DISPOSAL_REQUEST",
      "PROGRESS",
      "CONSULTANT_APPLICATION",
    ]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
  });

  it("opens the module's existing list, named as the menu names it", () => {
    for (const target of PACK_TARGETS) {
      const page = path.join(process.cwd(), "src", "app", "(dashboard)", target.path, "page.tsx");
      expect(existsSync(page), target.path).toBe(true);
      for (const messages of [zh, zhTW, en, ms]) {
        const [, group, key] = target.labelKey.split(".");
        const label = (messages.nav as unknown as Record<string, Record<string, string> | undefined>)[group]?.[key];
        expect(label, `${target.labelKey}`).toBeTruthy();
      }
    }
  });

  it("carries the package and its project, so the list opens on that project (三 8)", () => {
    const receipts = PACK_TARGETS.find((target) => target.key === "receipts");
    const progress = PACK_TARGETS.find((target) => target.key === "progress");
    expect(receipts && collectHref(receipts, A)).toBe(`/receipts?project=p-1&${PACK_PARAM}=pkg-a`);
    const href = progress ? collectHref(progress, A) : "";
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/progress?")).toBe(true);
    expect(params.get("tab")).toBe("photos");
    expect(params.get("view")).toBe("records");
    expect(params.get(PACK_PARAM)).toBe("pkg-a");
  });

  it("comes back to the package, opened (二 7)", () => {
    expect(packageHref("pkg-a")).toBe("/evidence-packages?package=pkg-a");
  });
});

const row = (over: Partial<PackRowStatus>): PackRowStatus => ({
  count: 0,
  in_package: false,
  can_add: true,
  reason: "",
  ...over,
});

describe("which rows can be ticked", () => {
  const records = {
    r1: row({}),
    r2: row({ count: 1, in_package: true, can_add: false, reason: "in_package" }),
    r3: row({ can_add: false, reason: "not_finished" }),
    r4: row({ count: 2 }),
  };

  it("leaves out a row already in the package and one that cannot go in (补充 3)", () => {
    expect(tickableIds(["r1", "r2", "r3", "r4", "r5"], records)).toEqual(["r1", "r4"]);
    expect(tickableIds(["r1"], undefined)).toEqual([]);
  });

  it("drops a tick once its row joined the package or left the page", () => {
    expect(keepTickable(["r1", "r2", "r4"], ["r1", "r2", "r3"], records)).toEqual(["r1"]);
  });

  it("shows the 「资料包」 column while collecting, or when a row was packed", () => {
    expect(showsPackColumn(true, {})).toBe(true);
    expect(showsPackColumn(false, { r1: row({}) })).toBe(false);
    expect(showsPackColumn(false, { r4: row({ count: 2 }) })).toBe(true);
    expect(showsPackColumn(false, undefined)).toBe(false);
  });
});

/**
 * Every list a column of Multi Engine opens is wired (补充 1: 「Multi Engine
 * 原本支持的其他栏目也采用相同勾选方式」). Read from the source, as
 * `needs-action.test.tsx` checks its lists: a module that lost its `pack`
 * would still render, and nobody would notice the tick boxes were gone.
 */
describe("every module list Multi Engine picks from", () => {
  const wired: Array<[string, string]> = [
    ["receipts/receipts.tsx", 'kind: "MATERIAL_RECEIPT"'],
    ["contractor-ops/office-module-lists.tsx", 'pack="MATERIAL_OUTGOING"'],
    ["contractor-ops/office-module-lists.tsx", 'pack="EQUIPMENT_MOVEMENT"'],
    ["contractor-ops/office-module-lists.tsx", 'pack="PROGRESS"'],
    ["site-operations/safety.tsx", 'kind: "HAZARD"'],
    ["permits/permits-office.tsx", 'pack="HAZARD"'],
    ["contractor-ops/waste-outgoing-workspace.tsx", 'pack="WASTE_OUTGOING"'],
    ["contractor-ops/site-disposal-workspaces.tsx", 'pack="DISPOSAL_REQUEST"'],
    ["consultant-workflow/applications-list.tsx", 'kind: "CONSULTANT_APPLICATION"'],
  ];

  it.each(wired)("%s carries %s", (file, marker) => {
    const source = readFileSync(path.join(process.cwd(), "src", "components", file), "utf8");
    expect(source).toContain(marker);
  });
});
