/**
 * JB202 (Lucas 11-16 「字被裁掉了…检查一下有没有类似的问题也修复一下」) on the
 * consultant pages: on a phone the application number ended in 「…」 in the
 * 顾问首页 rows (「PRJ-0001-RFI-0004/R1 - R…」) and in 版本记录, and in English the
 * row's 「project · applicant」 line too. The number is how the rows are told
 * apart, so these lines wrap now. Read from the source (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "src/components/consultant-workflow", file), "utf8");

/** The class list of the element whose children start with `content`. */
function classesBefore(source: string, content: string): string[] {
  const at = source.indexOf(content);
  expect(at).toBeGreaterThan(-1);
  const open = source.lastIndexOf('className="', at);
  return source.slice(open + 11, source.indexOf('"', open + 11)).split(" ");
}

describe("顾问首页 rows keep the application number whole (JB202)", () => {
  const dashboard = read("consultant-dashboard.tsx");

  it("wraps the number and type", () => {
    const classes = classesBefore(dashboard, "{row.application_no} - {row.application_type}</p>");
    expect(classes).toContain("break-words");
    expect(classes).not.toContain("truncate");
  });

  it("wraps the project and the applicant", () => {
    const classes = classesBefore(dashboard, "{row.project_name} · {row.applicant_name}</p>");
    expect(classes).toContain("break-words");
    expect(classes).not.toContain("truncate");
  });
});

describe("版本记录 keeps each version's number whole (JB202)", () => {
  it("wraps it", () => {
    const classes = classesBefore(read("application-detail.tsx"), "{row.application_no}</p>");
    expect(classes).toEqual(["break-words", "text-xs", "text-muted-foreground"]);
  });
});
