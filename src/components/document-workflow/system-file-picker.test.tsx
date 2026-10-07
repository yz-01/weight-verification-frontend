/**
 * E4 (Q23): picking files that are already in the system into the archive.
 * Rendered to static markup - the runner has no DOM, so dragging is tested
 * through the function the drop handler calls, and the feel of the drag is
 * left for a person (PENDING).
 */
import { readFileSync } from "node:fs";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DocumentSystemFileInfo, SystemFile } from "@/interfaces/document-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

const { DocumentThumb } = await import("@/components/document-workflow/document-archive-parts");
const { SYSTEM_FILE_MODULES, SystemFilePicker, droppedSelection, useSourceLabel } = await import(
  "@/components/document-workflow/system-file-picker"
);

const file = (id: string, overrides: Partial<SystemFile> = {}): SystemFile => ({
  id,
  file_name: `${id}.jpg`,
  content_type: "image/jpeg",
  preview_type: "image/jpeg",
  kind: "PHOTO",
  byte_size: 1000,
  thumbnail_url: `https://media.test/${id}.jpg`,
  module: "MATERIAL_RECEIPT",
  record: { kind: "MATERIAL_RECEIPT", id: "r1", reference: "RC-005", deleted: false },
  project: "p1",
  project_name: "North Tower",
  uploaded_by_name: "ong",
  captured_at: "2026-10-07T03:00:00Z",
  filed: false,
  ...overrides,
});

function render(node: React.ReactNode) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function Label({ source }: { source: Pick<DocumentSystemFileInfo, "module" | "record"> }) {
  return <span>{useSourceLabel()(source)}</span>;
}

const lookup = (catalogue: unknown, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], catalogue);

describe("where a system file came from", () => {
  it("names the record and its module the way the menu does", () => {
    expect(render(<Label source={file("a")} />)).toContain(`来自 RC-005 · ${zh.nav.material_receipts}`);
    expect(
      render(<Label source={{ module: "HAZARD", record: { kind: "HAZARD", id: "h", reference: "", deleted: false } }} />),
    ).toContain(`来自${zh.nav.hazard_rectification}`);
  });

  it("offers the server's modules, each named in all four languages", () => {
    expect(Object.keys(SYSTEM_FILE_MODULES)).toEqual([
      "MATERIAL_RECEIPT",
      "MATERIAL_OUTGOING",
      "EQUIPMENT",
      "HAZARD",
      "PROGRESS",
      "DISPOSAL",
      "WASTE_OUTGOING",
      "FIELD_TASK",
      "MATERIAL_REQUEST",
      "SUNDRY_CLAIM",
    ]);
    for (const catalogue of [zh, zhTW, en, ms]) {
      for (const key of Object.values(SYSTEM_FILE_MODULES)) {
        expect(typeof lookup(catalogue, key), key).toBe("string");
      }
    }
  });
});

describe("picking and dropping", () => {
  it("a dropped thumbnail joins the selection once; anything else is ignored", () => {
    const rows = [file("a"), file("b")];
    const once = droppedSelection({}, rows, "a");
    expect(Object.keys(once)).toEqual(["a"]);
    expect(droppedSelection(once, rows, "a")).toBe(once);
    expect(droppedSelection(once, rows, "not-on-this-page")).toBe(once);
    expect(Object.keys(droppedSelection(once, rows, "b"))).toEqual(["a", "b"]);
  });

  it("shows the archive area with what is ticked", () => {
    const markup = render(
      <SystemFilePicker projects={[]} selected={{ a: file("a") }} onSelectedChange={() => undefined} />,
    );
    expect(markup).toContain(`aria-label="${zh.documents.pickFromSystem.dropArea}"`);
    expect(markup).toContain("已选 1 个");
    expect(markup).toContain(`来自 RC-005 · ${zh.nav.material_receipts}`);
  });

  it("a filed system file shows its watermarked thumbnail in the table", () => {
    const source: DocumentSystemFileInfo = {
      module: "MATERIAL_RECEIPT",
      file_name: "rebar.png",
      content_type: "image/png",
      preview_type: "image/png",
      byte_size: 10,
      kind: "PHOTO",
      thumbnail_url: "https://media.test/stamped.jpg",
      captured_at: "2026-10-07T03:00:00Z",
      record: { kind: "MATERIAL_RECEIPT", id: "r1", reference: "RC-005", deleted: false },
    };
    const markup = render(<DocumentThumb version={null} systemFile={source} onOpen={() => undefined} />);
    expect(markup).toContain('src="https://media.test/stamped.jpg"');
    expect(markup).toContain('data-thumbnail="image"');
  });
});

describe("the documents screen (E4)", () => {
  const source = readFileSync("src/components/document-workflow/documents.tsx", "utf8");

  it("has the two upload tabs and files picked files as references", () => {
    expect(source).toContain('t("documents.uploadFile.fromComputer")');
    expect(source).toContain('t("documents.pickFromSystem.tab")');
    expect(source).toContain("<SystemFilePicker");
    expect(source).toContain("addSystemFiles(");
  });

  it("tags a system file with its source and opens the record from it", () => {
    expect(source).toContain("<SourceTag");
    expect(source).toContain("useRecordOpener()");
    expect(source).toContain('t("documents.source.deleted")');
  });

  it("offers no new version on a system file", () => {
    expect(source).toContain("active && !record.system_file &&");
  });

  it("words the new refusals in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.errors.api.document_is_system_file).toBeTruthy();
      expect(catalogue.errors.api.document_system_file_not_found).toBeTruthy();
    }
  });
});
