/**
 * 客户 11-06 第四轮 事项3: switching the top bar's project did not change the
 * company dashboard's figures, and the page never said they are a total. Now it
 * says so in every language and links to the 项目仪表板.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("the company dashboard says its figures are a total", () => {
  it.each([
    ["zh", zh],
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ])("%s", (_, messages) => {
    const figures = (messages as unknown as { headquarters: { figures: Record<string, string> } }).headquarters.figures;
    for (const key of ["scopeAll", "scopeMine"]) {
      expect(figures[key], key).toContain("{count}");
    }
    expect(figures.projectDashboard).toBeTruthy();
    // A project manager's page does not call itself the company view.
    const reference = (messages as unknown as { headquarters: { reference: Record<string, string> } }).headquarters.reference;
    expect(reference.companyViewMine).toBeTruthy();
    expect(reference.activityHintMine).toBeTruthy();
  });

  it("links to the project dashboard, which follows the top bar's project", () => {
    const source = readFileSync(join(__dirname, "headquarters-dashboard.tsx"), "utf8");
    expect(source).toContain('href="/dashboard/project"');
    expect(source).toContain("figures.scopeAll");
    expect(source).toContain("figures.scopeMine");
  });

  it("fits every site photo whole into the same frame (事项2-4)", () => {
    const source = readFileSync(join(__dirname, "headquarters-reference.tsx"), "utf8");
    expect(source).toContain('className="object-contain"');
    expect(source).not.toMatch(/latest_photo[\s\S]{0,800}object-cover/);
  });
});
