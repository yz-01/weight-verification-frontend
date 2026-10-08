"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { getAccessToken } from "@/lib/auth-token";
import type { RealtimeEvent } from "@/lib/hazard-popup";
import { refreshChanged, refreshStale } from "@/lib/live-refresh";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

/**
 * Event families that mean "something on screen is now out of date".
 *
 * `waste_dispatch.` is the shared-order channel: the backend writes every one
 * of those twice, once per company, so it is how a contractor sees the driver's
 * GPS and status at all. The rest have no shared-order counterpart and would
 * otherwise only surface on the next poll — weighing anomalies, private
 * (non-dispatch) weighing sessions, and fleet-internal task movement.
 */
const REFRESH_PREFIXES = [
  "waste_dispatch.",
  // Not covered by the line above: `dispatch.assigned` is its own family, and
  // "waste_dispatch." does not prefix-match it. Missing it meant a contractor
  // was not told when their order was handed to a recycler.
  "dispatch.",
  "weighing.",
  "driver_task.",
  "gps.",
  // Approvals already emit `approval.<action>` from the service layer; nothing
  // subscribed, so the approvals list was the one screen in the product that
  // still needed a manual refresh to see a decision land.
  "approval.",
  "safety.",
  "attendance.",
  "deduction.",
  "partnership.",
  "receipt.",
  "field_task.",
  "equipment.",
  "progress.",
  "material_outgoing.",
  // A site's material request (C03). The backend emits it since 2026-10;
  // before that the office's request list waited for a navigation.
  "material_request.",
  "disposal.",
];
const REFRESH_EXACT = "notification.created";
const REALTIME_PERMISSION_CODES = new Set([
  "notification.view",
  "material_request.view",
  "dispatch.view",
  "task.view",
  "weighing.view",
  "deduction.view",
  "safety.view",
  "attendance.view",
  "receipt.view",
  "field_task.view",
  "equipment.view",
  "progress.view",
  "material_outgoing.view",
  "disposal.view",
  "partnership.view",
  "document.view",
  "integration.view",
  "audit.view",
  "platform.monitor",
]);

/**
 * Collapse a burst of events into one invalidation.
 *
 * A lorry arriving fires several events at once, and each one used to trigger
 * its own refetch of every query key the caller passed. Waiting a moment costs
 * nothing against a five-second target and turns a burst into a single refetch.
 */
const COALESCE_MS = 400;
const FALLBACK_POLL_MS = 15_000;
/**
 * A slow safety poll that runs even while the stream is connected.
 *
 * The stream is the fast path, not the only path. An event the backend does
 * not emit for some record, one dropped between a reconnect's cursor and the
 * next, or a proxy holding the response back all left a screen stale until
 * the person navigated — that was the office's experience of a phone's
 * submission (Lucas, 2026-10). One pass a minute, only while the tab is
 * visible, bounds that staleness. It refetches only what is on screen and
 * already stale by its own `staleTime` (`refreshStale`, audit S1): not every
 * query, not report aggregations, not cards that poll themselves.
 */
export const SAFETY_POLL_MS = 60_000;
const RECONNECT_MS = 1_000;
const REJECTED_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;

export function shouldRefresh(eventType: string | undefined): boolean {
  if (!eventType) return false;
  if (eventType === REFRESH_EXACT) return true;
  return REFRESH_PREFIXES.some((prefix) => eventType.startsWith(prefix));
}

/**
 * How long to wait after the server refused the stream.
 *
 * The endpoint caps concurrent streams and answers 503 with `Retry-After` when
 * it is full. Reconnecting a second later — which is what this hook used to do
 * for *every* failure, rejection included — means every refused client keeps
 * knocking once a second, each knock still costing an authentication and a
 * permission query. That is load amplification at the exact moment the server
 * has none to spare, so a refusal is honoured rather than retried through.
 */
export function backoffFromResponse(response: Response): number {
  const seconds = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, MAX_BACKOFF_MS);
  }
  return REJECTED_BACKOFF_MS;
}

export function canUseRealtime(
  permissions: readonly string[],
  isPlatformStaff = false,
): boolean {
  return isPlatformStaff || permissions.some((code) => REALTIME_PERMISSION_CODES.has(code));
}

/**
 * Subscribe to shared waste-order events with a polling safety net.
 *
 * Native EventSource cannot send the bearer token used by this application,
 * so the stream is consumed through fetch. The endpoint closes after a short
 * window; reconnecting with the last timestamp makes that intentional close
 * cheap and avoids long-lived Django workers. If streaming is unavailable,
 * the same query keys are refreshed every 15 seconds.
 *
 * `queryKeys` is a dependency of the effect, so callers must pass a memoised
 * array. An inline literal would be a new reference on every render and would
 * tear down and rebuild the connection each time.
 *
 * `onEvent` hears every event the stream delivers (the office's hazard pop-up
 * card, C3). It is read through a ref, so a new function each render does not
 * reconnect.
 */
export function useOrderRealtime(
  queryKeys: readonly QueryKey[],
  refreshAllEvents = false,
  enabled = true,
  onEvent?: (event: RealtimeEvent) => void,
): void {
  const queryClient = useQueryClient();
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    /**
     * Seeded from the server's own clock, never from `new Date()`.
     *
     * The cursor is compared against server timestamps. Seeding it from the
     * device meant a driver's phone running a minute fast silently skipped the
     * first minute of events — and a phone is exactly the device whose clock
     * drifts. Null means "no cursor yet": the request omits `after` entirely
     * and the server anchors to its own now.
     */
    let cursor: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    // Whether anything in the coalescing window said the data changed (an
    // event, the stream-down fallback) rather than only the safety poll.
    let changedPending = false;

    /**
     * `changed`: an event or the fallback - the data moved, so live queries
     * are invalidated even if fresh. Otherwise (the safety poll) only what is
     * on screen and already stale refetches (`@/lib/live-refresh`).
     */
    const refresh = (changed: boolean) => {
      if (changed) changedPending = true;
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        const dataChanged = changedPending;
        changedPending = false;
        if (queryKeys.length === 0 || queryKeys.some((key) => key.length === 0)) {
          void (dataChanged ? refreshChanged(queryClient) : refreshStale(queryClient));
          return;
        }
        for (const key of queryKeys) {
          void (dataChanged
            ? queryClient.invalidateQueries({ queryKey: key })
            : queryClient.refetchQueries({ queryKey: key, type: "active", stale: true }));
        }
      }, COALESCE_MS);
    };

    const enableFallback = () => {
      if (fallbackTimer === null) {
        fallbackTimer = setInterval(() => refresh(true), FALLBACK_POLL_MS);
      }
    };

    const disableFallback = () => {
      if (fallbackTimer !== null) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const connect = async () => {
      const token = getAccessToken();
      if (!token) {
        if (!controller.signal.aborted) {
          retryTimer = setTimeout(connect, RECONNECT_MS);
        }
        return;
      }
      let delay = RECONNECT_MS;
      try {
        const query = cursor ? `?after=${encodeURIComponent(cursor)}` : "";
        const response = await fetch(
          `${API_BASE_URL}/api/events/stream/${query}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok || !response.body) {
          // Refused or unavailable: wait as long as the server asked, and keep
          // the screen current by polling in the meantime.
          delay = backoffFromResponse(response);
          enableFallback();
          return;
        }
        if (cursor === null) {
          // `Date` is CORS-safelisted, so it is readable without any extra
          // server configuration. One-second granularity may replay the last
          // second of events, which is harmless: invalidation is idempotent.
          const serverNow = response.headers.get("Date");
          if (serverNow) {
            const parsed = new Date(serverNow);
            if (!Number.isNaN(parsed.getTime())) cursor = parsed.toISOString();
          }
        }
        disableFallback();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split("\n\n");
          buffer = messages.pop() ?? "";
          for (const message of messages) {
            const line = message
              .split("\n")
              .find((part) => part.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6)) as RealtimeEvent;
            if (event.occurred_at) cursor = event.occurred_at;
            if (refreshAllEvents || shouldRefresh(event.event_type)) refresh(true);
            onEventRef.current?.(event);
          }
        }
      } catch {
        if (!controller.signal.aborted) enableFallback();
      } finally {
        if (!controller.signal.aborted) retryTimer = setTimeout(connect, delay);
      }
    };

    // Defer the initial request by one task. React's development strict mode
    // mounts, cleans up, and mounts effects again; starting fetch immediately
    // briefly opened two server streams before the aborted request released
    // its admission slot.
    retryTimer = setTimeout(connect, 0);
    const safetyTimer = setInterval(() => {
      // A hidden tab refetches when it is next focused instead
      // (`refetchOnWindowFocus`), so it costs nothing while hidden.
      if (typeof document !== "undefined" && document.hidden) return;
      refresh(false);
    }, SAFETY_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(safetyTimer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      disableFallback();
    };
  }, [enabled, queryClient, queryKeys, refreshAllEvents]);
}
