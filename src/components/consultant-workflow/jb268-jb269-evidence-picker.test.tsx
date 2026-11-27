/**
 * JB268 / JB269 (客户 11-26 事项 9, 10; 图 10–12): 关联现场证据's picker.
 *
 * - 事项 9: the 分类 / 子分类 counts follow the module, dates, keyword and
 *   uploader chosen (the server counts them so); a new module starts its
 *   categories afresh.
 * - 事项 10: every record is one card - 事项编号 · module · material, then
 *   规格 · 上传人 · 日期时间, then every photo as a thumbnail with its own tick;
 *   the record's tick takes them all; a thumbnail opens the photo large. No
 *   table name, id or file name as the record's name; the module in the
 *   reader's language.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EvidenceCandidate } from "@/interfaces/consultant-workflow";
import { groupModules, rowModuleKey } from "@/lib/evidence-filters";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, isLoading: false, can: () => true }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { EvidenceRecordCard } = await import("@/components/consultant-workflow/evidence-record-card");

function row(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    id: "e-1",
    kind: "PHOTO",
    file: "https://files.test/full-1.jpg",
    watermarked_file: "https://files.test/stamped-1.jpg",
    original_filename: "mse-site-2026-11-25T06-42-49.jpg",
    captured_at: "2026-11-25T06:35:52Z",
    latitude: null,
    longitude: null,
    photographer_name: "ah ong",
    sha256: "x",
    source_model: "receiving.receiptphoto",
    source_id: "3f9b265d-2725-4401-a2ff-6db567eee7b1",
    record_key: "MATERIAL_RECEIPT:r-29",
    record_type: "MATERIAL_RECEIPT",
    record_type_label: "Material receipts / 材料进场",
    record_id: "r-29",
    record_reference: "MI-PRJ-0003-029",
    record_title: "钢筋",
    record_date: "2026-11-25T06:35:52Z",
    record_uploader: "ah ong",
    category: "钢筋",
    subcategory: "Y32",
    record_spec: "Y32、Y20",
    thumbnail_url: "https://files.test/thumb-1.jpg",
    ...overrides,
  };
}

function render(node: React.ReactNode, messages: Record<string, unknown> = zh) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const noop = () => undefined;

describe("JB269 one card per record", () => {
  const rows = [row(), row({ id: "e-2", thumbnail_url: "https://files.test/thumb-2.jpg" })];

  it("names the record by its number, module and material, with 规格 · 上传人 · 日期时间", () => {
    const html = render(<EvidenceRecordCard rows={rows} selected={[]} onToggle={noop} onToggleRecord={noop} onOpen={noop} />);
    expect(html).toContain("MI-PRJ-0003-029 · 材料进场 · 钢筋");
    expect(html).toContain("规格 Y32、Y20");
    expect(html).toContain("上传人 ah ong");
    expect(html).toContain("2 张");
    // Never the table, the id, the file name or the two-language label.
    for (const raw of ["receiving.receiptphoto", "3f9b265d", "mse-site-2026", "Material receipts /"]) {
      expect(html).not.toContain(raw);
    }
  });

  it("shows every photo as a thumbnail that opens large, each with its own tick", () => {
    const html = render(<EvidenceRecordCard rows={rows} selected={[]} onToggle={noop} onToggleRecord={noop} onOpen={noop} />);
    expect(html).toContain("https://files.test/thumb-1.jpg");
    expect(html).toContain("https://files.test/thumb-2.jpg");
    expect(html).toContain("放大查看第 1 张");
    expect(html).toContain("放大查看第 2 张");
    expect(html).toContain("勾选第 1 张");
    expect(html).toContain("勾选第 2 张");
    // And the whole record's tick.
    expect(html).toContain(zh.consultantWorkflow.evidence.selectRecord);
  });

  it("marks a whole record ticked when all its photos are", () => {
    const html = render(<EvidenceRecordCard rows={rows} selected={["e-1", "e-2"]} onToggle={noop} onToggleRecord={noop} onOpen={noop} />);
    expect(html).toContain("ring-primary/20");
  });

  it("names a source that used to be 「其他」 by its module", () => {
    const mr = row({
      source_model: "contractor_ops.materialrequestattachment",
      record_type: "MATERIAL_REQUEST",
      record_reference: "MR-PRJ-0003-007",
      record_title: "Cement",
      record_spec: "",
      record_type_label: "",
    });
    expect(rowModuleKey(mr)).toBe("materialRequest");
    const html = render(<EvidenceRecordCard rows={[mr]} selected={[]} onToggle={noop} onToggleRecord={noop} onOpen={noop} />);
    expect(html).toContain("MR-PRJ-0003-007 · MR / 其他申请 · Cement");
    const gate = row({ source_model: "site_access.gatephoto", record_type: "GATE_INCIDENT" });
    expect(rowModuleKey(gate)).toBe("gate");
    const attached = row({ source_model: "contractor_ops.recordattachment", record_type: "HAZARD" });
    expect(rowModuleKey(attached)).toBe("hazard");
  });

  it("says 待归类 for a progress record with no 施工分类, and 未编号 with no number", () => {
    const progress = row({
      source_model: "contractor_ops.siteprogressphoto",
      record_type: "SITE_PROGRESS",
      record_title: "",
      record_reference: "",
      record_spec: "",
    });
    const html = render(<EvidenceRecordCard rows={[progress]} selected={[]} onToggle={noop} onToggleRecord={noop} onOpen={noop} />);
    expect(html).toContain("未编号 · 进度记录 · 待归类".replace("进度记录", zh.nav.submodule.progressRecords));
  });

  it("speaks the reader's language", () => {
    const html = render(<EvidenceRecordCard rows={rows} selected={[]} onToggle={noop} onToggleRecord={noop} onOpen={noop} />, en);
    expect(html).toContain("Spec Y32、Y20");
    expect(html).toContain("Uploaded by ah ong");
    expect(html).not.toContain("规格");
  });

  it("has every new word in all four languages, 你 only", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(Object.keys(messages.jb269).sort()).toEqual(Object.keys(zh.jb269).sort());
    }
    expect(JSON.stringify(zh.jb269)).not.toContain("您");
  });
});

describe("JB268 the filters", () => {
  const source = readFileSync("src/components/consultant-workflow/application-detail.tsx", "utf-8");

  it("asks the counts for the module, dates, keyword and uploader chosen", () => {
    expect(source).toContain(
      'queryKey: ["application-evidence-filter-options", application.project, moduleFilter, dateFrom, dateTo, keyword, uploader]',
    );
    expect(source).toContain("module: moduleFilter || undefined,");
  });

  it("starts a new module's categories afresh", () => {
    expect(source).toContain('onChange={(next) => { setModuleFilter(next); setCategory(""); setSubcategory(""); }}');
  });

  it("no longer needs each record opened to see its photos", () => {
    expect(source).toContain("<EvidenceRecordCard");
    expect(source).not.toContain("setExpanded(");
  });

  it("folds the newly named sources into their modules", () => {
    expect(groupModules([{ value: "contractor_ops.materialrequestattachment", count: 2 }])[0].key).toBe("materialRequest");
    expect(groupModules([{ value: "site_access.gatephoto", count: 1 }])[0].key).toBe("gate");
  });
});
