import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB207W round 2 (walk 11-17, JB204 6 sibling): an assigned disposal task read
 * 「执行清运 E2E-DISP-WB01」 on My Tasks but its stored English title
 * 「Execute site disposal E2E-DISP-WB01」 in 我提交过的 and in the task's
 * 「事项沟通 · …」 heading. Both now word it with the same helper.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("a disposal task's name outside My Tasks", () => {
  it("我提交过的: the list row and the detail title use disposalTaskReference", () => {
    const page = read("src/components/field-staff/my-submissions.tsx");
    expect(page).toContain('import { disposalTaskReference } from "@/components/field-staff/my-tasks-panel";');
    const helper = page.slice(page.indexOf("function submissionReference"));
    expect(helper.slice(0, helper.indexOf("\n}"))).toContain(
      'disposal ? t("taskFlow.work.disposalTitle", { reference: disposal }) : row.reference',
    );
    expect(page).toContain('<p className="truncate text-sm font-medium">{submissionReference(t, row)}</p>');
    expect(page).toContain("title={submissionReference(t, row)}");
    expect(read("src/interfaces/contractor.ts")).toContain("linked_record_reference?: string;");
  });

  it("the task's conversation heading says the same words", () => {
    const panel = read("src/components/field-staff/my-tasks-panel.tsx");
    expect(panel).toContain(
      '? { title: chat("title", { reference: t("disposalTitle", { reference: disposal }) }) }',
    );
    expect(panel).toContain(
      '<RecordConversationPanel kind="FIELD_TASK" recordId={row.id} labels={disposalChat} />',
    );
  });
});
