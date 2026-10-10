/**
 * 「上传去系统的 pdf，excel，word file 看看有什么方法可以在系统里面直接预览」
 * (2026-10-10): a Word `.docx` is read in the browser - its headings,
 * paragraphs, lists, tables and pictures - and shown as data, never as HTML.
 * The old `.doc` / `.xls` say "download to view".
 */
import { describe, expect, it } from "vitest";

import { headingLevel, readDocument } from "@/lib/docx-preview";
import { isLegacyOffice, previewKind } from "@/components/shared/file-preview";

const encoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip as Word writes it: deflated parts, one central directory. */
async function zip(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = typeof content === "string" ? encoder.encode(content) : content;
    const body = await deflateRaw(raw);
    const crc = crc32(raw);
    const local = new Uint8Array(30 + nameBytes.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(body, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
  <w:p><w:pPr><w:pStyle w:val="1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>会议记录</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">日期 </w:t></w:r><w:r><w:t>2026-10-10 &amp; 地点</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>钢筋到场</w:t></w:r></w:p>
  <w:p><w:ins><w:r><w:t>新增</w:t></w:r></w:ins><w:del><w:r><w:delText>删掉</w:delText></w:r></w:del><w:hyperlink r:id="rId9"><w:r><w:t>链接</w:t></w:r></w:hyperlink></w:p>
  <w:tbl>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>材料</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>T12</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>5 吨</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
  <w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r><w:r><w:drawing><a:blip r:embed="rId6"/></w:drawing></w:r></w:p>
  <w:sectPr/>
</w:body></w:document>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles ${W}><w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style></w:styles>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="image" Target="media/image1.png"/>
  <Relationship Id="rId6" Type="image" Target="media/image2.emf"/>
  <Relationship Id="rId9" Type="hyperlink" Target="https://example.test" TargetMode="External"/>
</Relationships>`;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function texts(block: { type: string; inlines?: { type: string; run?: { text: string } }[] }): string {
  return (block.inlines ?? []).map((inline) => inline.run?.text ?? "").join("");
}

describe("reading a Word document in the page", () => {
  it("reads headings, bold runs, lists, tables and pictures", async () => {
    const file = await zip({
      "word/document.xml": DOCUMENT,
      "word/styles.xml": STYLES,
      "word/_rels/document.xml.rels": RELS,
      "word/media/image1.png": PNG,
      "word/media/image2.emf": new Uint8Array([1, 2, 3]),
    });
    const read = await readDocument(file);
    const [title, date, item, tracked, table, pictures] = read.blocks;

    expect(title).toMatchObject({ type: "paragraph", heading: 1, align: "center" });
    expect(texts(title as never)).toBe("会议记录");
    expect(texts(date as never)).toBe("日期 2026-10-10 & 地点");
    expect(date.type === "paragraph" && date.inlines[0]).toMatchObject({ run: { bold: true } });
    expect(item).toMatchObject({ list: true, heading: 0 });
    // Inserted text and link text show; deleted text does not.
    expect(texts(tracked as never)).toBe("新增链接");

    expect(table.type).toBe("table");
    if (table.type !== "table") return;
    expect(table.rows[0][0].colSpan).toBe(2);
    expect(table.rows[1].map((cell) => texts(cell.blocks[0] as never))).toEqual(["T12", "5 吨"]);

    // The PNG is read; the EMF (which a browser cannot draw) is left out.
    expect(pictures.type === "paragraph" && pictures.inlines).toEqual([{ type: "image", image: "word/media/image1.png" }]);
    expect(Object.keys(read.images)).toEqual(["word/media/image1.png"]);
    expect(read.images["word/media/image1.png"]).toEqual({ data: PNG, type: "image/png" });
    expect(read.truncated).toBe(false);
  });

  it("stops at the block limit and says so", async () => {
    const many = Array.from({ length: 5 }, (_, index) => `<w:p><w:r><w:t>${index}</w:t></w:r></w:p>`).join("");
    const file = await zip({ "word/document.xml": `<w:document ${W}><w:body>${many}</w:body></w:document>` });
    const read = await readDocument(file, 3);
    expect(read.blocks).toHaveLength(3);
    expect(read.truncated).toBe(true);
  });

  it("refuses what is not a Word document", async () => {
    await expect(readDocument(new TextEncoder().encode("not a zip"))).rejects.toThrow();
    await expect(readDocument(await zip({ "xl/workbook.xml": "<workbook/>" }))).rejects.toThrow();
  });

  it("knows a heading by its style name in any spelling", () => {
    expect(headingLevel("heading 1")).toBe(1);
    expect(headingLevel("Heading3")).toBe(3);
    expect(headingLevel("Title")).toBe(1);
    expect(headingLevel("Normal")).toBe(0);
  });
});

describe("which files preview in the page", () => {
  it("previews .docx and .xlsx, and sends the old formats to the download", () => {
    expect(previewKind(null, "minutes.docx")).toBe("word");
    expect(previewKind(null, "Totals.XLSX")).toBe("sheet");
    expect(previewKind("application/pdf", "drawing.pdf")).toBe("pdf");
    expect(previewKind(null, "old-minutes.doc")).toBeNull();
    expect(previewKind(null, "old-totals.xls")).toBeNull();
    expect(isLegacyOffice("old-minutes.DOC")).toBe(true);
    expect(isLegacyOffice("old-totals.xls")).toBe(true);
    expect(isLegacyOffice("minutes.docx")).toBe(false);
  });
});
