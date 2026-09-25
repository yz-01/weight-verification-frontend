import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The hazard office screen offers two actions, and the absent third is the point.
 *
 * D-213: 「隐患后台**只保留【沟通】和【验收确认】**。【整改】只是状态不是操作按钮；
 * 整改完成由现场手机端直接上传照片和备注回传；后台认为整改不可接受就用【沟通】
 * 说明原因，事项保持未完成、不闭环。」
 *
 * The office used to get Verify and Return side by side. That gave one
 * intention two expressions - a status change, or a reason somebody can read
 * in context - and the customer picked the conversation. A refusal that is
 * only a status is a refusal the site staff cannot act on: they are told it
 * came back, not what was wrong.
 *
 * `RETURNED` is still a status: hazards already in it must keep rendering, and
 * nothing about their history changes. What must not come back is a button
 * that puts a new one there, which is easy to re-add in good faith the first
 * time somebody reads the old task wording (「确认、整改、提交、验收、退回做成
 * 明显的大按钮」) without the decision that replaced it.
 */
const SOURCE = path.join(
  process.cwd(),
  "src",
  "components",
  "site-operations",
  "safety.tsx",
);

function reviewDialog() {
  const code = readFileSync(SOURCE, "utf8");
  const start = code.indexOf("function SafetyReviewDialog");
  expect(
    start,
    "SafetyReviewDialog not found - was it renamed?",
  ).toBeGreaterThan(-1);
  const rest = code.slice(start + 1);
  const end = rest.search(/^(?:export )?function \w/m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the hazard office screen keeps two actions, not five (D-213)", () => {
  it("still confirms a rectification", () => {
    // Without this, deleting the whole dialog would satisfy every assertion
    // below.
    expect(reviewDialog()).toContain('t("action.verify")');
  });

  it("offers no way to send a rectification back", () => {
    expect(reviewDialog()).not.toContain('t("action.return")');
    expect(reviewDialog()).not.toContain('"RETURNED"');
  });

  it("says what to do instead, so the missing button is not a dead end", () => {
    // A screen that simply lost an action reads as broken. The office is told
    // to use the conversation.
    expect(reviewDialog()).toContain("review.refuseInstead");
  });

  it("the whole row opens the detail drawer", () => {
    // 客户第 26 条: the actions were small icons at the end of the row and
    // people could not find them - 「以为没做」.
    expect(readFileSync(SOURCE, "utf8")).toContain("onRowClick={setOpened}");
  });
});
