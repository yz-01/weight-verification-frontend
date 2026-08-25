"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

import { getAccessToken } from "@/lib/auth-token";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

/**
 * Subscribe to shared waste-order events with a polling safety net.
 *
 * Native EventSource cannot send the bearer token used by this application,
 * so the stream is consumed through fetch. The endpoint closes after a short
 * window; reconnecting with the last timestamp makes that intentional close
 * cheap and avoids long-lived Django workers. If streaming is unavailable,
 * the same query keys are refreshed every 15 seconds.
 */
export function useOrderRealtime(queryKeys: QueryKey[]): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    let cursor = new Date().toISOString();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      for (const key of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const enableFallback = () => {
      if (fallbackTimer === null) fallbackTimer = setInterval(refresh, 15_000);
    };

    const connect = async () => {
      const token = getAccessToken();
      if (!token) return;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/events/stream/?after=${encodeURIComponent(cursor)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok || !response.body) throw new Error("SSE unavailable");
        if (fallbackTimer !== null) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
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
            if (
              event.event_type?.startsWith("waste_dispatch.") ||
              event.event_type === "notification.created"
            ) {
              refresh();
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) enableFallback();
      } finally {
        if (!controller.signal.aborted) retryTimer = setTimeout(connect, 1_000);
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (fallbackTimer !== null) clearInterval(fallbackTimer);
    };
  }, [queryClient, queryKeys]);
}
