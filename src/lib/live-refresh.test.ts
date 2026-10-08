/**
 * Audit S1 (2026-10-08): the one-minute safety poll used to call
 * `invalidateQueries()` - every active query, every minute, whatever its own
 * `staleTime`: hour-fresh permission matrices, report aggregations, cards that
 * already poll themselves. The poll now refetches only what is on screen and
 * stale; an event still refreshes every live query, fresh or not.
 */
import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { NOT_LIVE, refreshChanged, refreshStale } from "@/lib/live-refresh";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/** A query on screen (one subscribed observer), already loaded `ageMs` ago. */
async function onScreen(
  client: QueryClient,
  queryKey: QueryKey,
  options: { staleTime?: number; meta?: Record<string, unknown>; refetchInterval?: number; ageMs?: number } = {},
) {
  const queryFn = vi.fn(async () => "fresh");
  client.setQueryData(queryKey, "cached", { updatedAt: Date.now() - (options.ageMs ?? 0) });
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn,
    staleTime: options.staleTime ?? 30_000,
    meta: options.meta,
    refetchInterval: options.refetchInterval,
    refetchOnMount: false,
  });
  cleanups.push(observer.subscribe(() => {}));
  queryFn.mockClear();
  return queryFn;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("refreshStale (the safety poll)", () => {
  it("refetches only on-screen live queries that are stale by their own staleTime", async () => {
    const qc = client();
    const staleList = await onScreen(qc, ["receipts", "list"], { ageMs: 45_000 });
    const freshList = await onScreen(qc, ["deliveries", "list"], { ageMs: 5_000 });
    const permissionMatrix = await onScreen(qc, ["roles", "matrix"], { staleTime: 3_600_000, ageMs: 120_000 });
    const report = await onScreen(qc, ["contractor-reports", "report"], { meta: NOT_LIVE, ageMs: 120_000 });
    const selfPolling = await onScreen(qc, ["dashboard", "card"], { refetchInterval: 15_000, ageMs: 45_000 });
    const offScreen = await onScreen(qc, ["users", "list"], { ageMs: 120_000 });
    cleanups.pop()?.(); // navigated away: no observer left

    await refreshStale(qc);

    expect(staleList).toHaveBeenCalledTimes(1);
    expect(freshList).not.toHaveBeenCalled();
    expect(permissionMatrix).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(selfPolling).not.toHaveBeenCalled();
    expect(offScreen).not.toHaveBeenCalled();
  });
});

describe("refreshChanged (an event, the fallback, an offline upload)", () => {
  it("reloads every on-screen live query, even a fresh one, but not a report", async () => {
    const qc = client();
    const freshList = await onScreen(qc, ["deliveries", "list"], { ageMs: 5_000 });
    const report = await onScreen(qc, ["admin-reports", {}], { meta: NOT_LIVE, ageMs: 120_000 });

    await refreshChanged(qc);

    expect(freshList).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });
});

describe("no caller refetches everything any more", () => {
  it.each([
    "src/hooks/use-order-realtime.ts",
    "src/components/providers/offline-sync-provider.tsx",
  ])("%s never calls a bare invalidateQueries()", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/invalidateQueries\(\s*\)/);
  });

  it("the safety poll asks for stale-only and events for changed", () => {
    const source = readFileSync(path.join(process.cwd(), "src/hooks/use-order-realtime.ts"), "utf8");
    expect(source).toMatch(/document\.hidden\) return;\s*refresh\(false\);/);
    expect(source).toMatch(/shouldRefresh\(event\.event_type\)\) refresh\(true\);/);
  });
});
