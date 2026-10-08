/**
 * p23 (B1 follow-up): a document category can be removed again, from the
 * archive's own 管理分类 dialog - the only place document categories are
 * managed since 分类管理 dropped them (Q5). Without this the backend's
 * `delete_document_category` had no screen (core.tests.test_ui_reachability).
 *
 * Rendered to static markup - the runner has no DOM - so what is checked is
 * what each state draws: the removal switch only when correcting an existing
 * category, and the Remove button not drawn until that switch is on (spec
 * rule 8: a switch, never a confirm dialog).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { DocumentCategory } from "@/interfaces/document-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const { CategoryForm } = await import("@/components/document-workflow/documents");

const drawings: DocumentCategory = {
  id: "c-dwg",
  code: "DWG",
  name: "图纸",
  description: "",
  is_active: true,
  record_count: 0,
  created_at: "",
  updated_at: "",
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {/* An empty new form's Save names what is missing in a tooltip. */}
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const noop = () => undefined;
const source = readFileSync(
  path.join(process.cwd(), "src/components/document-workflow/documents.tsx"),
  "utf8",
);
const form = source.slice(
  source.indexOf("export function CategoryForm("),
  source.indexOf("function SubcategoryForm("),
);

describe("removing a document category from the archive's own dialog", () => {
  it("offers the switch when correcting an existing category, unarmed", () => {
    const html = render(<CategoryForm category={drawings} onCancel={noop} onDone={noop} />);

    expect(html).toContain(zh.documents.categories.remove.switch);
    expect(html).toContain(zh.documents.categories.remove.hint);
    // The button itself is not drawn until the switch is turned on.
    expect(html).not.toContain(zh.documents.categories.remove.confirm);
  });

  it("offers nothing to remove on a category not created yet", () => {
    const html = render(<CategoryForm category={null} onCancel={noop} onDone={noop} />);

    expect(html).not.toContain(zh.documents.categories.remove.switch);
  });

  it("calls the backend delete, behind the switch, with no confirm dialog", () => {
    expect(form).toMatch(/deleteDocumentCategory\(category!\.id\)/);
    expect(form).toMatch(/\{removeArmed && \(/);
    expect(form).not.toMatch(/ConfirmDialog|window\.confirm/);
  });

  it("shows the server's refusal (a category still in use) beside the switch", () => {
    // ApiError.message is already the reader's language (errors.api.<code>,
    // e.g. column_not_empty naming the documents in the way).
    expect(form).toMatch(/error instanceof ApiError \? error\.message/);
    expect(form).toMatch(/role="alert"[\s\S]{0,80}\{removeRefusal\}/);
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const remove = messages.documents.categories.remove;
      for (const key of ["switch", "hint", "confirm", "failed"] as const) {
        expect(remove[key].trim()).not.toBe("");
      }
    }
  });
});
