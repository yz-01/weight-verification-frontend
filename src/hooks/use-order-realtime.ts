"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

import { getAccessToken } from "@/lib/auth-token";

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
];
const REFRESH_EXACT = "notification.created";

/**
 * Collapse a burst of events into one invalidation.
 *
 * A lorry arriving fires several events at once, and each one used to trigger
 * its own refetch of every query key the caller passed. Waiting a moment costs
 * nothing against a five-second target and turns a burst into a single refetch.
 */
const COALESCE_MS = 400;
const FALLBACK_POLL_MS = 15_000;
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
 */
export function useOrderRealtime(queryKeys: readonly QueryKey[], refreshAllEvents = false): void {
  const queryClient = useQueryClient();

  useEffect(() => {
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

    const refresh = () => {
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (queryKeys.length === 0) {
          void queryClient.invalidateQueries();
          return;
        }
        for (const key of queryKeys) {
          void queryClient.invalidateQueries(
            key.length === 0 ? undefined : { queryKey: key },
          );
        }
      }, COALESCE_MS);
    };

    const enableFallback = () => {
      if (fallbackTimer === null) {
        fallbackTimer = setInterval(refresh, FALLBACK_POLL_MS);
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
            const event = JSON.parse(line.slice(6)) as {
              event_type?: string;
              occurred_at?: string;
            };
            if (event.occurred_at) cursor = event.occurred_at;
            if (refreshAllEvents || shouldRefresh(event.event_type)) refresh();
          }
        }
      } catch {
        if (!controller.signal.aborted) enableFallback();
      } finally {
        if (!controller.signal.aborted) retryTimer = setTimeout(connect, delay);
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      disableFallback();
    };
  }, [queryClient, queryKeys, refreshAllEvents]);
}
