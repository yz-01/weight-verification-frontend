/**
 * 「加入当前资料包」 and its undo, as calls (2026-10-10, 添加资料及勾选关联).
 *
 * The ticked rows go to the package in one call - kind and ids - and the
 * person is told how many joined and how many were already in or could not
 * go in. A list page asks for all of its badges in one request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
const toasts: { key: string; values?: Record<string, unknown> }[] = [];
let answer: unknown = null;

vi.mock("@/services/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/api-client")>();
  return {
    ...original,
    api: {
      ...original.api,
      post: async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        return answer;
      },
      get: async (path: string, query?: unknown) => {
        calls.push({ method: "GET", path, body: query });
        return answer;
      },
    },
    toastSuccess: (key: string, values?: Record<string, unknown>) => {
      toasts.push({ key, values });
    },
  };
});

const { getPackStatus, getRecordPackages, linkPackageRecords, unlinkPackageRecords } = await import(
  "@/services/contractor-ops.service"
);

const brief = { id: "pkg-a", package_no: "PKG-1", name: "A", project: "p-1", state: "DRAFT", item_count: 3 };

beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
});

describe("「加入当前资料包」", () => {
  it("sends the ticked rows to the package in one call", async () => {
    answer = { added: 2, already_in: 0, refused: [], package: brief };
    await linkPackageRecords("pkg-a", "MATERIAL_RECEIPT", ["r1", "r2"]);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/evidence-packages/pkg-a/link_records/",
        body: { kind: "MATERIAL_RECEIPT", ids: ["r1", "r2"] },
      },
    ]);
    expect(toasts).toEqual([{ key: "multiEngine.collect.toast.linked", values: { added: 2, skipped: 0 } }]);
  });

  it("says when some were already in or could not go in", async () => {
    answer = { added: 1, already_in: 1, refused: [{ id: "r3", reason: "other_project" }], package: brief };
    await linkPackageRecords("pkg-a", "MATERIAL_RECEIPT", ["r1", "r2", "r3"]);
    expect(toasts).toEqual([{ key: "multiEngine.collect.toast.linkedSome", values: { added: 1, skipped: 2 } }]);
  });

  it("takes one back out of the draft", async () => {
    answer = { removed: 1, package: brief };
    await unlinkPackageRecords("pkg-a", "HAZARD", ["r9"]);
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/evidence-packages/pkg-a/unlink_records/",
      body: { kind: "HAZARD", ids: ["r9"] },
    });
    expect(toasts[0]?.key).toBe("multiEngine.collect.toast.unlinked");
  });
});

describe("a list page's badges", () => {
  it("are asked for in one request for the whole page", async () => {
    answer = { package: null, records: {} };
    await getPackStatus("EQUIPMENT_MOVEMENT", ["a", "b", "c"], "pkg-a");
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/evidence-packages/pack_status/",
        body: { kind: "EQUIPMENT_MOVEMENT", ids: "a,b,c", package: "pkg-a" },
      },
    ]);
  });

  it("name one record's packages on request", async () => {
    answer = [];
    await getRecordPackages("PROGRESS", "r1");
    expect(calls[0]).toEqual({
      method: "GET",
      path: "/api/evidence-packages/record_packages/",
      body: { kind: "PROGRESS", id: "r1" },
    });
  });
});
