/**
 * Read an exported `.xlsx` in the browser, to preview it as a table
 * (PDF 统一操作规则: 「所有关于 pdf 或者 excel 的都可以预览不用先下载」).
 *
 * No spreadsheet library is installed, and the files the system exports are
 * plain: text, numbers and dates in cells, a merged title row, shared
 * strings. An `.xlsx` is a zip of XML parts, so this reads the zip (the
 * browser's own `DecompressionStream` inflates it), then the workbook, the
 * shared strings, the date styles and each sheet's cells - enough to show
 * the same rows the file holds, read-only. Pictures, colours and formulas'
 * logic are not drawn; formulas show the value Excel saved with them.
 */

/* ------------------------------------------------------------------ zip */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

export function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error("broken zip directory");
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One zip entry's bytes, or `null` when the zip has no such entry. */
export async function zipBytes(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<Uint8Array | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (view.getUint32(at, true) !== LOCAL) throw new Error("broken zip entry");
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  let data: Uint8Array;
  if (entry.method === 0) data = raw;
  else if (entry.method === 8) data = await inflate(raw);
  else throw new Error(`unsupported zip method ${entry.method}`);
  return data;
}

export async function zipText(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const data = await zipBytes(bytes, entries, name);
  return data === null ? null : new TextDecoder().decode(data);
}

/* ------------------------------------------------------------------ xml */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

/** A small, forgiving XML reader: elements, attributes and text. */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const tag = /<(\/?)([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<[!?][\s\S]*?>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(source))) {
    const top = stack[stack.length - 1];
    if (match.index > last) top.text += decodeEntities(source.slice(last, match.index));
    last = tag.lastIndex;
    if (match[5] !== undefined) {
      top.text += match[5];
      continue;
    }
    if (!match[2]) continue; // a comment, declaration or processing instruction
    const name = localName(match[2]);
    if (match[1]) {
      // Close back to the matching element; tolerate a stray close tag.
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].name === name) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    const attr = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let pair: RegExpExecArray | null;
    while ((pair = attr.exec(match[3] ?? ""))) {
      attrs[pair[1]] = decodeEntities(pair[3] ?? pair[4] ?? "");
    }
    const node: XmlNode = { name, attrs, children: [], text: "" };
    top.children.push(node);
    if (!match[4]) stack.push(node);
  }
  return root;
}

export function* walk(node: XmlNode, name: string): Generator<XmlNode> {
  for (const child of node.children) {
    if (child.name === name) yield child;
    yield* walk(child, name);
  }
}

function first(node: XmlNode, name: string): XmlNode | undefined {
  return walk(node, name).next().value ?? undefined;
}

/** An attribute by its local name, whatever namespace prefix it carries. */
export function attribute(node: XmlNode, name: string): string | undefined {
  if (name in node.attrs) return node.attrs[name];
  for (const [key, value] of Object.entries(node.attrs)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

/** A shared or inline string: its `<t>` runs joined, phonetic hints left out. */
function textOf(node: XmlNode): string {
  if (node.name === "rPh") return "";
  if (node.name === "t") return node.text;
  return node.children.map(textOf).join("");
}

/* ---------------------------------------------------------------- dates */

const BUILT_IN_DATE_FORMATS: Record<number, string> = {
  14: "dd/mm/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "dd/mm/yyyy h:mm",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Whether a number format shows a date or a time. */
export function isDateFormat(code: string): boolean {
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmyhs]/i.test(bare) && !/^[#0.,%E+\-\s]*$/i.test(bare);
}

/** An Excel serial day as the format shows it (1900 system, as exported). */
export function formatExcelDate(serial: number, code: string): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const date = new Date(ms);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const twelveHour = /AM\/PM|A\/P/i.test(code);
  const tokens = code.replace(/"([^"]*)"/g, "\u0000$1\u0000").replace(/\[[^\]]*\]|\\/g, "")
    .match(/\u0000[^\u0000]*\u0000|yyyy|yy|mmmm|mmm|mm|m|dd|d|hh|h|ss|s|AM\/PM|A\/P|\.0+|./gi) ?? [];
  let out = "";
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (token.startsWith("\u0000")) {
      out += token.slice(1, -1);
      continue;
    }
    // `m` is minutes straight after an hour or straight before seconds.
    const isMinute = (lower === "mm" || lower === "m") && (
      /^h/.test(tokens.slice(0, index).reverse().find((x) => /[a-z]/i.test(x))?.toLowerCase() ?? "") ||
      /^s/.test(tokens.slice(index + 1).find((x) => /[a-z]/i.test(x))?.toLowerCase() ?? "")
    );
    const hours = date.getUTCHours();
    switch (lower) {
      case "yyyy": out += pad(date.getUTCFullYear(), 4); break;
      case "yy": out += pad(date.getUTCFullYear() % 100); break;
      case "mmmm": out += MONTHS_LONG[date.getUTCMonth()]; break;
      case "mmm": out += MONTHS[date.getUTCMonth()]; break;
      case "mm": out += isMinute ? pad(date.getUTCMinutes()) : pad(date.getUTCMonth() + 1); break;
      case "m": out += isMinute ? String(date.getUTCMinutes()) : String(date.getUTCMonth() + 1); break;
      case "dd": out += pad(date.getUTCDate()); break;
      case "d": out += String(date.getUTCDate()); break;
      case "hh": out += pad(twelveHour ? ((hours + 11) % 12) + 1 : hours); break;
      case "h": out += String(twelveHour ? ((hours + 11) % 12) + 1 : hours); break;
      case "ss": out += pad(date.getUTCSeconds()); break;
      case "s": out += String(date.getUTCSeconds()); break;
      case "am/pm": out += hours < 12 ? "AM" : "PM"; break;
      case "a/p": out += hours < 12 ? "A" : "P"; break;
      default: out += lower.startsWith(".0") ? "" : token;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- sheet */

export interface SheetMerge {
  row: number;
  column: number;
  rows: number;
  columns: number;
}

export interface SheetPreview {
  name: string;
  /** Cell text, row by row from A1; short rows are padded to the widest. */
  rows: string[][];
  merges: SheetMerge[];
  /** How many rows the sheet has, when more than `rows` shows. */
  totalRows: number;
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function cellPosition(ref: string): { row: number; column: number } | null {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref);
  return match ? { row: Number(match[2]) - 1, column: columnIndex(match[1]) } : null;
}

function plainNumber(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return String(Number(value.toPrecision(15)));
}

/**
 * Every sheet in the workbook, at most `maxRows` rows each.
 *
 * Throws when the bytes are not a workbook this can read; the caller says so
 * and offers the download.
 */
export async function readWorkbook(data: Blob | ArrayBuffer | Uint8Array, maxRows = 1000): Promise<SheetPreview[]> {
  const bytes = data instanceof Uint8Array
    ? data
    : new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data);
  const entries = zipEntries(bytes);
  const read = (name: string) => zipText(bytes, entries, name);

  const workbookXml = await read("xl/workbook.xml");
  if (!workbookXml) throw new Error("no workbook");
  const workbook = parseXml(workbookXml);

  const targets = new Map<string, string>();
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (relsXml) {
    for (const rel of walk(parseXml(relsXml), "Relationship")) {
      const id = attribute(rel, "Id");
      const target = attribute(rel, "Target");
      if (id && target) {
        targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
      }
    }
  }

  const shared: string[] = [];
  const sharedXml = await read("xl/sharedStrings.xml");
  if (sharedXml) for (const item of walk(parseXml(sharedXml), "si")) shared.push(textOf(item));

  // Which style indexes are dates, and in what format.
  const dateStyles = new Map<number, string>();
  const stylesXml = await read("xl/styles.xml");
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map<number, string>();
    for (const format of walk(styles, "numFmt")) {
      custom.set(Number(attribute(format, "numFmtId")), attribute(format, "formatCode") ?? "");
    }
    const xfs = first(styles, "cellXfs");
    (xfs?.children.filter((child) => child.name === "xf") ?? []).forEach((xf, index) => {
      const id = Number(attribute(xf, "numFmtId") ?? 0);
      const code = custom.get(id) ?? BUILT_IN_DATE_FORMATS[id];
      if (code && isDateFormat(code)) dateStyles.set(index, code);
    });
  }

  const sheets: SheetPreview[] = [];
  let index = 0;
  for (const sheet of walk(workbook, "sheet")) {
    index += 1;
    const name = attribute(sheet, "name") ?? `Sheet${index}`;
    const relId = attribute(sheet, "id");
    const path = (relId && targets.get(relId)) || `xl/worksheets/sheet${index}.xml`;
    const xml = await read(path);
    if (!xml) continue;
    const root = parseXml(xml);
    const grid: string[][] = [];
    let width = 0;
    let totalRows = 0;
    let nextRow = 0;
    for (const row of walk(root, "row")) {
      const rowNumber = Number(attribute(row, "r") ?? nextRow + 1) - 1;
      nextRow = rowNumber + 1;
      totalRows = Math.max(totalRows, rowNumber + 1);
      if (rowNumber >= maxRows) continue;
      let nextColumn = 0;
      for (const cell of row.children) {
        if (cell.name !== "c") continue;
        const position = cellPosition(attribute(cell, "r") ?? "");
        const column = position ? position.column : nextColumn;
        nextColumn = column + 1;
        const type = attribute(cell, "t") ?? "n";
        const valueNode = cell.children.find((child) => child.name === "v");
        const raw = valueNode ? valueNode.text.trim() : "";
        let text = "";
        if (type === "s") text = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") {
          const inline = cell.children.find((child) => child.name === "is");
          text = inline ? textOf(inline) : "";
        } else if (type === "b") text = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
        else if (type === "str" || type === "e") text = raw;
        else if (raw !== "") {
          const dateCode = dateStyles.get(Number(attribute(cell, "s") ?? -1));
          text = dateCode && Number.isFinite(Number(raw)) ? formatExcelDate(Number(raw), dateCode) : plainNumber(raw);
        }
        if (text === "") continue;
        while (grid.length <= rowNumber) grid.push([]);
        grid[rowNumber][column] = text;
        width = Math.max(width, column + 1);
      }
    }
    const merges: SheetMerge[] = [];
    for (const merge of walk(root, "mergeCell")) {
      const [from, to] = (attribute(merge, "ref") ?? "").split(":");
      const start = cellPosition(from ?? "");
      const end = cellPosition(to ?? from ?? "");
      if (!start || !end || start.row >= maxRows) continue;
      merges.push({
        row: start.row,
        column: start.column,
        rows: Math.min(end.row, maxRows - 1) - start.row + 1,
        columns: end.column - start.column + 1,
      });
      width = Math.max(width, end.column + 1);
    }
    const rows = grid.map((cells) => Array.from({ length: width }, (_, column) => cells[column] ?? ""));
    sheets.push({ name, rows, merges, totalRows });
  }
  return sheets;
}
