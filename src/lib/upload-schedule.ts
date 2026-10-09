/**
 * The phone uploads by itself (Lucas, 2026-10-09 「手机端原图备份页面调整」).
 *
 * 1. 现场人员只需拍照、提交，不需要了解原图备份和同步操作。
 * 2. 网络不好时自动暂存，恢复网络后自动上传。
 * 3. 原图备份由系统自动完成，无需人工开关。
 * 4. 服务器收到记录及照片才显示「提交成功」，否则显示「已暂存，等待上传」。
 *
 * The pure rules behind that, kept apart from the timers and the network so
 * they can be tested: what the phone says after a submit, how long it waits
 * before trying again, how gently originals go on a slow or metered
 * connection, and which originals it keeps trying on its own.
 */

/** What a submit came to: the server answered with the record, or the queue holds it. */
export type SubmitOutcome = "uploaded" | "queued";

/** 「提交成功」 only for an accepted record; everything else is 「已暂存，等待上传」. */
export const SUBMIT_OUTCOME_KEY: Record<SubmitOutcome, string> = {
  uploaded: "offline.submitted",
  queued: "offline.queued",
};

export function submitOutcomeKey(outcome: SubmitOutcome): string {
  return SUBMIT_OUTCOME_KEY[outcome];
}

/**
 * How a record still on the phone reads in 「我提交过的」.
 *
 * Waiting, or retrying after no answer: 「已暂存，等待上传」 - it goes by itself.
 * Refused by the server (`failed`): it will not go by itself, so it says so.
 */
export function queuedRowKey(entry: { state: string }): string {
  return entry.state === "failed" ? "mySubmissions.uploadFailed" : "offline.queued";
}

/** First automatic retry after a pass that sent nothing. */
export const RETRY_BASE_MS = 15_000;
/** Never longer than this between automatic tries. */
export const RETRY_MAX_MS = 5 * 60_000;

/**
 * How long to wait before the next automatic try, after `failures` passes in
 * a row that sent nothing: 15 s, 30 s, 1 min, 2 min, 4 min, then 5 min.
 *
 * `random` spreads phones that lost the signal together (±20 %); a value of
 * 0.5 adds nothing, which the tests use.
 */
export function retryDelayMs(failures: number, random: () => number = Math.random): number {
  const steps = Math.max(0, Math.floor(failures));
  const plain = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(steps, 10));
  const spread = plain * 0.2 * (random() * 2 - 1);
  return Math.round(Math.min(RETRY_MAX_MS, Math.max(RETRY_BASE_MS / 2, plain + spread)));
}

/** The parts of `navigator.connection` the pace reads (Chrome / Android only). */
export interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
  /** Megabits per second, as the browser estimates it. */
  downlink?: number;
}

export type OriginalsPace = "normal" | "gentle";

/**
 * How originals go on this connection.
 *
 * `gentle` on a metered or slow one - data saver on, mobile data, 2G/3G, or
 * under 1 Mbit/s - so the worker's records and data come first. Originals
 * still go; they only wait longer and go one at a time with a pause. With no
 * information (iPhone, desktop) the pace is normal.
 */
export function originalsPace(connection: ConnectionInfo | null | undefined): OriginalsPace {
  if (!connection) return "normal";
  if (connection.saveData) return "gentle";
  if (connection.type === "cellular") return "gentle";
  if (["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "")) return "gentle";
  if (typeof connection.downlink === "number" && connection.downlink > 0 && connection.downlink < 1) {
    return "gentle";
  }
  return "normal";
}

/** The waits each pace means: before a run starts, and between two originals. */
export const PACE: Record<OriginalsPace, { startDelayMs: number; gapMs: number }> = {
  normal: { startDelayMs: 0, gapMs: 0 },
  gentle: { startDelayMs: 60_000, gapMs: 20_000 },
};

/** This browser's connection, when it says. */
export function readConnection(): ConnectionInfo | null {
  if (typeof navigator === "undefined") return null;
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  return connection ?? null;
}

/** Failure codes that only mean "no signal": always worth another try. */
const NO_ANSWER = new Set(["network", "timeout"]);

/** After this many refusals in a row an original waits for a technician. */
export const AUTO_ORIGINAL_ATTEMPTS = 3;

/**
 * Whether the automatic backup sends this original by itself.
 *
 * Waiting ones always; failed ones while the failure was only the signal, or
 * for a few tries otherwise. One the server keeps refusing (its bytes do not
 * match what was declared, for instance) would spend the worker's data every
 * few minutes for nothing: it stays on the phone, untouched, and the
 * technical page shows it with its own 「重试」.
 */
export function autoSendable(row: { state: string; attempts?: number; lastErrorCode?: string }): boolean {
  if (row.state === "pending") return true;
  if (row.state !== "failed") return false;
  if (NO_ANSWER.has(row.lastErrorCode ?? "")) return true;
  return (row.attempts ?? 0) < AUTO_ORIGINAL_ATTEMPTS;
}
