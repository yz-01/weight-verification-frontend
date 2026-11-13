/**
 * JB193 「一次问 / 加入好几种」 (spec 第二十六轮, 接口和资料): 现场记录中心 holds
 * rows of several kinds on one page, so it asks `pack_status` with
 * `items=KIND:id,…` and adds / removes with `{records: [{kind, id}]}` - one
 * request per page. Every single-kind list keeps sending exactly what it sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body?: unknown }[] = [];
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
    toastSuccess: () => {},
  };
});

const {
  getPackStatus,
  linkPackageRecords,
  packItemsParam,
  packRecordsBody,
  packStatusQuery,
  unlinkPackageRecords,
} = await import("@/services/contractor-ops.service");

const brief = { id: "pkg-a", package_no: "PKG-1", name: "A", project: "p-1", state: "DRAFT", item_count: 3 };
const DAY = "5f0c6a8e-1d7b-5c3e-9a41-2b8f0e6d7c19";
const MIXED = [
  { kind: "MATERIAL_RECEIPT" as const, id: "r1" },
  { kind: "MATERIAL_OUTGOING" as const, id: "o1" },
  { kind: "ATTENDANCE_DAY" as const, id: DAY },
];

beforeEach(() => {
  calls.length = 0;
});

describe("several kinds in one question (现场记录中心)", () => {
  it("writes items as KIND:id, comma-separated, the attendance day's id as it is", () => {
    expect(packItemsParam(MIXED)).toBe(`MATERIAL_RECEIPT:r1,MATERIAL_OUTGOING:o1,ATTENDANCE_DAY:${DAY}`);
    expect(packStatusQuery(MIXED, [], "pkg-a")).toEqual({
      items: `MATERIAL_RECEIPT:r1,MATERIAL_OUTGOING:o1,ATTENDANCE_DAY:${DAY}`,
      package: "pkg-a",
    });
  });

  it("asks pack_status once for the whole page, without kind or ids", async () => {
    answer = { package: null, records: {} };
    await getPackStatus(MIXED, "pkg-a");
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/evidence-packages/pack_status/",
        body: { items: `MATERIAL_RECEIPT:r1,MATERIAL_OUTGOING:o1,ATTENDANCE_DAY:${DAY}`, package: "pkg-a" },
      },
    ]);
  });

  it("adds and takes out with {records: [{kind, id}]}", async () => {
    answer = { added: 3, already_in: 0, refused: [], package: brief };
    await linkPackageRecords("pkg-a", MIXED);
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/evidence-packages/pkg-a/link_records/",
      body: { records: MIXED },
    });
    answer = { removed: 1, package: brief };
    await unlinkPackageRecords("pkg-a", [{ kind: "ATTENDANCE_DAY", id: DAY }]);
    expect(calls[1]).toEqual({
      method: "POST",
      path: "/api/evidence-packages/pkg-a/unlink_records/",
      body: { records: [{ kind: "ATTENDANCE_DAY", id: DAY }] },
    });
  });
});

describe("one kind, as every other list has always asked", () => {
  it("still sends kind and ids, and no items", async () => {
    answer = { package: null, records: {} };
    await getPackStatus("DAILY_REPORT", ["d1", "d2"], "pkg-a");
    await getPackStatus("DOCUMENT", ["doc1"]);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/api/evidence-packages/pack_status/",
        body: { kind: "DAILY_REPORT", ids: "d1,d2", package: "pkg-a" },
      },
      {
        method: "GET",
        path: "/api/evidence-packages/pack_status/",
        body: { kind: "DOCUMENT", ids: "doc1", package: undefined },
      },
    ]);
  });

  it("adds a MIN once, as a material outgoing", async () => {
    answer = { added: 1, already_in: 0, refused: [], package: brief };
    await linkPackageRecords("pkg-a", "MATERIAL_OUTGOING", ["o-1"]);
    expect(calls[0]?.body).toEqual({ kind: "MATERIAL_OUTGOING", ids: ["o-1"] });
    expect(packRecordsBody("DAILY_REPORT", ["d1"])).toEqual({ kind: "DAILY_REPORT", ids: ["d1"] });
  });
});
