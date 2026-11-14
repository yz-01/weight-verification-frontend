/**
 * JB196 (客户 11-14 事项 1, 事项 2): the document archive's inspection results,
 * office side. Each result in the detail names the machine by its number and
 * the report date (JB196-5); a submit that worked shows the saved rows at once
 * from the server's answer (JB196-6); one that did not says so in one clear
 * block (JB196-7); 【添加文件】 in the detail opens the row's own upload dialog
 * (JB196-8); the list says when a document's system files come from more than
 * one record (JB196-10). Rendered to static markup (the runner has no DOM) or
 * read from the source where a modal or a click is involved.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { DocumentDetail, DocumentSystemFileInfo, InspectionInfo } from "@/interfaces/document-workflow";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

// Who is looking: every permission unless a test takes some away.
const auth = vi.hoisted(() => ({ codes: null as string[] | null }));

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
    can: (code: string) => auth.codes === null || auth.codes.includes(code),
    refresh: async () => {},
    isLoading: false,
  }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { InspectionList, InspectionNotSaved, withSavedInspections } = await import(
  "@/components/document-workflow/inspection"
);
const { DocumentDetailBody, SourceTag, addFilesRule } = await import("@/components/document-workflow/documents");

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;
type Locale = keyof typeof CATALOGUES;

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode, locale: Locale = "zh") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function inspection(overrides: Partial<InspectionInfo> = {}): InspectionInfo {
  return {
    id: "i1",
    document: "d1",
    document_no: "DOC-008",
    target: "EQUIPMENT",
    equipment: "e1",
    equipment_name: "挖土机",
    equipment_no: "EQ0001",
    material: null,
    material_name: "",
    spec: null,
    spec_name: "",
    receipt: null,
    inspection_no: "INS-2026-11",
    inspected_on: "2026-11-13",
    inspector: "SIRIM",
    result: "PASS",
    report_date: "2026-11-14",
    valid_until: "2027-11-13",
    expiry: null,
    created_by_name: "PM Tan",
    created_at: "2026-11-14T09:30:00+08:00",
    ...overrides,
  };
}

function detail(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    id: "d1",
    document_no: "DOC-008",
    reference_no: "",
    title: "挖土机检验",
    description: "",
    keywords: "",
    project: "p1",
    project_name: "builder-001",
    category: "c1",
    category_name: "安全",
    subcategory: "s1",
    subcategory_name: "设备检验",
    status: "ACTIVE",
    latest_version: null,
    archived_at: null,
    archived_by: null,
    archive_reason: "",
    created_by: "u1",
    created_by_name: "示范 管理员",
    created_at: "2026-11-14T09:00:00Z",
    updated_at: "2026-11-14T09:00:00Z",
    versions: [],
    system_files: [],
    needs_inspection: true,
    inspections: [],
    ...overrides,
  };
}

/** The grey line under one result: what, who, the dates, who filed it. */
function resultLine(html: string): string {
  return /<p class="text-xs text-muted-foreground">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
}

describe("each inspection result in the document detail (JB196-5)", () => {
  it("names a machine 「EQ0001 · 挖土机」 and says the report date, between the inspector and 有效期至", () => {
    const line = resultLine(render(<InspectionList rows={[inspection()]} />));
    expect(line).toBe("EQ0001 · 挖土机 · SIRIM · 报告日期 14/11/2026 · 有效期至 13/11/2027 · PM Tan 于 14/11/2026 09:30 填写");
  });

  it("shows the name alone from an older answer without equipment_no, and no report date when none was given", () => {
    const older = inspection({ report_date: null });
    delete older.equipment_no;
    expect(resultLine(render(<InspectionList rows={[older]} />))).toBe(
      "挖土机 · SIRIM · 有效期至 13/11/2027 · PM Tan 于 14/11/2026 09:30 填写",
    );
    expect(resultLine(render(<InspectionList rows={[inspection({ equipment_no: "" })]} />))).toMatch(/^挖土机 · SIRIM · /);
  });

  it("keeps a material as 「材料 · 规格」, never the machine number", () => {
    const material = inspection({
      target: "MATERIAL",
      equipment: null,
      equipment_name: "",
      equipment_no: "",
      material: "m1",
      material_name: "rebar",
      spec: "y20",
      spec_name: "Y20",
    });
    expect(resultLine(render(<InspectionList rows={[material]} />))).toMatch(/^rebar · Y20 · SIRIM · 报告日期 14\/11\/2026 · /);
  });

  it("says the report date in all four languages, never in red", () => {
    const words = { zh: "报告日期 14/11/2026", "zh-TW": "報告日期 14/11/2026", en: "Report dated 14/11/2026", ms: "Laporan bertarikh 14/11/2026" };
    for (const locale of Object.keys(words) as Locale[]) {
      const html = render(<InspectionList rows={[inspection({ result: "FAIL" })]} />, locale);
      expect(html).toContain(words[locale]);
      expect(html).not.toMatch(/destructive|text-red|bg-red/);
    }
  });
});

describe("a submit that worked shows the saved rows at once (JB196-6)", () => {
  const older = inspection({ id: "old", inspection_no: "INS-OLD" });

  it("puts the rows the server saved at the front of the cached detail", () => {
    const saved = [inspection({ id: "n1", inspection_no: "INS-NEW" }), inspection({ id: "n2", inspection_no: "INS-NEW" })];
    const merged = withSavedInspections(detail({ inspections: [older] }), saved);
    expect(merged?.inspections?.map((row) => row.id)).toEqual(["n1", "n2", "old"]);
    // Everything else in the detail stays as it was.
    expect(merged?.document_no).toBe("DOC-008");
    expect(merged?.versions).toEqual([]);
  });

  it("never lists a row twice, and starts a list the detail did not have", () => {
    const merged = withSavedInspections(detail({ inspections: [older] }), [older, inspection({ id: "n1" })]);
    expect(merged?.inspections?.map((row) => row.id)).toEqual(["n1", "old"]);
    const bare = detail();
    delete bare.inspections;
    expect(withSavedInspections(bare, [inspection({ id: "n1" })])?.inspections?.map((row) => row.id)).toEqual(["n1"]);
  });

  it("leaves the cache alone when that detail is not in it", () => {
    expect(withSavedInspections(undefined, [inspection()])).toBeUndefined();
  });

  it("is written into the detail's own query from the answer, then read again, then the dialog closes", () => {
    const dialog = read("src/components/document-workflow/inspection.tsx");
    const success = dialog.slice(dialog.indexOf("onSuccess: (saved) => {"), dialog.indexOf("onError: (reason) => {"));
    const write = success.indexOf('queryClient.setQueryData<DocumentDetail>(["documents", "detail", documentId], (detail) =>');
    expect(write).toBeGreaterThan(-1);
    expect(success).toContain("withSavedInspections(detail, saved)");
    expect(success.indexOf('invalidateQueries({ queryKey: ["documents"] })')).toBeGreaterThan(write);
    expect(success.indexOf("onClose();")).toBeGreaterThan(success.indexOf('invalidateQueries({ queryKey: ["documents"] })'));
    // The detail reads that same key.
    expect(read("src/components/document-workflow/documents.tsx")).toContain('queryKey: ["documents", "detail", documentId],');
  });
});

describe("a submit that did not work says so in one clear block (JB196-7)", () => {
  const words: Record<Locale, [string, string]> = {
    zh: ["检验结果没有保存。", "你填的内容还在，改好后再按一次「提交」。"],
    "zh-TW": ["檢驗結果沒有保存。", "你填的內容還在，改好後再按一次「提交」。"],
    en: ["The inspection result was not saved.", "What you filled in is still here. Correct it and press Submit again."],
    ms: ["Keputusan pemeriksaan tidak disimpan.", "Apa yang anda isi masih ada. Betulkan dan tekan Hantar sekali lagi."],
  };

  it("says it was not saved, the reason, and that what was filled in is still there - in all four languages", () => {
    for (const locale of Object.keys(words) as Locale[]) {
      const html = render(<InspectionNotSaved reason="服务器暂时无法连接" />, locale);
      const [title, hint] = words[locale];
      expect(html).toContain('role="alert"');
      expect(html).toContain(`<p class="font-semibold text-destructive">${title}</p><p>服务器暂时无法连接</p>`);
      expect(html).toContain(`<p class="text-muted-foreground">${hint}</p>`);
    }
  });

  it("is a box the size of the confirm block, in the house's tokens, no hard-coded colour", () => {
    const html = render(<InspectionNotSaved reason="x" />);
    expect(html).toMatch(/class="space-y-1 rounded-lg border border-destructive\/40 bg-destructive\/10 p-3 text-sm"/);
    const dialog = read("src/components/document-workflow/inspection.tsx");
    // The confirm block it stands in for: the same rounded-lg box with p-3.
    expect(dialog).toContain('className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"');
    expect(dialog).not.toMatch(/#[0-9a-fA-F]{3,6}\b|text-red-|bg-red-/);
  });

  it("stands where the confirm block was, scrolled into view, the form kept, gone on 提交 again", () => {
    const dialog = read("src/components/document-workflow/inspection.tsx");
    const body = dialog.slice(dialog.indexOf("export function InspectionDialog("));
    // The small red line is gone; the block sits right above the confirm block / footer.
    expect(body).not.toContain('<p className="text-sm text-destructive">{error}</p>');
    expect(body).toMatch(/\{error && <InspectionNotSaved ref=\{notSaved\} reason=\{error\} \/>\}\n\s*\{confirming \? \(/);
    expect(body).toContain('if (error) notSaved.current?.scrollIntoView({ block: "nearest" });');
    expect(body).toContain('setError(reason instanceof ApiError ? reason.message : t("failed"));');
    // The dialog stays open: onError never closes it, and 提交 clears the block.
    const failure = body.slice(body.indexOf("onError: (reason) => {"), body.indexOf("const requires"));
    expect(failure).not.toContain("onClose");
    expect(failure).toContain('reason.code === "inspection_equipment_not_on_site"');
    expect(body).toMatch(/setError\(""\);\n\s*setConfirming\(true\);/);
    expect(body).not.toContain("router.push");
  });
});

describe("【添加文件】 in the detail window (JB196-8)", () => {
  const noop = () => undefined;
  const body = (props: { document?: DocumentDetail; onAddFiles?: () => void }) => (
    <DocumentDetailBody
      document={props.document ?? detail()}
      systemFiles={[]}
      downloading={null}
      previewing={null}
      onPreview={noop}
      onDownload={noop}
      onOpenSource={noop}
      onAddFiles={props.onAddFiles}
    />
  );

  /** The 「上传的文件（版本）」 header: the title, the count, the button. */
  function versionsHeader(html: string): string {
    const start = html.indexOf(zh.documents.versions.title);
    return html.slice(start, html.indexOf("<table", start));
  }

  it("sits beside the versions' count when the list passes it, worded as the row's 上传 icon", () => {
    auth.codes = null;
    const header = versionsHeader(render(body({ onAddFiles: noop })));
    expect(header).toContain('data-testid="document-add-files"');
    expect(header).toContain(`${zh.documents.upload.action}</button>`);
    expect(header.indexOf('data-testid="document-add-files"')).toBeGreaterThan(header.indexOf(">0<"));
  });

  it("is not there where the detail is opened without it (in place, from other pages)", () => {
    auth.codes = null;
    expect(render(body({}))).not.toContain('data-testid="document-add-files"');
    const source = read("src/components/document-workflow/documents.tsx");
    const inPlace = source.slice(source.indexOf("export function DocumentInPlace("), source.indexOf("type ShownFile"));
    expect(inPlace).not.toContain("onAddFiles");
    expect(source).toContain("onAddFiles={setUploading}");
  });

  it("follows the row icon's rule: greyed with the reason on a company-wide document for a non-manager", () => {
    auth.codes = ["document.view"];
    const header = versionsHeader(render(body({ document: detail({ project: null, project_name: null }), onAddFiles: noop })));
    expect(header).toContain('data-testid="document-add-files"');
    expect(header).toMatch(/<button[^>]*disabled=""[^>]*data-testid="document-add-files"|<button[^>]*data-testid="document-add-files"[^>]*disabled=""/);
    expect(header).toContain(zh.documents.upload.companyWideManagerOnly);
    // Nobody who may upload: no button, as no icon on the row.
    auth.codes = [];
    expect(render(body({ onAddFiles: noop }))).not.toContain('data-testid="document-add-files"');
    auth.codes = null;
  });

  it("is one rule for the row's icon and the detail's button", () => {
    const t = (key: string) => key;
    const all = () => true;
    const viewer = (code: string) => code === "document.view";
    const none = () => false;
    expect(addFilesRule({ status: "ACTIVE", project: "p1" }, viewer, t)).toEqual({ shown: true, disabledReason: undefined });
    expect(addFilesRule({ status: "ACTIVE", project: null }, viewer, t)).toEqual({
      shown: true,
      disabledReason: "documents.upload.companyWideManagerOnly",
    });
    expect(addFilesRule({ status: "ACTIVE", project: null }, all, t)).toEqual({ shown: true, disabledReason: undefined });
    expect(addFilesRule({ status: "ACTIVE", project: "p1" }, none, t).shown).toBe(false);
    const source = read("src/components/document-workflow/documents.tsx");
    expect(source.match(/addFilesRule\((?:record|document), can, t\)/g)).toHaveLength(2);
    // It opens the row's own dialog, drawn after the detail so it sits over it.
    expect(source.indexOf("onAddFiles={setUploading}")).toBeLessThan(source.indexOf("<VersionUploadDialog\n"));
  });

  it("leaves the inspection results as they are", () => {
    auth.codes = null;
    const html = render(body({ document: detail({ inspections: [inspection()] }), onAddFiles: noop }));
    expect(html).toContain("INS-2026-11");
    expect(html).toContain("EQ0001 · 挖土机");
  });
});

describe("the list names more than one source (JB196-10)", () => {
  const noop = () => undefined;
  const file = {
    id: "sf1",
    module: "MATERIAL_RECEIPT",
    file_name: "a.jpg",
    content_type: "image/jpeg",
    preview_type: "image/jpeg",
    byte_size: 10,
    kind: "PHOTO",
    thumbnail_url: null,
    captured_at: "2026-11-11T03:00:00Z",
    record: { kind: "MATERIAL_RECEIPT", id: "r1", reference: "MI-PRJ-0003-009", deleted: false },
  } as unknown as DocumentSystemFileInfo;
  const button = (html: string) => /<button[^>]*>([^<]*)<\/button>/.exec(html)?.[1] ?? "";
  const from = `来自 MI-PRJ-0003-009 · ${zh.nav.material_receipts}`;

  it("adds 「，另有 N 个记录」 after the first source when there are more, as today for one or none", () => {
    expect(button(render(<SourceTag source={file} onOpen={noop} />))).toBe(from);
    expect(button(render(<SourceTag source={file} records={0} onOpen={noop} />))).toBe(from);
    expect(button(render(<SourceTag source={file} records={1} onOpen={noop} />))).toBe(from);
    expect(button(render(<SourceTag source={file} records={2} onOpen={noop} />))).toBe(`${from}，另有 1 个记录`);
    expect(button(render(<SourceTag source={file} records={3} onOpen={noop} />))).toBe(`${from}，另有 2 个记录`);
    // The whole of it on hover, still opening the first file's record.
    expect(render(<SourceTag source={file} records={2} onOpen={noop} />)).toContain(
      `title="${from}，另有 1 个记录 · ${zh.documents.source.open}"`,
    );
  });

  it("says it in all four languages, English counted", () => {
    const tail = (locale: Locale, records: number) => {
      const text = button(render(<SourceTag source={file} records={records} onOpen={noop} />, locale));
      return text.slice(text.indexOf("MI-PRJ-0003-009"));
    };
    expect(tail("zh-TW", 2)).toMatch(/，另有 1 個記錄$/);
    expect(tail("en", 2)).toMatch(/, and 1 more record$/);
    expect(tail("en", 3)).toMatch(/, and 2 more records$/);
    expect(tail("ms", 3)).toMatch(/, dan 2 rekod lain$/);
  });

  it("is fed the row's source_count, the 「+N 个文件」 count left alone", () => {
    const source = read("src/components/document-workflow/documents.tsx");
    expect(source).toContain("records={row.original.source_count}");
    expect(source).toContain('t("documents.filesMore", { count: more })');
  });
});

describe("the words (contract table, JB196)", () => {
  const table: Record<string, Record<Locale, string>> = {
    "inspection.reportDateOn": { zh: "报告日期 {date}", "zh-TW": "報告日期 {date}", en: "Report dated {date}", ms: "Laporan bertarikh {date}" },
    "inspection.notSaved": {
      zh: "检验结果没有保存。",
      "zh-TW": "檢驗結果沒有保存。",
      en: "The inspection result was not saved.",
      ms: "Keputusan pemeriksaan tidak disimpan.",
    },
    "inspection.notSavedHint": {
      zh: "你填的内容还在，改好后再按一次「提交」。",
      "zh-TW": "你填的內容還在，改好後再按一次「提交」。",
      en: "What you filled in is still here. Correct it and press Submit again.",
      ms: "Apa yang anda isi masih ada. Betulkan dan tekan Hantar sekali lagi.",
    },
    "source.more": {
      zh: "，另有 {count} 个记录",
      "zh-TW": "，另有 {count} 個記錄",
      en: ", and {count, plural, one {# more record} other {# more records}}",
      ms: ", dan {count} rekod lain",
    },
    // 「清单那个图标如果已经有一个同样意思的字，就用它，不另加」: the row's 上传 icon's own word.
    "upload.action": { zh: "添加文件", "zh-TW": "添加文件", en: "Add files", ms: "Tambah fail" },
  };

  it("are in all four catalogues exactly as the table gives them", () => {
    for (const [key, values] of Object.entries(table)) {
      for (const locale of Object.keys(CATALOGUES) as Locale[]) {
        const [group, name] = key.split(".");
        const documents = CATALOGUES[locale].documents as unknown as Record<string, Record<string, string>>;
        expect(documents[group][name], `${locale} documents.${key}`).toBe(values[locale]);
      }
    }
  });

  it("reuse the row icon's 添加文件 rather than a second key with the same meaning", () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      expect((catalogue.documents.versions as Record<string, string>).add).toBeUndefined();
    }
  });

  it("say 你, never 您", () => {
    for (const catalogue of [zh, zhTW]) {
      expect(catalogue.documents.inspection.notSavedHint).toContain("你");
      expect(catalogue.documents.inspection.notSavedHint).not.toContain("您");
    }
  });
});
