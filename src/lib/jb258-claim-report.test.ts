/**
 * JB258 (客户 11-24b 事项 5, 图 7–9): 「进度 Claim 报表」 reads Multi Engine's
 * Progress Claim packages. 「确保原始资料与报表显示一致」: the report words 状态
 * and 审阅 exactly as Multi Engine's list does, its file words them the same,
 * a row opens the package, and every new column has words in four languages.
 */
import { describe, expect, it } from "vitest";

import type { ContractorReportRecord } from "@/interfaces/contractor-report";
import {
  CLAIM_REVIEW_CODES,
  claimReviewKeys,
  reportColumnValues,
  reportRowTarget,
  reportValueKeys,
  reportValueWords,
} from "@/lib/report-preview";
import { sendStatusKeys } from "@/components/contractor-ops/package-claim-parts";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

function lookup(catalogue: unknown, key: string): string | null {
  const value = key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    catalogue,
  );
  return typeof value === "string" ? value : null;
}

function codesOf(catalogue: unknown) {
  return (namespace: string) => {
    const node = namespace.split(".").reduce<unknown>(
      (at, part) => (at && typeof at === "object" ? (at as Record<string, unknown>)[part] : undefined),
      catalogue,
    );
    return node && typeof node === "object" ? Object.keys(node) : [];
  };
}

/** The list's own 审阅 words (`SendStatusWords` in multi-engine.tsx). */
function listWords(
  catalogue: unknown,
  sendStatus: { internal: boolean; external: "NONE" | "STARTED" | "SENT" },
  reviewState: string,
): string {
  const words = sendStatusKeys({ send_status: sendStatus, recipient_count: 0 }).map(
    (key) => lookup(catalogue, `multiEngine.sendStatus.${key}`) ?? "",
  );
  if (reviewState !== "NOT_SENT") words.push(lookup(catalogue, `multiEngine.review.${reviewState}`) ?? "");
  return words.join(" · ");
}

/** The server's `claim_report.review_code`. */
function serverCode(sendStatus: { internal: boolean; external: string }, reviewState: string): string {
  const parts: string[] = [];
  if (sendStatus.internal) parts.push("INTERNAL");
  if (sendStatus.external !== "NONE") parts.push(sendStatus.external);
  const code = parts.join("+") || "NOT_SENT";
  return reviewState !== "NOT_SENT" ? `${code}~${reviewState}` : code;
}

describe("JB258 进度 Claim 报表: 审阅 reads as Multi Engine's list", () => {
  const cases = [false, true].flatMap((internal) =>
    (["NONE", "STARTED", "SENT"] as const).flatMap((external) =>
      ["NOT_SENT", "SENT", "REVIEWED"].map((review) => ({ internal, external, review })),
    ),
  );

  it.each(Object.entries(CATALOGUES))("every code, %s", (_, catalogue) => {
    for (const { internal, external, review } of cases) {
      const code = serverCode({ internal, external }, review);
      const words = reportValueWords(
        reportValueKeys("claims", "review", code, {}),
        (key) => lookup(catalogue, key),
      );
      expect(words).toBe(listWords(catalogue, { internal, external }, review));
    }
  });

  it("the exported file words every code the server can send", () => {
    for (const { internal, external, review } of cases) {
      expect(CLAIM_REVIEW_CODES).toContain(serverCode({ internal, external }, review));
    }
    const values = reportColumnValues(
      "claims",
      ["review", "status"],
      (key) => lookup(zh, key),
      codesOf(zh),
    );
    expect(values.review["INTERNAL~SENT"]).toBe("已发送系统内 · 已发送，等待回复");
    expect(values.review.NOT_SENT).toBe("未发送");
    expect(values.review["INTERNAL+SENT~REVIEWED"]).toBe("已发送系统内 · 已对外发送 · 已审阅");
    // 状态 is the package's: 草稿 / 已确认（已锁定）.
    expect(values.status.CONFIRMED).toBe("已确认（已锁定）");
    expect(values.status.DRAFT).toBe("草稿");
  });

  it("splits a code into the list's keys", () => {
    expect(claimReviewKeys("INTERNAL+STARTED~SENT")).toEqual([
      "multiEngine.sendStatus.INTERNAL",
      "multiEngine.sendStatus.STARTED",
      "multiEngine.review.SENT",
    ]);
  });
});

describe("JB258 进度 Claim 报表: a row opens its package in Multi Engine", () => {
  it("EVIDENCE_PACKAGE → /evidence-packages?package=", () => {
    const entry: ContractorReportRecord = {
      kind: "EVIDENCE_PACKAGE",
      id: "p-1",
      project_id: null,
      user_id: null,
      date: null,
      cover_photo_url: null,
      photo_count: 0,
    };
    expect(reportRowTarget(entry)).toEqual({ href: "/evidence-packages?package=p-1" });
  });
});

describe("JB258 进度 Claim 报表: four languages", () => {
  const columns = [
    "package_no", "package_name", "review", "claim_amount", "approved_amount",
    "packed_by", "package_created_at",
  ];
  it.each(Object.entries(CATALOGUES))("%s names every new column", (_, catalogue) => {
    for (const column of columns) {
      expect(lookup(catalogue, `contractorReports.column.${column}`), column).toBeTruthy();
    }
  });
});
