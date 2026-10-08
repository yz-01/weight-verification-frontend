/**
 * A delivery-note read that always ends (hotfix after the October deploy).
 *
 * Lucas, on an iPhone: the DO photo stayed on 「读取中」 for good and 材料进场
 * could not be submitted. The server's read with the Chinese pack (X18) could
 * take minutes; the phone waited on it with no limit. The server now stops
 * itself at 20 s, and the phone stops waiting at `OCR_READ_TIMEOUT_MS` - long
 * enough for that plus the upload on a site signal - and says to type the
 * details in. A pending read never holds the form back either way.
 */

/** How long the phone waits for a read before asking for the details by hand. */
export const OCR_READ_TIMEOUT_MS = 30_000;

export type DeliveryNoteReadOutcome<T> =
  | { kind: "read"; result: T }
  | { kind: "failed"; reason: unknown }
  | { kind: "timedOut" };

/**
 * Settle with the read's outcome, or with `timedOut` once `ms` has passed.
 *
 * Never rejects, and settles exactly once: a read that answers after the
 * deadline is ignored here, so a late answer cannot refill a form the worker
 * has already typed into or submitted.
 */
export function readWithin<T>(
  start: () => Promise<T>,
  ms: number = OCR_READ_TIMEOUT_MS,
): Promise<DeliveryNoteReadOutcome<T>> {
  return new Promise((settle) => {
    let done = false;
    const finish = (outcome: DeliveryNoteReadOutcome<T>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "timedOut" }), ms);
    let pending: Promise<T>;
    try {
      pending = start();
    } catch (reason) {
      finish({ kind: "failed", reason });
      return;
    }
    Promise.resolve(pending).then(
      (result) => finish({ kind: "read", result }),
      (reason) => finish({ kind: "failed", reason }),
    );
  });
}
