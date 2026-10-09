/**
 * Lucas, 2026-10-09 「手机端原图备份页面调整」: the phone uploads by itself and
 * says only two things after a submit.
 *
 * - 「提交成功」 only when the server accepted the record with its photos;
 *   anything else is 「已暂存，等待上传」 - on the toast and on the row in
 *   「我提交过的」 until it uploads.
 * - Automatic retries back off (15 s doubling, at most 5 min).
 * - Originals go gently on a slow or metered connection, but go.
 * - The automatic backup keeps retrying a signal failure, and stops spending
 *   data on an original the server keeps refusing.
 */
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import {
  AUTO_ORIGINAL_ATTEMPTS,
  autoSendable,
  originalsPace,
  PACE,
  queuedRowKey,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  retryDelayMs,
  submitOutcomeKey,
} from "@/lib/upload-schedule";

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
}

const noSpread = () => 0.5;

describe("what the phone says after a submit (point 4)", () => {
  it("says 「提交成功」 only for a record the server accepted", () => {
    expect(lookup(zh, submitOutcomeKey("uploaded"))).toBe("提交成功");
    expect(lookup(zh, submitOutcomeKey("queued"))).toBe("已暂存，等待上传");
  });

  it("has both sentences in every language", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const outcome of ["uploaded", "queued"] as const) {
        expect(typeof lookup(messages, submitOutcomeKey(outcome))).toBe("string");
      }
    }
  });

  it("shows a record still on the phone as 「已暂存，等待上传」 until it uploads", () => {
    for (const state of ["waiting", "retrying", "syncing", "held"]) {
      expect(lookup(zh, queuedRowKey({ state }))).toBe("已暂存，等待上传");
    }
  });

  it("says a refused record was refused - it will not go by itself", () => {
    expect(queuedRowKey({ state: "failed" })).toBe("mySubmissions.uploadFailed");
    expect(lookup(zh, queuedRowKey({ state: "failed" }))).not.toBe("已暂存，等待上传");
  });
});

describe("automatic retry (point 2)", () => {
  it("backs off from 15 s, doubling, to at most 5 minutes", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map((failures) => retryDelayMs(failures, noSpread))).toEqual([
      15_000, 30_000, 60_000, 120_000, 240_000, RETRY_MAX_MS, RETRY_MAX_MS, RETRY_MAX_MS,
    ]);
  });

  it("spreads phones apart but stays within its bounds", () => {
    expect(retryDelayMs(0, () => 0)).toBe(Math.round(RETRY_BASE_MS * 0.8));
    expect(retryDelayMs(1, () => 1)).toBe(Math.round(30_000 * 1.2));
    expect(retryDelayMs(20, () => 1)).toBe(RETRY_MAX_MS);
    expect(retryDelayMs(-3, noSpread)).toBe(RETRY_BASE_MS);
  });
});

describe("how originals go on this connection", () => {
  it("is gentle on data saver, mobile data, 2G/3G or under 1 Mbit/s", () => {
    expect(originalsPace({ saveData: true })).toBe("gentle");
    expect(originalsPace({ type: "cellular" })).toBe("gentle");
    expect(originalsPace({ effectiveType: "3g" })).toBe("gentle");
    expect(originalsPace({ effectiveType: "slow-2g" })).toBe("gentle");
    expect(originalsPace({ effectiveType: "4g", downlink: 0.4 })).toBe("gentle");
  });

  it("is normal on Wi-Fi, a fast line, or when the browser does not say", () => {
    expect(originalsPace({ type: "wifi", effectiveType: "4g", downlink: 10 })).toBe("normal");
    expect(originalsPace(null)).toBe("normal");
    expect(originalsPace(undefined)).toBe("normal");
  });

  it("only waits longer when gentle - it never stops", () => {
    expect(PACE.normal).toEqual({ startDelayMs: 0, gapMs: 0 });
    expect(PACE.gentle.startDelayMs).toBeGreaterThan(0);
    expect(PACE.gentle.gapMs).toBeGreaterThan(0);
  });
});

describe("which originals the automatic backup sends (point 3)", () => {
  it("sends every waiting one", () => {
    expect(autoSendable({ state: "pending" })).toBe(true);
  });

  it("keeps retrying one that only lacked a signal", () => {
    expect(autoSendable({ state: "failed", attempts: 40, lastErrorCode: "network" })).toBe(true);
    expect(autoSendable({ state: "failed", attempts: 40, lastErrorCode: "timeout" })).toBe(true);
  });

  it("leaves one the server keeps refusing for the technical page", () => {
    const refused = { state: "failed", lastErrorCode: "original_hash_mismatch" };
    expect(autoSendable({ ...refused, attempts: AUTO_ORIGINAL_ATTEMPTS - 1 })).toBe(true);
    expect(autoSendable({ ...refused, attempts: AUTO_ORIGINAL_ATTEMPTS })).toBe(false);
  });

  it("never sends one whose record has not reached the server by this rule", () => {
    expect(autoSendable({ state: "captured" })).toBe(false);
  });
});
