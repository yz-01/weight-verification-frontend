/**
 * Several files, one server call each (I40): what went up, and what did not.
 *
 * The server takes one file per call, so a batch can half succeed. The screen
 * must then keep only the files that did NOT go up - otherwise pressing the
 * button again saves the first file twice - and refresh, because something is
 * already saved. A failed file does not stop the ones after it: they are
 * independent, and the server's refusal for each is shown by the caller.
 */

export interface BatchResult<T = File> {
  saved: T[];
  failed: { item: T; error: unknown }[];
}

export async function uploadEach<T = File>(
  items: readonly T[],
  send: (item: T) => Promise<unknown>,
): Promise<BatchResult<T>> {
  const result: BatchResult<T> = { saved: [], failed: [] };
  for (const item of items) {
    try {
      await send(item);
      result.saved.push(item);
    } catch (error) {
      result.failed.push({ item, error });
    }
  }
  return result;
}

/** What is still to send after a batch: exactly the ones that failed. */
export function remainingAfter<T = File>(result: BatchResult<T>): T[] {
  return result.failed.map((entry) => entry.item);
}
