/**
 * The six-digit sign-off PIN's bridge (I29, ID67).
 *
 * The office operations the client listed - a daily report written, changed,
 * exported or removed, the schedule changed, an exit approved, a role
 * changed... - are refused by the server with `sign_off_pin_required` until
 * the request carries the PIN (`X-Sign-Off-PIN`). Rather than every screen
 * growing its own PIN box, the API client hands that refusal here, the one
 * dialog mounted at the root asks for the PIN, and the client sends the same
 * request again with it. A wrong PIN comes back here too, worded with the
 * tries left; a lock is said with the time it opens.
 *
 * Nothing is registered on a screen without the dialog (a phone screen, a
 * test): the refusal is then an ordinary failure. The phone never meets it -
 * the server does not ask an account that signs in on the phone.
 */

export const SIGN_OFF_CODES = {
  required: "sign_off_pin_required",
  notSet: "sign_off_pin_not_set",
  incorrect: "sign_off_pin_incorrect",
  locked: "sign_off_pin_locked",
} as const;

/** The failure a cancelled PIN dialog leaves: nothing to toast. */
export const SIGN_OFF_CANCELLED = "sign_off_cancelled";

const FOLLOW_UPS: ReadonlySet<string> = new Set([
  SIGN_OFF_CODES.notSet,
  SIGN_OFF_CODES.incorrect,
  SIGN_OFF_CODES.locked,
]);

/**
 * Whether a refusal is the dialog's to answer.
 *
 * `required` always is. The others only when this request carried a PIN the
 * dialog gave it - a consultant's decision sends its PIN in its own form field
 * and words a wrong one in its own dialog.
 */
export function isSignOffRefusal(status: number, code: string, sentPin: boolean): boolean {
  if (status !== 403) return false;
  if (code === SIGN_OFF_CODES.required) return true;
  return sentPin && FOLLOW_UPS.has(code);
}

export interface SignOffAsk {
  /** The refusal being answered: `required` the first time. */
  code: string;
  /** Already in the reader's language (the tries left, when it opens). */
  message: string;
  /** The operation, `daily_report.delete` etc. - the dialog names it. */
  action?: string;
}

type Ask = (ask: SignOffAsk) => Promise<string | null>;

let asker: Ask | null = null;
let closer: (() => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** The dialog registers itself; the returned function unregisters it. */
export function registerSignOff(ask: Ask, close: () => void): () => void {
  asker = ask;
  closer = close;
  return () => {
    if (asker === ask) {
      asker = null;
      closer = null;
    }
  };
}

export function hasSignOffDialog(): boolean {
  return asker !== null;
}

/**
 * Ask for the PIN; `null` when the person closed the dialog or no dialog is
 * mounted. Two operations at once ask one after the other.
 */
export function askSignOff(ask: SignOffAsk): Promise<string | null> {
  const current = asker;
  if (!current) return Promise.resolve(null);
  const job = queue.then(() => current(ask));
  queue = job.catch(() => undefined);
  return job;
}

/** The request the PIN was for has finished, either way: close the dialog. */
export function settleSignOff(): void {
  closer?.();
}

/** A test's way back to nothing registered. */
export function resetSignOffForTests(): void {
  asker = null;
  closer = null;
  queue = Promise.resolve();
}

/**
 * A consultant's approval credential is a signature with its PIN, switched
 * on. A PIN set alone on 「我的签核密码」, or one an administrator reset, is not
 * one: the review then asks for the credential to be set up (I29).
 */
export function signsWithCredential(
  credential: { is_active: boolean; signature: string | null } | null | undefined,
): boolean {
  return Boolean(credential && credential.is_active && credential.signature);
}
