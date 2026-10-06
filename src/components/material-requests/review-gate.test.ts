import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { materialRequestReviewView } from "@/components/material-requests/review-gate";

/**
 * The applicant never approves their own material request (D2, Q14).
 *
 * The customer's screenshot: the applicant "test" opened his own request and
 * saw 「批准」. The project manager and the company admin both hold submit and
 * review, so a permission check alone put the buttons in front of them.
 */
const APPLICANT = "user-applicant";
const REVIEWER = "user-reviewer";

const pending = { status: "SUBMITTED" as const, submitted_by: APPLICANT };

describe("who sees approve / return on a material request (D2)", () => {
  it("never shows them to the applicant, even one holding the review permission", () => {
    expect(materialRequestReviewView(pending, APPLICANT, true)).toBe("own");
    expect(materialRequestReviewView(pending, APPLICANT, false)).toBe("own");
  });

  it("shows them to somebody else who holds the review permission", () => {
    expect(materialRequestReviewView(pending, REVIEWER, true)).toBe("decide");
  });

  it("only waits for anybody else", () => {
    expect(materialRequestReviewView(pending, REVIEWER, false)).toBe("waiting");
  });

  it("does not offer them before it knows who is reading", () => {
    expect(materialRequestReviewView(pending, undefined, true)).toBe("waiting");
    expect(materialRequestReviewView(pending, null, true)).toBe("waiting");
  });

  it("offers nothing once the request is decided", () => {
    for (const status of ["APPROVED", "RETURNED"] as const) {
      expect(materialRequestReviewView({ status, submitted_by: APPLICANT }, REVIEWER, true)).toBe("none");
    }
  });

  it("is what the request detail actually renders the buttons from", () => {
    const detail = readFileSync(
      path.join(process.cwd(), "src/components/material-requests/material-requests-office.tsx"),
      "utf8",
    );
    // The approve button sits under the gate's "decide" and nowhere else.
    expect(detail).toMatch(/reviewView === "decide" && \([\s\S]*?t\("action\.approve"\)/);
    expect(detail.match(/t\("action\.approve"\)/g)).toHaveLength(1);
    // The applicant reads 「等待审批」 instead.
    expect(detail).toMatch(/reviewView === "own" && \([\s\S]*?t\("ownRequestWaiting"\)/);
    // The permission is read once, into the gate, not straight into the JSX.
    expect(detail.match(/can\("material_request\.review"\)/g)).toHaveLength(1);
    expect(detail).toMatch(/materialRequestReviewView\(row, user\?\.id, can\("material_request\.review"\)\)/);
  });
});
