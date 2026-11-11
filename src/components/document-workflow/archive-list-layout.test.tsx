/**
 * JB165 (Lucas 11-11: 「文件归档这里我觉得好乱，能不能弄整齐好看」): the 文件档案
 * list itself, rendered to static markup from a seeded query cache (the
 * runner has no DOM). Every column but the title has its width; each row
 * shows its whole 编号, one thumbnail square with 「+N」 on it, and its
 * title, path, source, project and uploader on one line each with the whole
 * text on hover.
 */
import { readFileSync } from "node:fs";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ARCHIVE_COLUMN_WIDTHS } from "@/components/document-workflow/document-archive-parts";
import type { CurrentProjectState } from "@/components/providers/current-project-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DocumentRecord, DocumentVersion } from "@/interfaces/document-workflow";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/documents",
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "u-office",
      full_name: "Lim",
      portal: "MSE_TRACE",
      account_type: "TENANT",
      is_field_staff: false,
      is_platform_staff: false,
      permissions: [],
      company_preferences: { date_format: "DD/MM/YYYY", time_format: "24H" },
    },
    can: () => true,
    refresh: async () => {},
    isLoading: false,
  }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { CurrentProjectValueProvider } = await import("@/components/providers/current-project-provider");
const { Documents } = await import("@/components/document-workflow/documents");

const ALL_PROJECTS: CurrentProjectState = {
  active: false,
  projectId: "",
  projects: [],
  canChooseAll: true,
  loading: false,
  setProjectId: () => {},
};

const LONG_NAME = "mse-site-2026-10-23T17-59-33.192Z-o09f9d31f56af41099439fb6f56f1f180";

function photo(name: string): DocumentVersion {
  return {
    id: `v-${name}`,
    document: "d",
    version_number: 1,
    file: "",
    original_name: `${name}.jpg`,
    content_type: "image/jpeg",
    preview_type: null,
    byte_size: 1000,
    sha256: "",
    note: "",
    created_by: null,
    uploaded_by_name: null,
    created_at: "2026-10-23T09:59:33Z",
  };
}

function record(overrides: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: "d1",
    document_no: "DOC-001",
    reference_no: "",
    title: "",
    description: "",
    keywords: "",
    project: "p1",
    project_name: "builder-001",
    category: "c1",
    category_name: "合约文件",
    subcategory: null,
    subcategory_name: null,
    status: "ACTIVE",
    latest_version: null,
    system_file: null,
    file_count: 1,
    archived_at: null,
    archived_by: null,
    archive_reason: "",
    created_by: "u1",
    created_by_name: "示范 管理员",
    created_at: "2026-10-23T09:59:33Z",
    updated_at: "2026-10-23T09:59:33Z",
    ...overrides,
  };
}

const ROWS: DocumentRecord[] = [
  // Lucas's screenshot: the old daily number, six photos under a machine name,
  // a long English path.
  record({
    id: "d1",
    document_no: "DOC-261010-0001",
    title: `${LONG_NAME} 等 6 个文件`,
    category_name: "safety Department",
    subcategory: "s1",
    subcategory_name: "Equipment Safety Inspection",
    latest_version: photo(LONG_NAME),
    file_count: 6,
  }),
  // Picked from the system: 「来自 … · 模块」 under the title.
  record({
    id: "d2",
    document_no: "DOC-006",
    reference_no: "VO-007/ARCH/2026-REV2",
    title: "C30 混凝土进场照片",
    system_file: {
      module: "MATERIAL_RECEIPT",
      file_name: "slab.jpg",
      content_type: "image/jpeg",
      preview_type: "image/jpeg",
      byte_size: 10,
      kind: "PHOTO",
      thumbnail_url: null,
      captured_at: "2026-10-07T03:00:00Z",
      record: { kind: "MATERIAL_RECEIPT", id: "r1", reference: "RC-005", deleted: false },
    },
  }),
];

function renderList(rows: DocumentRecord[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const draw = () =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
          <TooltipProvider>
            <CurrentProjectValueProvider value={ALL_PROJECTS}>
              <Documents />
            </CurrentProjectValueProvider>
          </TooltipProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  draw();
  // The list's own key, as the page asked for it; answered, and drawn again.
  const key = client
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey)
    .find((entry) => entry[0] === "documents" && typeof entry[1] === "object");
  client.setQueryData(key!, { count: rows.length, page: 1, page_size: 25, total_pages: 1, results: rows });
  return draw();
}

/** The markup of one row's cell, by the row's place and the column's. */
function cell(html: string, row: number, column: number): string {
  const body = html.slice(html.indexOf("<tbody"));
  const tr = body.split(/<tr[\s>]/).slice(1)[row] ?? "";
  return tr.split(/<td[\s>]/).slice(1)[column] ?? "";
}

describe("the 文件档案 list lines up (JB165)", () => {
  const html = renderList(ROWS);

  it("gives every column but the title its width", () => {
    const heads = html.slice(html.indexOf("<thead"), html.indexOf("</thead>")).split(/<th[\s>]/).slice(1);
    const widths = heads.map((head) => /style="width:([^"]+)"/.exec(head)?.[1] ?? null);
    expect(widths).toEqual([
      ARCHIVE_COLUMN_WIDTHS.document_no,
      ARCHIVE_COLUMN_WIDTHS.thumbnail,
      null,
      ARCHIVE_COLUMN_WIDTHS.category,
      ARCHIVE_COLUMN_WIDTHS.project_name,
      ARCHIVE_COLUMN_WIDTHS.created_by_name,
      ARCHIVE_COLUMN_WIDTHS.status,
      ARCHIVE_COLUMN_WIDTHS.version_count,
      ARCHIVE_COLUMN_WIDTHS.created_at,
      null,
    ]);
  });

  it("shows the whole 编号 on one line, and no 「—」 line without a reference", () => {
    const number = cell(html, 0, 0);
    expect(number).toMatch(/<p class="[^"]*\[white-space:nowrap\][^"]*" data-document-no="true">DOC-261010-0001<\/p>/);
    expect(number).not.toMatch(/\btruncate\b|max-w-/);
    expect(number).not.toContain(messages.common.emptyValue);
    // A reference, when there is one, under it - cut, with the whole on hover.
    expect(cell(html, 1, 0)).toContain('title="VO-007/ARCH/2026-REV2"');
  });

  it("draws one thumbnail square with 「+N」 on its corner, not a second tile", () => {
    const thumb = cell(html, 0, 1);
    expect(thumb.match(/<button/g)).toHaveLength(1);
    expect(thumb).toContain('data-more-files="5"');
    expect(thumb).toContain(">+5</span>");
    expect(thumb).not.toContain("size-12");
    expect(cell(html, 1, 1)).not.toContain("data-more-files");
  });

  it("keeps the title to one line, the whole of it on hover, 「等 6 个文件」 small under it", () => {
    const title = cell(html, 0, 2);
    expect(title).toContain(`title="${LONG_NAME} 等 6 个文件" data-document-title="true">${LONG_NAME}</p>`);
    expect(title).toContain('data-group-count="true">等 6 个文件</span>');
  });

  it("puts the source under the title from its left edge, on one line, the whole on hover", () => {
    const title = cell(html, 1, 2);
    const source = `来自 RC-005 · ${messages.nav.material_receipts}`;
    expect(title).toMatch(
      new RegExp(`<button type="button" class="[^"]*text-left[^"]*" title="${source} · ${messages.documents.source.open}">${source}</button>`),
    );
    expect(title).not.toMatch(/\btruncate\b/);
  });

  it("shows the path, the project and the uploader each on one line with the whole on hover", () => {
    expect(cell(html, 0, 3)).toContain('title="safety Department / Equipment Safety Inspection"');
    expect(cell(html, 0, 4)).toContain('title="builder-001">builder-001</p>');
    expect(cell(html, 0, 5)).toContain('title="示范 管理员">示范 管理员</p>');
    for (const column of [3, 4, 5]) expect(cell(html, 0, column)).not.toMatch(/\btruncate\b/);
  });

  it("sets the status pill and the file count at the right of their columns", () => {
    expect(cell(html, 0, 6)).toMatch(/^[^>]*><div data-slot="cell-fit" class="min-w-0"><div class="flex justify-end">/);
    expect(cell(html, 0, 7)).toMatch(/<div class="flex justify-end"><span class="[^"]*min-w-7[^"]*">6<\/span>/);
  });
});

describe("the pinned buttons on a phone (JB165)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("are shrunk to their width with 1% only where the table is as wide as the page", () => {
    // On a phone the list table is as wide as its content, and a 1% column
    // made it 100 times the buttons' width: 20600 px for 文件档案.
    const rule = css.indexOf('[data-slot="table"] > :is(thead, tbody) > tr > :is(th, td)[data-pin="end"][data-pin] {');
    const shared = css.slice(rule, css.indexOf("}", rule));
    expect(shared).not.toContain("width: 1%");
    expect(css).toMatch(
      /@media \(min-width: 40rem\) \{\s*\[data-slot="table"\] > :is\(thead, tbody\) > tr > :is\(th, td\)\[data-pin="end"\]\[data-pin\] \{\s*width: 1%;/,
    );
  });
});
