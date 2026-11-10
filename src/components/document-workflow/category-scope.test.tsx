/**
 * JB146 (客户 11-10 事项 4, 图6): document categories and sub-categories
 * belong to one project, or are head office's - for every project or the
 * chosen ones.
 *
 * 「目前在某个项目的「文件档案分类管理」中新增子分类，其他项目也能看到该子分类」:
 * the lists are read for the top bar's project, a new row of a project
 * account goes to its project, a row says whose it is, and a head-office row
 * offers a project account no pencil. Rendered to static markup - the runner
 * has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  asksForProject,
  inUseOn,
  initialTaxonomyScope,
  parentCategoryOptions,
  scopeBadge,
  subcategoryInUseOn,
  taxonomyScopeChoices,
  taxonomyScopePayload,
  type TaxonomyScopeContext,
} from "@/components/document-workflow/document-archive-parts";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  DocumentCategory,
  DocumentSubcategory,
  DocumentTaxonomyScope,
} from "@/interfaces/document-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const { CategoryForm, SubcategoryForm, TaxonomyList } = await import(
  "@/components/document-workflow/documents"
);

const P1 = { id: "p1", code: "P1", name: "Project One" };
const P2 = { id: "p2", code: "P2", name: "Project Two" };

const headOffice: DocumentTaxonomyScope = {
  project: null,
  project_name: null,
  all_projects: true,
  assigned_projects: [],
  assigned_project_names: [],
  can_edit: true,
};
const own = (project: typeof P1): DocumentTaxonomyScope => ({
  ...headOffice,
  project: project.id,
  project_name: project.name,
  all_projects: false,
});
const chosen = (...projects: (typeof P1)[]): DocumentTaxonomyScope => ({
  ...headOffice,
  all_projects: false,
  assigned_projects: projects.map((project) => project.id),
  assigned_project_names: projects.map((project) => project.name),
});

const category = (id: string, scope: DocumentTaxonomyScope): DocumentCategory => ({
  ...scope,
  id,
  code: id.toUpperCase(),
  name: id,
  description: "",
  is_active: true,
  record_count: 0,
  created_at: "",
  updated_at: "",
});
const subcategory = (
  id: string,
  parent: string,
  scope: DocumentTaxonomyScope,
): DocumentSubcategory => ({
  ...scope,
  id,
  category: parent,
  category_name: parent,
  code: id.toUpperCase(),
  name: id,
  description: "",
  is_active: true,
  record_count: 0,
  created_at: "",
  updated_at: "",
});

const HEAD_OFFICE_ALL: TaxonomyScopeContext = { headOffice: true, currentProjectId: "", projects: [P1, P2] };
const HEAD_OFFICE_ON_P1: TaxonomyScopeContext = { ...HEAD_OFFICE_ALL, currentProjectId: "p1" };
const PROJECT_ON_P1: TaxonomyScopeContext = { headOffice: false, currentProjectId: "p1", projects: [P1] };
const PROJECT_ON_ALL: TaxonomyScopeContext = { headOffice: false, currentProjectId: "", projects: [P1, P2] };

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const noop = () => undefined;

describe("where a category is in use", () => {
  it("keeps a project's own row on that project only (第 2 点)", () => {
    expect(inUseOn(own(P1), "p1")).toBe(true);
    expect(inUseOn(own(P1), "p2")).toBe(false);
    expect(inUseOn(own(P1), null)).toBe(false);
  });

  it("puts head office's row on every project, or the chosen ones (第 3 点)", () => {
    expect(inUseOn(headOffice, "p1")).toBe(true);
    expect(inUseOn(headOffice, "p2")).toBe(true);
    expect(inUseOn(chosen(P1), "p1")).toBe(true);
    expect(inUseOn(chosen(P1), "p2")).toBe(false);
    // A company-wide document takes head office's rows.
    expect(inUseOn(chosen(P1), null)).toBe(true);
  });

  it("shows a sub-category only where its category is too (图6: CUBE TEST)", () => {
    const reports = category("reports", headOffice);
    const narrow = category("narrow", chosen(P1));
    const cube = subcategory("cube", "reports", own(P1));
    expect(subcategoryInUseOn(cube, [reports], "p1")).toBe(true);
    expect(subcategoryInUseOn(cube, [reports], "p2")).toBe(false);
    const shared = subcategory("shared", "narrow", headOffice);
    expect(subcategoryInUseOn(shared, [narrow], "p1")).toBe(true);
    expect(subcategoryInUseOn(shared, [narrow], "p2")).toBe(false);
  });

  it("says whose a row is", () => {
    expect(scopeBadge(headOffice, "p1").key).toBe("all");
    expect(scopeBadge(chosen(P1, P2), "")).toEqual({ key: "chosen", values: { count: 2 } });
    expect(scopeBadge(own(P1), "p1").key).toBe("here");
    expect(scopeBadge(own(P1), "")).toEqual({ key: "project", values: { project: "Project One" } });
  });
});

describe("where a new row goes", () => {
  it("is a project account's own project, never head office's", () => {
    const state = initialTaxonomyScope(null, PROJECT_ON_P1);
    expect(state).toEqual({ choice: "PROJECT", chosen: [], project: "p1" });
    expect(taxonomyScopeChoices(null, PROJECT_ON_P1)).toEqual([]);
    expect(asksForProject(null, PROJECT_ON_P1, state)).toBe(false);
    expect(taxonomyScopePayload(null, PROJECT_ON_P1, state)).toEqual({ project: "p1" });
  });

  it("is asked of a project account on 全部项目 with several projects", () => {
    const state = initialTaxonomyScope(null, PROJECT_ON_ALL);
    expect(state.project).toBe("");
    expect(asksForProject(null, PROJECT_ON_ALL, state)).toBe(true);
  });

  it("is head office's choice: every project, the chosen ones, or one project's own", () => {
    expect(taxonomyScopeChoices(null, HEAD_OFFICE_ALL)).toEqual(["ALL", "CHOSEN", "PROJECT"]);
    const everywhere = initialTaxonomyScope(null, HEAD_OFFICE_ALL);
    expect(taxonomyScopePayload(null, HEAD_OFFICE_ALL, everywhere)).toEqual({
      project: null,
      all_projects: true,
    });
    const onP1 = initialTaxonomyScope(null, HEAD_OFFICE_ON_P1);
    expect(taxonomyScopePayload(null, HEAD_OFFICE_ON_P1, onP1)).toEqual({
      project: null,
      all_projects: false,
      assigned_projects: ["p1"],
    });
  });

  it("never moves an existing row to another owner", () => {
    const row = category("mine", own(P1));
    expect(taxonomyScopeChoices(row, HEAD_OFFICE_ALL)).toEqual([]);
    expect(taxonomyScopePayload(row, HEAD_OFFICE_ALL, initialTaxonomyScope(row, HEAD_OFFICE_ALL))).toEqual({});
    const shared = category("shared", chosen(P1));
    expect(taxonomyScopeChoices(shared, HEAD_OFFICE_ALL)).toEqual(["ALL", "CHOSEN"]);
    expect(
      taxonomyScopePayload(shared, HEAD_OFFICE_ALL, { choice: "CHOSEN", chosen: ["p1", "p2"], project: "" }),
    ).toEqual({ all_projects: false, assigned_projects: ["p1", "p2"] });
  });

  it("puts a project's sub-category under a category in use there, head office's under head office's", () => {
    const categories = [
      category("reports", headOffice),
      category("p1-own", own(P1)),
      category("p2-own", own(P2)),
      category("p2-chosen", chosen(P2)),
    ];
    const names = (state: ReturnType<typeof initialTaxonomyScope>) =>
      parentCategoryOptions(categories, null, state).map((item) => item.id);
    expect(names(initialTaxonomyScope(null, PROJECT_ON_P1))).toEqual(["reports", "p1-own"]);
    expect(names(initialTaxonomyScope(null, HEAD_OFFICE_ALL))).toEqual(["reports", "p2-chosen"]);
  });
});

describe("the 文档分类 dialog", () => {
  it("draws the scope badge, and no pencil on a row the reader may only use", () => {
    const html = render(
      <TaxonomyList
        title="分类"
        addLabel="新增"
        isLoading={false}
        onAdd={noop}
        rows={[
          { id: "a", code: "DOC-REPORT", name: "报告与检测", description: "", active: true, scope: "总部 · 全部项目" },
          {
            id: "b",
            code: "DOC-0009",
            name: "Site diaries",
            description: "",
            active: true,
            scope: "本项目",
            onEdit: noop,
          },
        ]}
      />,
    );
    expect(html).toContain("总部 · 全部项目");
    expect(html).toContain("本项目");
    expect(html.match(new RegExp(`title="${zh.common.edit}"`, "g"))?.length).toBe(1);
  });

  it("asks head office where a new category is used", () => {
    const html = render(<CategoryForm category={null} scope={HEAD_OFFICE_ALL} onCancel={noop} onDone={noop} />);
    expect(html).toContain(zh.documents.taxonomy.scope.label);
    for (const key of ["ALL", "CHOSEN", "PROJECT"] as const) {
      expect(html).toContain(zh.documents.taxonomy.scope.choice[key]);
    }
  });

  it("tells a project account their new category is their project's, without asking", () => {
    const html = render(<CategoryForm category={null} scope={PROJECT_ON_P1} onCancel={noop} onDone={noop} />);
    expect(html).not.toContain(zh.documents.taxonomy.scope.label);
    expect(html).toContain("属于「Project One」");
  });

  it("asks a project account on 全部项目 which project a new sub-category is for", () => {
    const html = render(
      <SubcategoryForm
        subcategory={null}
        categories={[category("reports", headOffice)]}
        scope={PROJECT_ON_ALL}
        onCancel={noop}
        onDone={noop}
      />,
    );
    expect(html).toContain(zh.documents.taxonomy.scope.projectLabel);
    expect(html).not.toContain(zh.documents.taxonomy.scope.choice.ALL);
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const scope = messages.documents.taxonomy.scope;
      for (const text of [
        scope.label,
        scope.chosenLabel,
        scope.projectLabel,
        scope.owner,
        scope.headOfficeHint,
        scope.projectHint,
        scope.showing,
        scope.categoryHint,
        ...Object.values(scope.choice),
        ...Object.values(scope.badge),
        messages.errors.api.document_category_still_used,
      ]) {
        expect(text.trim()).not.toBe("");
      }
    }
  });
});

describe("the archive reads the lists for the top bar's project", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/document-workflow/documents.tsx"),
    "utf8",
  );

  it("passes the project to both lists and keys them by it", () => {
    expect(source).toMatch(/queryKey: \["documents", "categories", categoryProject\]/);
    expect(source).toMatch(/queryKey: \["documents", "subcategories", categoryProject\]/);
    expect(source.match(/project: categoryProject \|\| undefined/g)?.length).toBe(2);
  });

  it("offers on upload and edit only what the document's project uses", () => {
    expect(source).toMatch(/inUseOn\(item, filingProject\)/);
    expect(source).toMatch(/inUseOn\(item, document\.project\)/);
  });
});
