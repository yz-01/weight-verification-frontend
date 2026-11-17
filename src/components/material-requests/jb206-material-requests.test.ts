/**
 * JB206 (Lucas 11-16 audit) on the MR detail:
 *
 * - JB206-2: 修改 / 删除 only for whom the server lets change it - the
 *   applicant or an approver (`material_request.review`, `_changeable`);
 * - JB206-8: still with the project manager, the line names him and the
 *   stage, so head office knows it is not theirs yet;
 * - JB206-13 (「总部可以代为审批」): with that manager's account suspended,
 *   head office gets approve / return - 「总部代批」 - and while he is active
 *   it still waits.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  decidesForAwayManager,
  materialRequestReviewView,
  materialRequestWaiting,
  mayChangeMaterialRequest,
} from "@/components/material-requests/review-gate";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const detail = readFileSync(
  path.join(process.cwd(), "src/components/material-requests/material-requests-office.tsx"),
  "utf8",
);

describe("修改 / 删除 follow the server's rule (JB206-2)", () => {
  const row = { submitted_by: "worker" };
  const grants = (codes: string[]) => (code: string) => codes.includes(code);

  it("is the applicant's", () => {
    expect(mayChangeMaterialRequest(row, "worker", grants([]))).toBe(true);
  });

  it("is an approver's", () => {
    expect(mayChangeMaterialRequest(row, "hq", grants(["material_request.review"]))).toBe(true);
  });

  it("is nobody else's - a project manager at his 转呈 stage included", () => {
    expect(mayChangeMaterialRequest(row, "pm", grants(["material_request.config"]))).toBe(false);
    expect(mayChangeMaterialRequest(row, undefined, grants([]))).toBe(false);
  });

  it("decides both 修改 and 删除 on the detail", () => {
    expect(detail).toContain("const mayChange = mayChangeMaterialRequest(row, user?.id, can);");
    expect(detail).toMatch(/const changeable =\s*mayChange && !decided/);
    expect(detail).toMatch(/changeable \|\| \(mayChange && decided/);
  });
});

describe("whose desk it is on, by name and stage (JB206-8)", () => {
  it("says the project manager's stage while it is with him", () => {
    expect(
      materialRequestWaiting({ assigned_reviewer_name: "Ah Kow", awaiting_manager: true }),
    ).toEqual({ key: "waitingForManager", name: "Ah Kow" });
  });

  it("keeps 「等待 XXX 审批」 once head office has it", () => {
    expect(
      materialRequestWaiting({ assigned_reviewer_name: "HQ Lim", awaiting_manager: false }),
    ).toEqual({ key: "waitingFor", name: "HQ Lim" });
    expect(materialRequestWaiting({ assigned_reviewer_name: null })).toBeNull();
  });

  it("has the words in every catalogue", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.materialRequest.waitingForManager).toContain("{name}");
    }
    expect(zh.materialRequest.waitingForManager).toContain("项目经理");
    expect(detail).toContain("t(waiting.key, { name: waiting.name })");
  });
});

describe("「总部代批」 while the project manager is away (JB206-13)", () => {
  const atManager = {
    status: "SUBMITTED" as const,
    submitted_by: "worker",
    assigned_reviewer: "pm",
    awaiting_manager: true,
  };

  it("gives head office approve / return when his account is not active", () => {
    const row = { ...atManager, assigned_reviewer_active: false };
    expect(materialRequestReviewView(row, "hq", true)).toBe("decide");
    expect(decidesForAwayManager(row, "decide")).toBe(true);
  });

  it("changes nothing while he is active", () => {
    const row = { ...atManager, assigned_reviewer_active: true };
    expect(materialRequestReviewView(row, "hq", true)).toBe("waiting");
    expect(materialRequestReviewView(row, "pm", false)).toBe("manager");
    // An older server that does not say: as before.
    expect(materialRequestReviewView(atManager, "hq", true)).toBe("waiting");
  });

  it("is head office's only - not every reader's, and never the applicant's", () => {
    const row = { ...atManager, assigned_reviewer_active: false };
    expect(materialRequestReviewView(row, "site-clerk", false)).toBe("waiting");
    expect(materialRequestReviewView(row, "worker", true)).toBe("own");
  });

  it("says so above the buttons and keeps it in the history", () => {
    expect(detail).toMatch(/forAwayManager && \([\s\S]*?t\("onBehalf\.help"/);
    expect(detail).toContain('entry.decision === "RETURNED" ? "onBehalf.returned" : "onBehalf.approved"');
    expect(detail).toContain('label: t("field.onBehalfHistory")');
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.materialRequest.onBehalf.help).toContain("{manager}");
      expect(messages.materialRequest.onBehalf.approved).toContain("{by}");
      expect(messages.audit.operation.head_office_on_behalf).toBeTruthy();
    }
    expect(zh.materialRequest.field.onBehalfHistory).toBe("总部代批");
    expect(zh.audit.operation.head_office_on_behalf).toBe("总部代批");
  });
});
