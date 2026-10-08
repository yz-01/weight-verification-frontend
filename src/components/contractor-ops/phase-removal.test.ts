/**
 * p23 (B1 follow-up): a construction phase (施工阶段) added by mistake can be
 * removed again from the 施工进度 page's own phase dialog. 分类管理 used to
 * be the only screen calling `delete_phase`, and it no longer manages phases
 * (Q5, X7) - which left the backend action with no screen
 * (core.tests.test_ui_reachability).
 *
 * `PhaseDialog` is a Radix dialog, which draws into a portal the static
 * renderer cannot reach, so this reads the source the way the other
 * guard tests here do. B17 will rebuild the page; the guard is the point.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const source = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/operations-workspaces.tsx"),
  "utf8",
);
const dialog = source.slice(
  source.indexOf("export function PhaseDialog("),
  source.indexOf("export function ProgressDialog("),
);

describe("removing a construction phase from the progress page", () => {
  it("calls the backend delete for an existing phase only", () => {
    expect(dialog).toMatch(/deleteConstructionPhase\(phase!\.id\)/);
    expect(dialog).toMatch(/\{phase && \(\s*<div[^>]*border-tone-rose/);
  });

  it("is armed by a switch, never a confirm dialog (spec rule 8)", () => {
    expect(dialog).toMatch(/<Switch\s+checked=\{removeArmed\}/);
    expect(dialog).toMatch(/\{removeArmed && \(\s*<Button/);
    expect(dialog).not.toMatch(/ConfirmDialog|window\.confirm/);
  });

  it("shows the server's refusal (a phase records still point at) beside it", () => {
    expect(dialog).toMatch(/error instanceof ApiError \? error\.message/);
    expect(dialog).toMatch(/role="alert"[\s\S]{0,80}\{removeRefusal\}/);
  });

  it("is reached from the 施工分类 tab and the phone's list, which open the dialog", () => {
    // B17: the office manages phases on the progress page's 施工分类 tab.
    const tab = readFileSync(
      path.join(process.cwd(), "src/components/progress/phase-tab.tsx"),
      "utf8",
    );
    expect(tab).toMatch(/<PhaseDialog[\s\S]{0,80}phase=\{editingPhase\}/);
    expect(source).toMatch(/<PhaseDialog[\s\S]{0,80}phase=\{editingPhase\}/);
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const remove = messages.contractorOps.progress.phaseRemove;
      for (const key of ["switch", "hint", "confirm", "failed"] as const) {
        expect(remove[key].trim()).not.toBe("");
      }
    }
  });
});
