/**
 * 「所有关于 pdf 或者 excel 的都可以预览不用先下载」 (2026-10-10): an exported
 * workbook is read in the browser and shown as a table - the same rows the
 * file holds, dates as the file formats them, the merged title across the
 * table.
 */
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { formatExcelDate, isDateFormat, parseXml, readWorkbook } from "@/lib/xlsx-preview";

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

/** A zip as Excel and openpyxl write it: deflated parts, one central directory. */
async function zip(files: Record<string, string>, compress = true): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const body = compress ? await deflateRaw(raw) : raw;
    const crc = crc32(raw);
    const local = new Uint8Array(30 + nameBytes.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, compress ? 8 : 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(body, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, compress ? 8 : 0, true);
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

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const WORKBOOK = {
  "xl/workbook.xml": `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="材料出场" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml" Type="x"/><Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="x"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst ${NS}><si><t>报表 &amp; &lt;title&gt;</t></si><si><t>编号</t></si><si><t>日期</t></si><si><r><t>MO-</t></r><r><t xml:space="preserve">0001</t></r><rPh><t>x</t></rPh></si></sst>`,
  "xl/styles.xml": `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy hh:mm"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  "xl/worksheets/sheet1.xml": `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="inlineStr"><is><t>数量</t></is></c></row><row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4" s="1"><v>46304.586805555555</v></c><c r="C4"><v>12.5</v></c></row><row r="5"><c r="A5" t="str"><v>MO-0002</v></c><c r="C5"><v>0.30000000000000004</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
  "xl/worksheets/sheet2.xml": `<worksheet ${NS}><sheetData><row r="1"><c r="B1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
};

describe("readWorkbook", () => {
  it("reads every sheet's cells, strings, dates and the merged title", async () => {
    const sheets = await readWorkbook(await zip(WORKBOOK));
    expect(sheets.map((sheet) => sheet.name)).toEqual(["材料出场", "Second"]);
    const [first, second] = sheets;
    expect(first.rows).toEqual([
      ["报表 & <title>", "", ""],
      ["", "", ""],
      ["编号", "日期", "数量"],
      ["MO-0001", "09 Oct 2026 14:05", "12.5"],
      ["MO-0002", "", "0.3"],
    ]);
    expect(first.merges).toEqual([{ row: 0, column: 0, rows: 1, columns: 3 }]);
    expect(first.totalRows).toBe(5);
    expect(second.rows).toEqual([["", "TRUE"]]);
  });

  it("reads parts stored without compression too", async () => {
    const sheets = await readWorkbook(await zip(WORKBOOK, false));
    expect(sheets[0].rows[3][0]).toBe("MO-0001");
  });

  it("stops at the row limit but still says how long the sheet is", async () => {
    const sheets = await readWorkbook(await zip(WORKBOOK), 3);
    expect(sheets[0].rows).toHaveLength(3);
    expect(sheets[0].totalRows).toBe(5);
  });

  it("refuses bytes that are not a workbook", async () => {
    await expect(readWorkbook(encoder.encode("%PDF-1.7 not a zip"))).rejects.toThrow();
  });

  // A workbook written by the backend's own `build_workbook` (openpyxl), when
  // one has been generated locally - see the package report.
  const sample = process.env.XLSX_PREVIEW_SAMPLE;
  it.runIf(Boolean(sample && existsSync(sample)))("reads a workbook openpyxl wrote", async () => {
    const sheets = await readWorkbook(new Uint8Array(readFileSync(sample!)));
    expect(sheets[0].rows.length).toBeGreaterThan(2);
  });
});

describe("dates", () => {
  it("knows a date format from a number format", () => {
    expect(isDateFormat("dd mmm yyyy hh:mm")).toBe(true);
    expect(isDateFormat("General")).toBe(false);
    expect(isDateFormat("#,##0.00")).toBe(false);
    expect(isDateFormat('0.00 "days"')).toBe(false);
  });

  it("formats a serial day the way the format says", () => {
    expect(formatExcelDate(46304.586805555555, "dd mmm yyyy hh:mm")).toBe("09 Oct 2026 14:05");
    expect(formatExcelDate(46304, "dd/mm/yyyy")).toBe("09/10/2026");
    expect(formatExcelDate(46304.75, "h:mm AM/PM")).toBe("6:00 PM");
  });
});

describe("parseXml", () => {
  it("reads attributes with prefixes, entities and CDATA", () => {
    const root = parseXml(`<?xml version="1.0"?><a x:id="1" b='&quot;q&quot;'><![CDATA[<raw>]]>&#x4e2d;</a>`);
    const a = root.children[0];
    expect(a.attrs).toEqual({ "x:id": "1", b: '"q"' });
    expect(a.text).toBe("<raw>中");
  });
});
