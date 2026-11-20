import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SafetyIncidentPayload } from "@/interfaces/site-operations";
import type { OfflineJob } from "@/lib/offline-db";
import zh from "@/messages/zh.json";

/**
 * 11-19 audit, JB223 F1 / F2 / F5: 建立整改事项 from the office.
 *
 * F1 - the PDF / Word / Excel chosen on the office form go up INSIDE the
 * item's own request: a refused file (wrong type, empty, too big) is refused
 * before the item exists, and closing the browser cannot leave the item
 * without its files. F2 - left empty, 发生时间 is not a file's date: nothing
 * is sent and the server records now. F5 - one toast, 「整改事项已建立…」, when
 * everything is saved. The phone is as it was. IndexedDB is a map here and
 * the network a mock, so what runs is the real store-then-replay.
 */
const store = new Map<string, OfflineJob>();
const shown: string[] = [];
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "inc-1", incident_no: "SI-A-001" }));

vi.mock("sonner", () => ({
  toast: {
    success: (message: string) => {
      shown.push(message);
      return 1;
    },
    error: () => 1,
    dismiss: () => undefined,
  },
}));

vi.mock("@/lib/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline-db")>()),
  getOfflineJobs: async (ownerId: string) => [...store.values()].filter((job) => job.ownerId === ownerId),
  putOfflineJob: async (job: OfflineJob) => {
    store.set(job.id, structuredClone(job));
  },
  deleteOfflineJob: async (id: string) => {
    store.delete(id);
  },
  countOfflineJobs: async (ownerId: string) => [...store.values()].filter((job) => job.ownerId === ownerId).length,
}));

vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { post: (...args: unknown[]) => post(...args) },
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");
const { ApiError } = await import("@/interfaces/api");
const { publishTranslator } = await import("@/lib/i18n-runtime");

/** Saved on the computer two months ago: its file date is not when the hazard was seen. */
const TWO_MONTHS_AGO = new Date("2026-09-20T08:00:00.000Z").getTime();
const png = (name = "IMG_2041.png") => new File(["png"], name, { type: "image/png", lastModified: TWO_MONTHS_AGO });
const pdf = () => new File(["%PDF-1.4"], "整改要求.pdf", { type: "application/pdf" });
const xlsx = () =>
  new File(["PK"], "整改清单.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const item = (extra: Partial<SafetyIncidentPayload> = {}): SafetyIncidentPayload & { client_event_id: string } => ({
  project: "p1",
  category: "c1",
  title: "三楼临边护栏缺失",
  description: "",
  photos: [],
  attachments: [],
  ...extra,
  client_event_id: "jb223-evt",
});

function sent(call = -1) {
  const [url, data] = post.mock.calls.at(call) as [string, FormData];
  return { url, data };
}

beforeEach(() => {
  publishTranslator("zh", zh);
});

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  shown.length = 0;
  post.mockReset();
  post.mockImplementation(async () => ({ id: "inc-1", incident_no: "SI-A-001" }));
});

describe("F1: the office's files go up inside the item's own request", () => {
  it("sends the photos and the PDF / Excel in ONE request; nothing is left to go up after it", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const result = await queue.submitSafetyIncidentOfflineAware(
      "lily",
      item({ photos: [png()], attachments: [pdf(), xlsx()] }),
      undefined,
      { fromOffice: true },
    );
    expect(result.status).toBe("uploaded");
    expect(post).toHaveBeenCalledTimes(1);
    const { url, data } = sent();
    expect(url).toBe("/api/safety-incidents/create_safety_incident/");
    expect((data.getAll("attachments") as File[]).map((file) => file.name)).toEqual(["整改要求.pdf", "整改清单.xlsx"]);
    expect((data.getAll("photos") as File[]).map((file) => file.name)).toEqual(["IMG_2041.png"]);
    expect(data.get("filesWithItem")).toBeNull();
    // No HAZARD_FILE job waiting in this browser for the tab to stay open.
    expect(store.size).toBe(0);
  });

  it("a refused file comes back before anything exists: thrown to the form, nothing queued, nothing said saved", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementationOnce(async () => {
      throw new ApiError("renamed", 400, { attachments: "renamed" }, "attachment_content_mismatch", {
        name: "整改要求.pdf",
        allowed: "PDF",
      });
    });
    await expect(
      queue.submitSafetyIncidentOfflineAware("lily", item({ attachments: [pdf()] }), undefined, { fromOffice: true }),
    ).rejects.toMatchObject({ status: 400, code: "attachment_content_mismatch" });
    expect(store.size).toBe(0);
    expect(shown).toEqual([]);
  });

  it("a lost answer waits as ONE job that replays with its files inside, under the same id", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    post.mockImplementationOnce(async () => {
      throw new ApiError("offline", 0);
    });
    const result = await queue.submitSafetyIncidentOfflineAware(
      "lily",
      item({ attachments: [pdf(), xlsx()] }),
      undefined,
      { fromOffice: true },
    );
    expect(result.status).toBe("queued");
    const [job] = [...store.values()];
    expect(job.kind).toBe("SAFETY_INCIDENT");
    if (job.kind !== "SAFETY_INCIDENT") throw new Error("wrong kind");
    expect(job.payload.filesWithItem).toBe(true);

    await queue.flushOfflineJobs("lily");
    const { url, data } = sent();
    expect(url).toBe("/api/safety-incidents/create_safety_incident/");
    expect(data.getAll("attachments")).toHaveLength(2);
    expect(data.get("client_event_id")).toBe("jb223-evt");
    // F2 on a replay: the moment it was pressed, never a file's date.
    expect(data.get("occurred_at")).toBe(job.queuedAt);
    expect(data.get("filesWithItem")).toBeNull();
    expect([...store.values()].filter((left) => left.kind === "HAZARD_FILE")).toEqual([]);
    expect(store.size).toBe(0);
  });
});

describe("F2: an empty 发生时间 on the office form is not a file's date", () => {
  it("sends none, so the server records now", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    await queue.submitSafetyIncidentOfflineAware("lily", item({ photos: [png()] }), undefined, { fromOffice: true });
    expect(sent().data.get("occurred_at")).toBeNull();
  });

  it("keeps the time somebody typed", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    await queue.submitSafetyIncidentOfflineAware(
      "lily",
      item({ photos: [png()], occurred_at: "2026-11-19T02:00:00.000Z" }),
      undefined,
      { fromOffice: true },
    );
    expect(sent().data.get("occurred_at")).toBe("2026-11-19T02:00:00.000Z");
  });
});

describe("F5: one toast for a 整改 raised at the office, when everything is saved", () => {
  it("says 「整改事项已建立」 with the files, once - not 「安全事故已上报」, not 「提交成功」 beside it", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    await queue.submitSafetyIncidentOfflineAware(
      "lily",
      item({ photos: [png()], attachments: [pdf(), xlsx()] }),
      undefined,
      { fromOffice: true },
    );
    expect(shown).toEqual(["整改事项已建立，3 个文件已全部保存。"]);
  });

  it("says just 「整改事项已建立。」 when nothing was attached", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    await queue.submitSafetyIncidentOfflineAware("lily", item(), undefined, { fromOffice: true });
    expect(shown).toEqual(["整改事项已建立。"]);
  });
});

describe("the phone is as it was (P-phonefix)", () => {
  it("sends the report and its photos first; each file follows as its own job; the photo's time is kept", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const photos = [png("p-1.png"), png("p-2.png"), png("p-3.png"), png("p-4.png")];
    const result = await queue.submitSafetyIncidentOfflineAware(
      "worker",
      item({ category: undefined, title: "", photos, attachments: [pdf()], latitude: "3.1", longitude: "101.6" }),
    );
    expect(result.status).toBe("uploaded");
    const { data } = sent();
    expect(data.getAll("attachments")).toEqual([]);
    expect(data.getAll("photos")).toHaveLength(4);
    expect(data.get("occurred_at")).toBe(new Date(TWO_MONTHS_AGO).toISOString());
    expect([...store.values()].map((job) => job.kind)).toEqual(["HAZARD_FILE"]);
    expect(shown).toEqual(["提交成功", "已送到办公室。1 个附件正在后台上传。"]);
  });
});
