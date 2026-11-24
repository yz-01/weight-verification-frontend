/**
 * JB258 (客户 11-24b 事项 5, 图 7–9): 「进度 Claim 报表」 reads Multi Engine's
 * Progress Claim packages. 「确保原始资料与报表显示一致」: the report words 状态
 * and 审阅 exactly as Multi Engine's list does, its file words them the same,
 * a row opens the package, and every new column has words in four languages.
 */
import { describe, expect, it } from "vitest";

import { PACKAGE_PROGRESS } from "@/interfaces/contractor-ops";
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

/**
 * The list's own 审阅 cell (`SendStatusWords` in multi-engine.tsx, JB252): the
 * review in the client's words (`jb252.progress`), 资料传阅 for a package only
 * sent to read, then an outside share (`multiEngine.sendStatus`).
 */
function listWords(
  catalogue: unknown,
  sendStatus: { internal: boolean; external: "NONE" | "STARTED" | "SENT" },
  progress: string,
): string {
  const first =
    progress === "NOT_SENT" && sendStatus.internal
      ? lookup(catalogue, "jb252.purpose.CIRCULATION")
      : lookup(catalogue, `jb252.progress.${progress}`);
  const shares = sendStatusKeys({ send_status: sendStatus, recipient_count: 0 })
    .filter((key) => key === "STARTED" || key === "SENT")
    .map((key) => lookup(catalogue, `multiEngine.sendStatus.${key}`) ?? "");
  return [first ?? "", ...shares].join(" · ");
}

/** The server's `claim_report.review_cell`. */
function serverCode(sendStatus: { internal: boolean; external: string }, progress: string): string {
  const first = progress === "NOT_SENT" && sendStatus.internal ? "CIRCULATION" : progress;
  return sendStatus.external === "NONE" ? first : `${first}+${sendStatus.external}`;
}

describe("JB258 进度 Claim 报表: 审阅 reads as Multi Engine's list", () => {
  const cases = [false, true].flatMap((internal) =>
    (["NONE", "STARTED", "SENT"] as const).flatMap((external) =>
      PACKAGE_PROGRESS.map((progress) => ({ internal, external, progress })),
    ),
  );

  it.each(Object.entries(CATALOGUES))("every code, %s", (_, catalogue) => {
    for (const { internal, external, progress } of cases) {
      const code = serverCode({ internal, external }, progress);
      const words = reportValueWords(
        reportValueKeys("claims", "review", code, {}),
        (key) => lookup(catalogue, key),
      );
      expect(words, code).toBe(listWords(catalogue, { internal, external }, progress));
    }
  });

  it("the exported file words every code the server can send", () => {
    for (const { internal, external, progress } of cases) {
      expect(CLAIM_REVIEW_CODES).toContain(serverCode({ internal, external }, progress));
    }
    const values = reportColumnValues(
      "claims",
      ["review", "status"],
      (key) => lookup(zh, key),
      codesOf(zh),
    );
    expect(values.review.SENT).toBe("已发送，待审核");
    expect(values.review.NOT_SENT).toBe("未发送");
    expect(values.review.CIRCULATION).toBe("资料传阅");
    expect(values.review["IN_REVIEW+SENT"]).toBe("审核处理中 · 已对外发送");
    // 状态 as the list: 草稿 / 已确认（已锁定） / 已完成（已归档）.
    expect(values.status.CONFIRMED).toBe("已确认（已锁定）");
    expect(values.status.DRAFT).toBe("草稿");
    expect(values.status.COMPLETED).toBe("已完成（已归档）");
  });

  it("words 状态 COMPLETED in four languages", () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      const words = reportValueWords(
        reportValueKeys("claims", "status", "COMPLETED", {}),
        (key) => lookup(catalogue, key),
      );
      expect(words).toBe(lookup(catalogue, "jb252.stateCompleted"));
    }
  });

  it("splits a code into the list's keys", () => {
    expect(claimReviewKeys("IN_REVIEW+STARTED")).toEqual([
      "jb252.progress.IN_REVIEW",
      "multiEngine.sendStatus.STARTED",
    ]);
    expect(claimReviewKeys("CIRCULATION")).toEqual(["jb252.purpose.CIRCULATION"]);
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
