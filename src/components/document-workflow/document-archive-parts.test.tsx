/**
 * B6 / D5 (X16): the document archive's one category dropdown, its table
 * thumbnails, the upload pickers' file types and the removed 「建立文档」
 * branch. Rendered to static markup - the test runner has no DOM.
 */
import { readFileSync } from "node:fs";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_FILE_ACCEPT,
  DocumentCategoryPicker,
  DocumentPathCell,
  DocumentThumb,
  DocumentTitleCell,
  THUMBNAIL_MAX_BYTES,
  categoryPickerLabel,
  splitGroupTitle,
  thumbnailKind,
} from "@/components/document-workflow/document-archive-parts";
import type {
  DocumentCategory,
  DocumentSubcategory,
  DocumentVersion,
} from "@/interfaces/document-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const category = (id: string, name: string): DocumentCategory => ({
  id,
  code: id.toUpperCase(),
  name,
  description: "",
  is_active: true,
  record_count: 0,
  project: null,
  project_name: null,
  all_projects: true,
  assigned_projects: [],
  assigned_project_names: [],
  can_edit: true,
  created_at: "",
  updated_at: "",
});

const subcategory = (id: string, parent: string, name: string): DocumentSubcategory => ({
  id,
  category: parent,
  category_name: "",
  code: id.toUpperCase(),
  name,
  description: "",
  is_active: true,
  record_count: 0,
  project: null,
  project_name: null,
  all_projects: true,
  assigned_projects: [],
  assigned_project_names: [],
  can_edit: true,
  created_at: "",
  updated_at: "",
});

const version = (original_name: string, preview_type: string | null, byte_size = 1000): DocumentVersion => ({
  id: `v-${original_name}`,
  document: "d",
  version_number: 1,
  file: "",
  original_name,
  content_type: "",
  preview_type,
  byte_size,
  sha256: "",
  note: "",
  created_by: null,
  uploaded_by_name: null,
  created_at: "",
});

const categories = [category("dwg", "图纸"), category("ctr", "合约文件")];
const subcategories = [subcategory("str", "dwg", "结构图"), subcategory("vo", "ctr", "VO")];

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("the one category dropdown (X16)", () => {
  it("names nothing, a category, or the category / subcategory path", () => {
    expect(categoryPickerLabel(categories, subcategories, undefined, undefined, "全部分类")).toBe("全部分类");
    expect(categoryPickerLabel(categories, subcategories, "dwg", undefined, "全部分类")).toBe("图纸");
    expect(categoryPickerLabel(categories, subcategories, "dwg", "str", "全部分类")).toBe("图纸 / 结构图");
    // A subcategory from another category is not shown as this one's.
    expect(categoryPickerLabel(categories, subcategories, "dwg", "vo", "全部分类")).toBe("图纸");
    // A category that is gone reads as "all", not as an id.
    expect(categoryPickerLabel(categories, subcategories, "gone", undefined, "全部分类")).toBe("全部分类");
  });

  it("is one button showing the chosen path", () => {
    const markup = render(
      <DocumentCategoryPicker
        categories={categories}
        subcategories={subcategories}
        category="dwg"
        subcategory="str"
        onChange={() => undefined}
      />,
    );
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain("图纸 / 结构图");
    expect(markup).toContain(`aria-label="${zh.documents.field.category}"`);
  });
});

describe("table thumbnails (D5)", () => {
  it("draws photos the browser can show, and a type for everything else", () => {
    expect(thumbnailKind(version("slab.jpg", "image/jpeg"))).toBe("image");
    expect(thumbnailKind(version("phone.heic", null))).toBe("photo");
    expect(thumbnailKind(version("huge.jpg", "image/jpeg", THUMBNAIL_MAX_BYTES + 1))).toBe("photo");
    expect(thumbnailKind(version("contract.pdf", "application/pdf"))).toBe("pdf");
    expect(thumbnailKind(version("minutes.DOCX", null))).toBe("word");
    expect(thumbnailKind(version("bq.xlsx", null))).toBe("excel");
    expect(thumbnailKind(version("old.dwg", null))).toBe("file");
    expect(thumbnailKind(null)).toBe("none");
  });

  it("is a button that opens the preview, labelled with the file", () => {
    const markup = render(<DocumentThumb version={version("contract.pdf", "application/pdf")} onOpen={() => undefined} />);
    expect(markup).toContain('data-thumbnail="pdf"');
    expect(markup).toContain(">PDF<");
    expect(markup).toContain(`${zh.filePreview.preview} · contract.pdf`);
  });

  it("shows a PDF's first page when the server has one (2026-10-10)", () => {
    const pdf = { ...version("contract.pdf", "application/pdf"), thumbnail_url: "https://media.test/page1.webp" };
    const markup = render(<DocumentThumb version={pdf} onOpen={() => undefined} />);
    expect(markup).toContain('data-thumbnail="image"');
    expect(markup).toContain('src="https://media.test/page1.webp"');
    // The whole page shows, from its top - not cropped like a photo.
    expect(markup).toContain("object-contain");
  });
});

/**
 * JB165 (Lucas 11-11: 「文件归档这里我觉得好乱，能不能弄整齐好看」): the row
 * parts keep each line whole - one line, then 「…」, the whole text on hover -
 * instead of `truncate`, which a fitted table turns back into wrapping.
 */
describe("a tidy archive row (JB165)", () => {
  const LONG = "mse-site-2026-10-23T17-59-33.192Z-o09f9d31f56af41099439fb6f56f1f180";

  it("splits the system's 「等 N 个文件」 off a title, in each language's words", () => {
    expect(splitGroupTitle(`${LONG} 等 6 个文件`, zh.documents.uploadFile.groupTitle)).toEqual({
      name: LONG,
      suffix: "等 6 个文件",
    });
    expect(splitGroupTitle(`${LONG} 等 12 個文件`, zhTW.documents.uploadFile.groupTitle)).toEqual({
      name: LONG,
      suffix: "等 12 個文件",
    });
    expect(splitGroupTitle("site photo and 3 files", en.documents.uploadFile.groupTitle)).toEqual({
      name: "site photo",
      suffix: "and 3 files",
    });
    expect(splitGroupTitle("foto tapak dan 3 fail", ms.documents.uploadFile.groupTitle)).toEqual({
      name: "foto tapak",
      suffix: "dan 3 fail",
    });
    // A title somebody typed is all name.
    expect(splitGroupTitle("合约 VO-007", zh.documents.uploadFile.groupTitle)).toEqual({ name: "合约 VO-007", suffix: "" });
    expect(splitGroupTitle("等 6 个文件", zh.documents.uploadFile.groupTitle)).toEqual({ name: "等 6 个文件", suffix: "" });
  });

  it("puts 「+N」 on the thumbnail's corner, one square, and says it in the label", () => {
    const markup = render(<DocumentThumb version={version("a.jpg", null)} more={5} onOpen={() => undefined} />);
    expect(markup).toMatch(/<span aria-hidden="true" data-more-files="5" class="[^"]*absolute[^"]*">\+5<\/span>/);
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain("size-10");
    expect(markup).toContain(`${zh.filePreview.preview} · a.jpg · 另有 5 个文件`);
  });

  it("draws no badge for a document of one file", () => {
    const markup = render(<DocumentThumb version={version("a.pdf", null)} onOpen={() => undefined} />);
    expect(markup).not.toContain("data-more-files");
    expect(markup).toContain(`title="${zh.filePreview.preview} · a.pdf"`);
  });

  it("keeps the title on one line with the whole of it on hover, the file count under it", () => {
    const markup = render(<DocumentTitleCell title={`${LONG} 等 6 个文件`} detail={<span>{zh.documents.noFile}</span>} />);
    expect(markup).toContain(`title="${LONG} 等 6 个文件" data-document-title="true">${LONG}</p>`);
    expect(markup).toContain(`data-group-count="true">等 6 个文件</span><span>${zh.documents.noFile}</span>`);
    expect(markup).toContain("[white-space:nowrap]");
    expect(markup).not.toMatch(/\btruncate\b/);
  });

  it("files a path as the category over the sub-category, never broken, the whole path on hover", () => {
    const markup = render(<DocumentPathCell category="Safety Department" subcategory="HIRARC/JSA Risk Assessment" />);
    expect(markup).toContain('title="Safety Department / HIRARC/JSA Risk Assessment" data-document-path="true"');
    expect(markup).toContain(">Safety Department</span>");
    expect(markup).toContain(">HIRARC/JSA Risk Assessment</span>");
    expect(markup).toContain("<svg");
    expect(markup).not.toMatch(/\btruncate\b/);
    expect(render(<DocumentPathCell category="合约文件" />)).toContain('title="合约文件"');
  });
});

describe("the documents screen", () => {
  const source = readFileSync("src/components/document-workflow/documents.tsx", "utf8");

  it("has no left folder tree and no second category select", () => {
    expect(source).not.toContain("FolderTree");
    expect(source).not.toContain("documents.allSubcategories");
    expect(source).toContain("<DocumentCategoryPicker");
    expect(source).toContain("<DocumentThumb");
  });

  it("offers PDF, Word, Excel and photos in both upload pickers", () => {
    expect(DOCUMENT_FILE_ACCEPT).toBe(".pdf,.doc,.docx,.xls,.xlsx,image/*");
    expect(source.match(/accept: DOCUMENT_FILE_ACCEPT/g)).toHaveLength(2);
  });

  it("asks for keywords when uploading", () => {
    const dialog = source.slice(
      source.indexOf("function UploadDocumentDialog"),
      source.indexOf("function DocumentEditorDialog"),
    );
    expect(dialog).toContain("keywords: keywords.trim()");
    expect(dialog).toContain('t("documents.field.keywords")');
  });

  it("no longer carries the unreachable create-document branch", () => {
    expect(source).not.toContain("documents.create.");
    expect(source).not.toContain("createDocument(");
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect("create" in catalogue.documents).toBe(false);
    }
  });

  it("words a refused file type in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.errors.api.document_file_type_not_allowed).toBeTruthy();
    }
  });
});
