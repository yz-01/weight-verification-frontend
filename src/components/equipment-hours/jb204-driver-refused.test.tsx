/**
 * JB204-2 (Lucas 11-16 audit): a 开工 / 收工 the server refused, on the
 * driver's own clock link (`/equipment-clock/<token>`).
 *
 * The link's photos wait in their own queue (`driverQueueOwner`). A refused
 * one was never sent again by itself (that is right: the same photo cannot
 * succeed), but the page never showed it, its toast pointed at an upload sign
 * the page does not have, and the refused 开工 still made the next scan offer
 * 收工. Now the page lists it with its reason, 重试 and 删除; the toast says
 * where to look on this page; and a refused photo no longer decides 开工 or
 * 收工 - on the site-staff and operator screens too, which read the same
 * `waitingPhotos`.
 *
 * IndexedDB is a map here and the network a mock, as in
 * `services/equipment-hours-offline.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const store = new Map<string, OfflineJob>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "log", session: null }));
const refusalToast = vi.fn();

// The page sits under the app's AuthProvider (the capture reads it too); the
// date format reads the account's settings from it.
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => false }),
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
  countOfflineJobs: async (ownerId: string) =>
    [...store.values()].filter((job) => job.ownerId === ownerId).length,
}));

vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { post: (...args: unknown[]) => post(...args) },
  toastSuccess: () => undefined,
  toastOutcome: () => undefined,
  toastRefusal: (...args: unknown[]) => refusalToast(...args),
  withOfflineProvenance: async <T,>(_createdAt: string, run: () => Promise<T>) => run(),
}));

const queue = await import("@/services/offline-sync.service");
const { ApiError } = await import("@/interfaces/api");
const { driverQueueOwner, kindToTake, waitingPhotos } = await import(
  "@/components/equipment-hours/equipment-hours-capture"
);
const { RefusedRecordsView } = await import("@/components/shared/offline-status");

const TOKEN = "driver-link-token";
const owner = driverQueueOwner(TOKEN);

async function queueStart(ownerId = owner) {
  vi.stubGlobal("navigator", { onLine: false });
  await queue.submitEquipmentHoursPhotoOfflineAware(ownerId, {
    equipment: "eq-1",
    equipmentLabel: "12 · Excavator · WXY 1234",
    kind: "START",
    photo: new File(["machine"], "machine.jpg", { type: "image/jpeg" }),
    signature: new File(["ink"], "signature.png", { type: "image/png" }),
    latitude: "3.1149475",
    longitude: "101.7294695",
    locationAccuracyM: "12.00",
    ...(ownerId === owner ? { driverLink: { token: TOKEN, device: "phone-1" } } : {}),
  });
  vi.stubGlobal("navigator", { onLine: true });
}

// The API client words a coded refusal from the catalogue before the queue
// sees it, so the message is already the reader's sentence.
const outsideFence = () =>
  post.mockImplementationOnce(async () => {
    throw new ApiError(zh.errors.api.equipment_hours_outside_fence, 400, {}, "equipment_hours_outside_fence");
  });

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
  post.mockReset();
  post.mockImplementation(async () => ({ id: "log", session: null }));
  refusalToast.mockReset();
});

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("a 开工 the server refused on the driver's link", () => {
  it("is said once, pointing at this page - not at an upload sign it does not have", async () => {
    await queueStart();
    outsideFence();

    await queue.flushOfflineJobs(owner);

    expect(refusalToast).toHaveBeenCalledTimes(1);
    expect(refusalToast).toHaveBeenCalledWith("offline.status.refusedToastOnPage", { count: 1 });
  });

  it("no longer makes the next scan offer 收工", async () => {
    await queueStart();
    outsideFence();
    await queue.flushOfflineJobs(owner);

    const waiting = await waitingPhotos(owner);

    expect(waiting).toEqual([]);
    expect(kindToTake({ id: "eq-1", open_since: null }, waiting)).toBe("START");
  });

  it("a 开工 still waiting for signal does decide it, as before", async () => {
    await queueStart();

    const waiting = await waitingPhotos(owner);

    expect(waiting).toHaveLength(1);
    expect(kindToTake({ id: "eq-1", open_since: null }, waiting)).toBe("FINISH");
  });

  it("is listed with its reason, 重试 and 删除", async () => {
    await queueStart();
    outsideFence();
    await queue.flushOfflineJobs(owner);

    const refused = (await queue.getOfflineQueueEntries(owner)).filter((entry) => entry.state === "failed");
    expect(refused).toHaveLength(1);
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <RefusedRecordsView
          entries={refused}
          count={refused.length}
          showTitle
          busy={null}
          deleting={null}
          onRetry={() => {}}
          onAskDelete={() => {}}
          onConfirmDelete={() => {}}
          onCancelDelete={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(zh.errors.api.equipment_hours_outside_fence);
    expect(html).toContain(zh.offline.kind.EQUIPMENT_HOURS_PHOTO);
    expect(html).toContain(zh.offline.refused.retry);
    expect(html).toContain(zh.offline.refused.delete);

    // 重试 sends it again; this time it goes.
    await queue.retryOfflineJob(owner, refused[0].id);
    expect(await queue.getOfflineQueueEntries(owner)).toEqual([]);
  });

  it("the page reads the link's own queue and wires 重试 and 删除", () => {
    const page = read("src/components/equipment-hours/driver-clock-link.tsx");
    expect(page).toContain("<DriverRefusedRecords token={token} />");
    expect(page).toContain("const owner = driverQueueOwner(token);");
    expect(page).toContain("getOfflineQueueEntries(owner)");
    expect(page).toContain('rows.filter((row) => row.state === "failed")');
    expect(page).toContain("retryOfflineJob(owner, entry.id)");
    expect(page).toContain("discardOfflineJob(entry.id)");
    expect(page).toContain("<RefusedRecordsView");
  });
});

describe("a refusal in the field app", () => {
  it("still points at the upload sign at the top", async () => {
    await queueStart("ahmad");
    post.mockImplementationOnce(async () => {
      throw new ApiError("Refused.", 400, {}, "equipment_hours_outside_fence");
    });

    await queue.flushOfflineJobs("ahmad");

    expect(refusalToast).toHaveBeenCalledWith("offline.status.refusedToast", { count: 1 });
  });
});

describe("the toast's words", () => {
  it("say where to look on this page, in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const line = messages.offline.status.refusedToastOnPage;
      expect(line).toContain("{count");
      expect(line).not.toBe(messages.offline.status.refusedToast);
    }
    expect(zh.offline.status.refusedToastOnPage).not.toContain("上传图标");
    expect(zh.offline.status.refusedToastOnPage).toContain("本页上方");
  });
});
