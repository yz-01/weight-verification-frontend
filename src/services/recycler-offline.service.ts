/** Offline read cache for the recycler console's daily working set.
 *
 * A yard on a flaky connection still needs to see today's order book, its
 * fleet and its assignment options. Each getter here serves the network
 * answer and snapshots it; when the network is gone it serves the snapshot
 * instead. Weighing is deliberately absent — weights come from the
 * weighbridge gateway, and a browser cache must never look like one.
 */

import { ApiError, type ListQuery, type Paginated } from "@/interfaces/api";
import type { DispatchSummary, WasteDispatch } from "@/interfaces/contractor";
import type { Driver, DriverTask, Vehicle } from "@/interfaces/recycler";
import type { RecyclingSite } from "@/interfaces/weighing";
import {
  getRecyclerSnapshot,
  putRecyclerSnapshot,
  type RecyclerSnapshotKind,
} from "@/lib/offline-db";
import { getDispatchSummary } from "@/services/contractor.service";
import {
  getDrivers,
  getIncoming,
  getTasks,
  getVehicles,
} from "@/services/recycler.service";
import { getSites } from "@/services/weighing.service";

function snapshotId(ownerId: string, kind: RecyclerSnapshotKind): string {
  return `recycler:${ownerId}:${kind.toLowerCase()}`;
}

function isOfflineFailure(error: unknown): boolean {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    (error instanceof ApiError && error.isNetwork)
  );
}

async function cacheRecyclerRoute(pathname: string): Promise<void> {
  if (
    typeof window === "undefined" ||
    typeof caches === "undefined" ||
    !navigator.onLine
  ) {
    return;
  }

  const response = await fetch(pathname, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  if (!response.ok) return;

  const cacheNames = await caches.keys();
  const shellCache =
    cacheNames.find((name) => name.startsWith("mse-trace-shell-")) ??
    "mse-trace-shell-v14";
  await (await caches.open(shellCache)).put(pathname, response);
}

/**
 * Serve fresh, snapshot on the way through, fall back to the snapshot
 * offline. The snapshot is per kind, not per query: offline the yard gets
 * the last default view, which is honest and bounded, rather than a cache
 * of every filter combination ever opened.
 */
async function offlineAware<T>(
  ownerId: string,
  kind: RecyclerSnapshotKind,
  fetcher: () => Promise<T>,
  options: { snapshotWorthy?: boolean; route?: string } = {},
): Promise<T> {
  const { snapshotWorthy = true, route } = options;
  try {
    const data = await fetcher();
    if (snapshotWorthy) {
      try {
        await putRecyclerSnapshot({
          id: snapshotId(ownerId, kind),
          ownerId,
          kind,
          savedAt: new Date().toISOString(),
          data,
        });
        if (route) await cacheRecyclerRoute(route);
      } catch {
        // Private browsing may refuse IndexedDB; the online answer stands.
      }
    }
    return data;
  } catch (error) {
    if (!isOfflineFailure(error)) throw error;
    const cached = await getRecyclerSnapshot<T>(
      snapshotId(ownerId, kind),
    ).catch(() => null);
    if (!cached) throw error;
    return cached.data;
  }
}

function isDefaultListQuery(query: ListQuery): boolean {
  const { page, page_size, ...filters } = query;
  void page_size;
  const noFilters = Object.values(filters).every(
    (value) => value === undefined || value === null || value === "",
  );
  return noFilters && (page === undefined || Number(page) === 1);
}

export function getIncomingOfflineAware(
  ownerId: string,
  query: ListQuery,
): Promise<Paginated<WasteDispatch>> {
  return offlineAware(ownerId, "INCOMING", () => getIncoming(query), {
    snapshotWorthy: isDefaultListQuery(query),
    route: "/incoming",
  });
}

export function getIncomingSummaryOfflineAware(
  ownerId: string,
): Promise<DispatchSummary> {
  return offlineAware(ownerId, "INCOMING_SUMMARY", () =>
    getDispatchSummary({}),
  );
}

export function getTasksOfflineAware(
  ownerId: string,
  query: ListQuery,
): Promise<Paginated<DriverTask>> {
  return offlineAware(ownerId, "TASK_LIST", () => getTasks(query), {
    snapshotWorthy: isDefaultListQuery(query),
    route: "/tasks",
  });
}

export function getSitesOfflineAware(
  ownerId: string,
  query: ListQuery,
): Promise<Paginated<RecyclingSite>> {
  return offlineAware(ownerId, "SITES", () => getSites(query));
}

export function getVehiclesOfflineAware(
  ownerId: string,
  query: ListQuery,
): Promise<Paginated<Vehicle>> {
  return offlineAware(ownerId, "VEHICLES", () => getVehicles(query));
}

export function getDriversOfflineAware(
  ownerId: string,
  query: ListQuery,
): Promise<Paginated<Driver>> {
  return offlineAware(ownerId, "DRIVERS", () => getDrivers(query));
}
