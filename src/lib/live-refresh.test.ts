/**
 * Audit S1 and perf item #1 (2026-10-08): the shells' realtime layer used to
 * call `invalidateQueries()` - every active query - on every event, every
 * 15 s while the stream was down and every minute from the safety poll,
 * whatever each query's own `staleTime`. Now an event refreshes the screens of
 * its family only, and the poll and the fallback refetch only what is on
 * screen and stale.
 */
import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  NOT_LIVE,
  keysForEvent,
  refreshChanged,
  refreshForEvents,
  refreshStale,
} from "@/lib/live-refresh";

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

describe("refreshForEvents (events from the stream)", () => {
  it("an event refreshes its own family's screens, even fresh, and nothing unrelated", async () => {
    const qc = client();
    const receipts = await onScreen(qc, ["receipts", "list", { page: 1 }], { ageMs: 5_000 });
    const badges = await onScreen(qc, ["sidebar-badges", "project-1"], { ageMs: 5_000 });
    const dispatches = await onScreen(qc, ["dispatches", { page: 1 }], { ageMs: 120_000 });
    const users = await onScreen(qc, ["users", "list"], { ageMs: 120_000 });

    await refreshForEvents(qc, ["receipt.created"]);

    expect(receipts).toHaveBeenCalledTimes(1);
    expect(badges).toHaveBeenCalledTimes(1);
    // Unrelated screens wait for their own staleness, even when stale.
    expect(dispatches).not.toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
  });

  it("a driver's GPS ping redraws the map, not every dispatch list", async () => {
    const qc = client();
    const detail = await onScreen(qc, ["dispatches", "detail", "d1"], { ageMs: 5_000 });
    const list = await onScreen(qc, ["dispatches", { page: 1 }], { ageMs: 5_000 });

    await refreshForEvents(qc, ["waste_dispatch.gps_recorded"]);

    expect(detail).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });

  it("an event the map does not know only refetches what is stale, never everything", async () => {
    const qc = client();
    const fresh = await onScreen(qc, ["receipts", "list"], { ageMs: 5_000 });
    const stale = await onScreen(qc, ["users", "list"], { ageMs: 45_000 });

    expect(keysForEvent("job.failed")).toBeNull();
    await refreshForEvents(qc, ["job.failed"]);

    expect(fresh).not.toHaveBeenCalled();
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it("never re-runs a report aggregation", async () => {
    const qc = client();
    const report = await onScreen(qc, ["transactions", "report", {}], { meta: NOT_LIVE, ageMs: 5_000 });

    await refreshForEvents(qc, ["weighing.session_settled"]);

    expect(report).not.toHaveBeenCalled();
  });

  it("the longest family wins and exact types do not leak into their prefix", () => {
    expect(keysForEvent("waste_dispatch.gps_recorded")).not.toEqual(keysForEvent("waste_dispatch.released"));
    expect(keysForEvent("dispatch.assigned")).not.toBeNull();
    expect(keysForEvent("notification.created")).not.toBeNull();
    expect(keysForEvent("notification.other")).toBeNull();
    expect(keysForEvent(undefined)).toBeNull();
  });

  it("every family the hook listens for has screens to refresh", () => {
    const source = readFileSync(path.join(process.cwd(), "src/hooks/use-order-realtime.ts"), "utf8");
    const block = source.slice(source.indexOf("const REFRESH_PREFIXES"), source.indexOf("const REFRESH_EXACT"));
    const families = [...block.matchAll(/^\s*"([a-z_]+\.)",/gm)].map((match) => match[1]);
    expect(families.length).toBeGreaterThan(10);
    for (const family of families) expect(keysForEvent(`${family}anything`), family).not.toBeNull();
  });
});

describe("refreshChanged (an offline upload)", () => {
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

  it("the safety poll and the fallback ask for stale-only; events name their type", () => {
    const source = readFileSync(path.join(process.cwd(), "src/hooks/use-order-realtime.ts"), "utf8");
    expect(source).toMatch(/document\.hidden\) return;\s*refresh\("stale"\);/);
    expect(source).toMatch(/setInterval\(\(\) => refresh\("stale"\), FALLBACK_POLL_MS\)/);
    expect(source).toMatch(/refresh\(\{ event: event\.event_type \}\)/);
  });
});
