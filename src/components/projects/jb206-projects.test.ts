/**
 * JB206-7 (Lucas 11-16 audit): an archived project offers no 【修改】 that
 * can never save, 修改's status list offers only the moves the server allows
 * (`PROJECT_STATUS_TRANSITIONS`), and the server's refusals are worded in
 * every catalogue.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

// The form's map and supplier pickers are not what is under test.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const { projectStatusOptions } = await import("@/components/projects/create-project");

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("修改's status list (JB206-7)", () => {
  it("offers the current status and its allowed next ones", () => {
    expect(projectStatusOptions("PLANNING")).toEqual(["PLANNING", "ACTIVE", "SUSPENDED"]);
    expect(projectStatusOptions("ACTIVE")).toEqual(["ACTIVE", "SUSPENDED", "COMPLETED"]);
    expect(projectStatusOptions("SUSPENDED")).toEqual(["SUSPENDED", "ACTIVE", "COMPLETED"]);
  });

  it("offers nothing out of 已完工 - 归档 is the project page's own button", () => {
    expect(projectStatusOptions("COMPLETED")).toEqual(["COMPLETED"]);
    expect(projectStatusOptions("ARCHIVED")).toEqual(["ARCHIVED"]);
  });

  it("is what the edit form lists", () => {
    expect(source("src/components/projects/create-project.tsx")).toContain(
      'projectStatusOptions(project?.status ?? "ACTIVE").map(',
    );
  });
});

describe("an archived project has no 修改 (JB206-7)", () => {
  it("on its own page and in the list", () => {
    expect(source("src/components/projects/view-project.tsx")).toContain(
      'can("project.update") && data.status !== "ARCHIVED" && (',
    );
    expect(source("src/components/projects/projects.tsx")).toContain(
      'can("project.update") && row.original.status !== "ARCHIVED" && (',
    );
  });
});

describe("the refusals are worded (JB206-7)", () => {
  const codes = ["project_archived_read_only", "project_archive_use_action", "project_status_move_refused"];
  it("in all four catalogues", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const api = messages.errors.api as Record<string, string>;
      for (const code of codes) expect(api[code], code).toBeTruthy();
    }
    expect(zh.errors.api.project_archived_read_only).toMatch(/[一-鿿]/);
  });
});
