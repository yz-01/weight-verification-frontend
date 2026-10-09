import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { clearedNotices } from "@/lib/conversation-notices";

/**
 * Re-read the bell when opening a conversation settled a chat notice.
 *
 * The server clears the reader's notice for a thread when they read it
 * (2026-10-09); without this the red dot would wait for its next poll.
 */
export function useBellRefreshOnRead(
  response: { cleared_notices?: number } | undefined,
): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (clearedNotices(response)) {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }, [response, queryClient]);
}
