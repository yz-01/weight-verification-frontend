import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207W round 2 (walk 11-17, JB206 10): an archived project's page offered
 * 【添加人员】. The server refuses 添加人员 / 移除 outside 规划中 / 进行中
 * (`assign_user` / `unassign_user`, `Project.is_open`), so those buttons go
 * there and the team says why. 添加负责人 / 签发送货单 / 从总部名单选 stay: the
 * server does not refuse them on an archived project (listed for review).
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const page = read("src/components/projects/view-project.tsx");

describe("a project whose people can no longer change", () => {
  it("follows the server's is_open: 规划中 and 进行中 only", () => {
    const helper = page.slice(page.indexOf("export function membershipOpen"));
    expect(helper.slice(0, helper.indexOf("\n}"))).toContain(
      'return status === "PLANNING" || status === "ACTIVE";',
    );
  });

  it("hides 添加人员 at the top and in the team, and 移除 on each person", () => {
    expect(page).toContain('{can("project.assign") && membershipOpen(data.status) && (');
    expect(page).toContain("<ProjectTeam projectId={id} open={membershipOpen(data.status)} />");
    const team = page.slice(page.indexOf("function ProjectTeam"), page.indexOf("function AssignUserDialog"));
    expect(team).toContain('const canChange = can("project.assign") && open;');
    expect(team.match(/\{canChange && \(/g)).toHaveLength(2);
    expect(team).not.toMatch(/\{can\("project\.assign"\) && \(\n\s+<Button/);
  });

  it("says why, in all four languages", () => {
    const team = page.slice(page.indexOf("function ProjectTeam"), page.indexOf("function AssignUserDialog"));
    expect(team).toContain('{t("projects.team.closed")}');
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      expect(JSON.parse(read(`src/messages/${locale}.json`)).projects.team.closed, locale).toBeTruthy();
    }
  });
});
