import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { fieldTodoCountQuery } from "@/services/platform-ops.service";

/**
 * One 「My tasks」 on the field home, and one number (L1).
 *
 * The home showed the My Tasks card - 「0 waiting on you」 - over a task list
 * titled 「My tasks」 too, saying 「1 active task」, while the bell's red dot
 * counted every notice including news. Three numbers for one question. D04:
 * 统一 My Tasks；手机首页上方显示待办.
 *
 * Asserted by source because each way this comes back still renders: a task
 * list put back on the home, a bell that drifts to a query of its own, or a
 * card that lists five rows under a count of seven. The server half - a
 * task's notices closing when it leaves the worker - is held in
 * `contractor_ops/tests/test_field_task_todo.py`; the screen half in
 * `e2e/field-home-mobile.spec.ts`.
 */

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

function componentBody(file: string, name: string): string {
  const code = read(file);
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\b`, "m"));
  if (start === -1) throw new Error(`${name} not found in ${file}`);
  const rest = code.slice(start + 1);
  const end = rest.search(/^(?:export )?function \w/m);
  return end === -1 ? rest : rest.slice(0, end);
}

const WORKSPACE = "src/components/field-staff/field-staff-workspace.tsx";
const CARD = "src/components/field-staff/field-my-tasks-card.tsx";
const BELL = "src/components/notifications/notification-button.tsx";

describe("the field home has one My Tasks (L1)", () => {
  it("does not render the task list on the home", () => {
    expect(componentBody(WORKSPACE, "FieldHomePanel")).not.toContain("<FieldTaskPanel");
  });

  it("still opens the task list on its own tab, where the task controls are", () => {
    expect(read(WORKSPACE)).toMatch(/shownTab === "tasks" && \(\s*<FieldTaskPanel/);
    expect(read(CARD)).toContain('"/field-staff?tab=tasks"');
  });

  it("counts the to-do pile only", () => {
    expect(fieldTodoCountQuery.queryKey).toEqual([
      "notifications",
      "outstanding-count",
      "ACTION",
    ]);
  });

  it("gives the card and the phone's red dot the same query", () => {
    expect(read(CARD)).toMatch(/useQuery\(\{\s*\.\.\.fieldTodoCountQuery/);
    expect(read(BELL)).toMatch(/user\?\.is_field_staff\s*\?\s*fieldTodoCountQuery/);
  });

  it("lists every waiting row, not the first few", () => {
    const card = read(CARD);
    expect(card).toContain("getAllNotifications(");
    expect(card).not.toMatch(/page_size:/);
  });
});
