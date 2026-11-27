/**
 * JB245 (客户 11-23 事项 17): 「人员一旦被撤除项目权限，必须立即停止该项目的所有
 * 操作权限」.
 *
 * The server refuses a person taken off a project (``project_left``) and marks
 * the tasks they had (``assignee_left_project``). Here: the office sees
 * 「已移出项目」 beside the name, the edit form says to choose somebody else,
 * the refusal is said in words in all four languages, and a refusal makes the
 * phone read everything again.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  getAccessToken: () => "field-access",
  getRefreshToken: () => "field-refresh",
  getSessionPortal: () => "MSE_TRACE",
  isFieldSessionContext: () => true,
  isDriverSessionContext: () => false,
}));

import { AssigneeName } from "@/components/contractor-ops/assignee-left-tag";
import { renderDetail } from "@/components/shared/record-detail-test-kit";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("JB245 - a person taken off a project", () => {
  it("shows 「已移出项目」 beside the name only when the server says so", () => {
    const left = renderDetail(<AssigneeName name="ah ong" left />);
    expect(left).toContain("ah ong");
    expect(left).toContain("已移出项目");
    const still = renderDetail(<AssigneeName name="ong" left={false} />);
    expect(still).toBe("ong");
  });

  it("puts the tag on the task list, the task sheet and the edit form", () => {
    const list = source("src/components/contractor-ops/operations-workspaces.tsx");
    expect(list).toContain(
      "<AssigneeName name={row.assigned_to_name} left={row.assignee_left_project} />",
    );
    expect(list).toContain('left("leftProjectHelp", { name: task.assigned_to_name })');
    const sheet = source("src/components/dashboard/field-task-sheet.tsx");
    expect(sheet).toContain(
      "<AssigneeName name={row.assigned_to_name} left={row.assignee_left_project} />",
    );
  });

  it("has the words in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const api = messages.errors.api as Record<string, string>;
      const field = messages.errors.field as Record<string, string>;
      expect(api.project_left).toContain("{project}");
      expect(field.assignee_not_on_project).toBeTruthy();
      expect(messages.jb245.leftProject).toBeTruthy();
      expect(messages.jb245.leftProjectHelp).toContain("{name}");
    }
    expect(zh.errors.api.project_left).not.toContain("您");
    expect(zh.jb245.leftProject).toBe("已移出项目");
  });

  it("makes the phone read everything again after a project_left refusal", async () => {
    const dispatchEvent = vi.fn();
    const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    vi.stubGlobal("window", {
      location: { pathname: "/field-staff", href: "" },
      localStorage: storage,
      sessionStorage: storage,
      dispatchEvent,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            code: "project_left",
            message: "You are no longer on this project",
            errors: {},
            values: { project: "PUTRA_MAS" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const { api, PROJECT_LEFT_EVENT } = await import("@/services/api-client");
    await expect(
      api.get("/api/field-tasks/x/get_task/", undefined, { silent: true }),
    ).rejects.toMatchObject({ code: "project_left" });
    expect(dispatchEvent).toHaveBeenCalled();
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(PROJECT_LEFT_EVENT);
    vi.unstubAllGlobals();

    const phone = source("src/components/field-staff/field-staff-workspace.tsx");
    expect(phone).toContain("window.addEventListener(PROJECT_LEFT_EVENT, reread)");
  });
});
