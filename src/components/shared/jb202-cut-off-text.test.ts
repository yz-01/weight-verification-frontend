/**
 * JB202 (Lucas 11-16, on the consultant list: 「还有这个顾问这里的字被裁掉了，
 * 修复一下然后检查一下有没有类似的问题也修复一下」). The sweep of every menu page
 * (desktop 1440 / phone 390, Chinese / English) found words a reader needs
 * ending in 「…」 or cut at a box's edge in the components below. Each now wraps
 * (or grows) instead. The runner has no DOM, so these read the class lists
 * that decide it; each fails on the old `truncate`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusBadge, TypeBadge } from "@/components/shared/page-primitives";

const read = (file: string) => readFileSync(path.join(process.cwd(), "src/components", file), "utf8");

/** The class list of the nearest `className="…"` before `content` (a string, or a pattern). */
function classesBefore(source: string, content: string | RegExp): string[] {
  const at = typeof content === "string" ? source.indexOf(content) : source.search(content);
  expect(at, String(content)).toBeGreaterThan(-1);
  const open = source.lastIndexOf('className="', at);
  return source.slice(open + 11, source.indexOf('"', open + 11)).split(" ");
}

function wraps(classes: string[]) {
  expect(classes).toContain("break-words");
  expect(classes).not.toContain("truncate");
}

describe("record windows: the photo's caption names who took it, whole (JB202)", () => {
  it("wraps under the picture", () => {
    const classes = classesBefore(read("shared/record-detail-shell.tsx"), />\s*\{photo\.label\}\s*<\/p>/);
    wraps(classes);
    expect(classes).toEqual(expect.arrayContaining(["mt-1", "text-[11px]", "leading-snug"]));
  });

  it("wraps the recorder's name beside the phone button", () => {
    wraps(classesBefore(read("shared/record-detail-shell.tsx"), '{name}</p>'));
  });

  it("wraps the big photo's label, who took it and when, over the picture", () => {
    const classes = classesBefore(read("shared/record-detail-shell.tsx"), /\{photo\.label\}\s*\{photo\.takenAt/);
    wraps(classes);
    expect(classes).toEqual(expect.arrayContaining(["absolute", "max-w-[calc(100%-1rem)]", "text-left"]));
  });
});

describe("StatusBadge / TypeBadge break between whole words, never one character a line (JB202)", () => {
  // JB200 let a badge wrap instead of being cut, but breaking anywhere let a
  // tight table squeeze its column to one character: 「缺收工」 stood as three
  // lines on 设备操作员工时. Whole words first (a Chinese status is one word),
  // broken only when one word alone is wider than the slot.
  it("StatusBadge", () => {
    const html = renderToStaticMarkup(createElement(StatusBadge, { label: "缺收工", tone: "warning" }));
    expect(html).toContain('<span class="min-w-0 break-words [word-break:keep-all]">缺收工</span>');
    expect(html).not.toContain("overflow-wrap:anywhere");
    expect(html).toMatch(/^<span class="inline-flex min-h-6 max-w-full shrink-0 /);
  });

  it("TypeBadge", () => {
    const html = renderToStaticMarkup(createElement(TypeBadge, { label: "混凝土" }));
    expect(html).toMatch(/class="[^"]* break-words \[word-break:keep-all\]"/);
    expect(html).not.toContain("overflow-wrap:anywhere");
  });
});

describe("list pages: the header's buttons never lie over the filters (JB202)", () => {
  it("keeps the list header out of the fixed-height column's squeeze", () => {
    // On a phone the buttons wrap below the title; squeezed to the title's
    // height, 整改 / EHS showed 【历史档案】【建立事项】 on top of 「所有项目」.
    const source = read("shared/page-primitives.tsx");
    expect(source).toMatch(/data-slot="list-header"\s+className="flex min-h-12 shrink-0 flex-wrap/);
  });
});

describe("工程照片墙: a tile's time and project name, whole (JB202)", () => {
  it("wraps the caption over the picture instead of 「示范商业大厦…」", () => {
    const classes = classesBefore(read("dashboard/photo-timeline.tsx"), '<span className="tabular">{df.time(photo.captured_at)}');
    wraps(classes);
    expect(classes).toEqual(expect.arrayContaining(["absolute", "bottom-0", "leading-tight"]));
  });
});

describe("总公司仪表板: a project card's line and the notices, whole (JB202)", () => {
  const source = read("dashboard/headquarters-reference.tsx");

  it("wraps the record's title and quantity (the quantity comes last)", () => {
    const classes = classesBefore(source, /\{headline\s*\?/);
    wraps(classes);
    expect(classes).toContain("min-h-5");
  });

  it("wraps a notice's title and message - the row is not a link", () => {
    wraps(classesBefore(source, "{row.title}</span>"));
    wraps(classesBefore(source, "{row.message}</span>"));
  });
});

describe("tabs on a phone wrap to a second row instead of sliding off with no scrollbar (JB202)", () => {
  // 工程进度 on a 390 px phone: 「施工分类 工程时间轴 日报告 施工计划 项」 - the fifth tab
  // was off the edge and `no-scrollbar` hid any sign of it.
  const source = read("ui/tabs.tsx");

  it("the list wraps and grows on a phone", () => {
    const list = source.slice(source.indexOf("const tabsListVariants"), source.indexOf("variants: {"));
    expect(list).toContain("max-sm:h-auto! max-sm:flex-wrap max-sm:overflow-visible");
  });

  it("a tab keeps its height in a wrapped row", () => {
    const trigger = source.slice(source.indexOf("function TabsTrigger"), source.indexOf("function TabsContent"));
    expect(trigger).toMatch(/"relative inline-flex h-full flex-1 [^"]* max-sm:min-h-10 /);
  });
});

describe("报表中心 / 仪表板 banner: the company's name whole on a phone (JB202)", () => {
  // At 390 px the reader's name and 【通知】 took the row: 「报表中心」 stood one
  // character a line and the company's name was gone.
  const source = read("dashboard/company-banner.tsx");

  it("lets the reader's part move below instead of squeezing the company's", () => {
    expect(source).toContain('<div className="flex min-w-0 flex-1 basis-64 items-center gap-3">');
  });

  it("wraps the company's name", () => {
    wraps(classesBefore(source, "{companyName}</h1>"));
  });
});

describe("「完整证据 PDF」 buttons get the dialog's width (JB202)", () => {
  // RecordExportButton lays out its own four (one even row on a phone, JB85);
  // inside a 2-column grid it had half the width, and on a phone in English
  // 【Preview】【Print】【Export】【Send】 lay over each other (人员进场记录).
  const files = [
    "announcements/announcement-dialog.tsx",
    "document-workflow/approvals.tsx",
    "document-workflow/documents.tsx",
    "site-operations/attendance.tsx",
    "site-access/site-access-workspace.tsx",
    "settlements/payment-proofs.tsx",
  ];

  it.each(files)("%s", (file) => {
    const source = read(file);
    expect(source).toMatch(/<div className="min-w-0">\s*<RecordExportButton/);
    expect(source).not.toMatch(/grid-cols-2 gap-1\.5 sm:grid-cols-4">\s*<RecordExportButton/);
  });
});

describe("分类管理: each group's name and module, whole (JB202)", () => {
  it("wraps them in the left list", () => {
    const source = read("contractor-ops/category-management.tsx");
    wraps(classesBefore(source, "{groupLabel(row)}</span>"));
    wraps(classesBefore(source, "{moduleName(row.module)}"));
  });
});

describe("人员实时位置: the person's name and project beside the badge, whole (JB202)", () => {
  it("wraps both", () => {
    const source = read("site-operations/on-site-map.tsx");
    wraps(classesBefore(source, "{row.full_name}</p>"));
    wraps(classesBefore(source, "{row.project_name}</p>"));
  });
});

describe("操作记录: who / what was changed, whole on a phone (JB202)", () => {
  it("wraps it in its column", () => {
    const classes = classesBefore(read("audit/audit-logs.tsx"), "title={row.original.object_repr}");
    expect(classes).toEqual(["max-w-60", "break-words"]);
  });
});

describe("沟通记录: the list fits a phone, names and numbers whole (JB202)", () => {
  const source = read("site-access/field-chats-office.tsx");

  it("lets the list's column be narrower than its longest line", () => {
    expect(source).toContain('className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"');
  });

  it("wraps who is in it, the project, and a PKG number", () => {
    wraps(classesBefore(source, "{row.title}</span>"));
    wraps(classesBefore(source, "{row.project_name}</span>"));
    wraps(classesBefore(source, "{row.package_no}</span>"));
    wraps(classesBefore(source, '{t("packageThread"'));
  });
});

describe("仪表板 待审批事项: number, title and quantity, whole (JB202)", () => {
  it("wraps both lines of a row instead of 「… 2.0…」 on a phone", () => {
    const source = read("dashboard/headquarters-approvals.tsx");
    wraps(classesBefore(source, '<span className="mr-1.5 rounded bg-primary/10'));
    wraps(classesBefore(source, "row.project || t(\"companyWide\")"));
  });
});

describe("文件档案: numbers, names and categories wrap in JB165's columns (JB202)", () => {
  const documents = read("document-workflow/documents.tsx");
  const parts = read("document-workflow/document-archive-parts.tsx");

  it("the reference under the document number", () => {
    expect(documents).toMatch(
      /className=\{cn\(FILLS_CELL, "break-words text-xs text-muted-foreground"\)\}\s+title=\{row\.original\.reference_no\}/,
    );
  });

  it("the project and the uploader, the column widths unchanged", () => {
    expect(documents.match(/<p className=\{cn\(FILLS_CELL, "break-words"\)\} title=\{(project|uploader)\}>/g)).toHaveLength(2);
    expect(documents).not.toMatch(/cn\(FILLS_CELL, ONE_LINE\)/);
  });

  it("the 「来自 …」 tag with the record's number", () => {
    expect(documents).toContain('className="min-w-0 break-words text-left text-primary underline-offset-2 hover:underline"');
  });

  it("the category over its sub-category", () => {
    const cell = parts.slice(parts.indexOf("export function DocumentPathCell"), parts.indexOf("export type ThumbnailKind"));
    expect(cell).not.toContain("ONE_LINE");
    expect(cell.match(/break-words/g)).toHaveLength(3);
  });
});

describe("项目 › 供应商: name, code and who added it, whole (JB202)", () => {
  it("wraps both lines", () => {
    const source = read("projects/project-suppliers.tsx");
    wraps(classesBefore(source, "{row.supplier_name}</p>"));
    wraps(classesBefore(source, "{row.supplier_code}"));
  });
});

describe("项目 › 项目权限: each member's name and 「职位 · 权限」 line, whole (JB202)", () => {
  const source = read("projects/project-permissions.tsx");

  it("wraps the name, with the badges moving below when they do not fit", () => {
    wraps(classesBefore(source, "{member.full_name}</span>"));
    expect(classesBefore(source, '<span className="min-w-0 break-words text-sm font-semibold">')).toContain("flex-wrap");
  });

  it("wraps the role and permissions line", () => {
    wraps(classesBefore(source, "{roleName({ code: member.role_code"));
  });
});
