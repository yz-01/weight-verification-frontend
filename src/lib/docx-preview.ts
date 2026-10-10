/**
 * Read a Word `.docx` in the browser, to preview it in the page
 * (2026-10-10: 「上传去系统的 pdf，excel，word file 看看有什么方法可以在系统里面
 * 直接预览」).
 *
 * No Word library is installed and the server has no Office to convert one.
 * A `.docx` is a zip of XML parts, like an `.xlsx` (`xlsx-preview.ts` reads
 * the zip and the XML), so this reads `word/document.xml` into plain blocks:
 * paragraphs (headings, lists, bold / italic / underline), tables and the
 * pictures pasted in. Page layout, fonts, colours, headers and footers,
 * text boxes and drawings made of shapes are not drawn - enough to read the
 * document, not a copy of how Word lays it out. The result is data, rendered
 * as React elements, never as HTML: nothing in the file can run in the page.
 */

import { attribute, parseXml, walk, zipBytes, zipEntries, zipText, type XmlNode } from "@/lib/xlsx-preview";

export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export type DocInline =
  | { type: "text"; run: DocRun }
  | { type: "break" }
  | { type: "image"; image: string };

export type DocHeading = 0 | 1 | 2 | 3 | 4;

export interface DocParagraph {
  type: "paragraph";
  /** 0 for body text; 1 is a title or a first-level heading. */
  heading: DocHeading;
  list: boolean;
  align: "left" | "center" | "right" | "justify";
  inlines: DocInline[];
}

export interface DocCell {
  blocks: DocBlock[];
  colSpan: number;
  /** A cell merged into the one above it: drawn empty. */
  merged: boolean;
}

export interface DocTable {
  type: "table";
  rows: DocCell[][];
}

export type DocBlock = DocParagraph | DocTable;

export interface DocImage {
  data: Uint8Array;
  type: string;
}

export interface DocPreview {
  blocks: DocBlock[];
  /** Pictures by their key in `DocInline.image`. */
  images: Record<string, DocImage>;
  /** More blocks were in the file than `maxBlocks`. */
  truncated: boolean;
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((item) => item.name === name);
}

/** `<w:pStyle w:val="..."/>`'s value, under `props`. */
function valueOf(props: XmlNode | undefined, name: string): string | undefined {
  const found = props ? child(props, name) : undefined;
  return found ? attribute(found, "val") : undefined;
}

/** A `<w:b/>`-style switch: on unless its value says off. */
function isOn(node: XmlNode | undefined): boolean {
  if (!node) return false;
  const value = attribute(node, "val");
  return value === undefined || !["0", "false", "off", "none"].includes(value.toLowerCase());
}

/** `heading 2` / `Heading2` / `Title` → its level; anything else body text. */
export function headingLevel(styleName: string): DocHeading {
  const name = styleName.toLowerCase().replace(/\s+/g, "");
  if (name === "title") return 1;
  if (name === "subtitle") return 2;
  const match = /^heading([1-9])$/.exec(name);
  if (!match) return 0;
  return Math.min(Number(match[1]), 4) as DocHeading;
}

interface Context {
  styles: Map<string, string>;
  targets: Map<string, string>;
  images: Record<string, DocImage>;
  /** Picture parts still to read, by key. */
  wanted: Map<string, string>;
}

function imageKey(context: Context, relId: string | undefined): string | null {
  if (!relId) return null;
  const target = context.targets.get(relId);
  if (!target) return null;
  const extension = target.slice(target.lastIndexOf(".") + 1).toLowerCase();
  if (!IMAGE_TYPES[extension]) return null; // EMF/WMF and the like: not drawable here
  context.wanted.set(target, IMAGE_TYPES[extension]);
  return target;
}

function inlinesOf(node: XmlNode, context: Context, out: DocInline[], format: DocRun = { text: "" }): void {
  for (const item of node.children) {
    switch (item.name) {
      case "r": {
        const props = child(item, "rPr");
        const run: DocRun = {
          text: "",
          bold: format.bold || (props ? isOn(child(props, "b")) : false),
          italic: format.italic || (props ? isOn(child(props, "i")) : false),
          underline: format.underline || (props ? isOn(child(props, "u")) : false),
          strike: format.strike || (props ? isOn(child(props, "strike")) : false),
        };
        for (const part of item.children) {
          if (part.name === "t") out.push({ type: "text", run: { ...run, text: part.text } });
          else if (part.name === "tab") out.push({ type: "text", run: { ...run, text: "\t" } });
          else if (part.name === "br" || part.name === "cr") out.push({ type: "break" });
          else if (part.name === "noBreakHyphen") out.push({ type: "text", run: { ...run, text: "-" } });
          else if (part.name === "drawing" || part.name === "pict" || part.name === "object") {
            for (const blip of walk(part, "blip")) {
              const key = imageKey(context, attribute(blip, "embed"));
              if (key) out.push({ type: "image", image: key });
            }
            for (const picture of walk(part, "imagedata")) {
              const key = imageKey(context, attribute(picture, "id"));
              if (key) out.push({ type: "image", image: key });
            }
          }
        }
        break;
      }
      // Deleted text in tracked changes is not shown; everything else that
      // wraps runs (links, insertions, fields, smart tags) is read through.
      case "del":
      case "pPr":
      case "rPr":
        break;
      default:
        inlinesOf(item, context, out, format);
    }
  }
}

function paragraphOf(node: XmlNode, context: Context): DocParagraph {
  const props = child(node, "pPr");
  const styleId = valueOf(props, "pStyle");
  const styleName = styleId ? (context.styles.get(styleId) ?? styleId) : "";
  const outline = valueOf(props, "outlineLvl");
  let heading = headingLevel(styleName);
  if (!heading && outline !== undefined) {
    const level = Number(outline);
    if (Number.isFinite(level) && level >= 0 && level < 4) heading = (level + 1) as DocHeading;
  }
  const justification = valueOf(props, "jc");
  const align =
    justification === "center"
      ? "center"
      : justification === "right" || justification === "end"
        ? "right"
        : justification === "both" || justification === "distribute"
          ? "justify"
          : "left";
  const list = Boolean(props && child(props, "numPr")) || /list/i.test(styleName);
  const inlines: DocInline[] = [];
  inlinesOf(node, context, inlines);
  return { type: "paragraph", heading, list, align, inlines };
}

interface Limit {
  left: number;
  truncated: boolean;
}

function blocksOf(node: XmlNode, context: Context, out: DocBlock[], limit: Limit): void {
  for (const item of node.children) {
    if (limit.left <= 0) {
      if (item.name === "p" || item.name === "tbl") limit.truncated = true;
      if (limit.truncated) return;
      continue;
    }
    if (item.name === "p") {
      out.push(paragraphOf(item, context));
      limit.left -= 1;
    } else if (item.name === "tbl") {
      out.push(tableOf(item, context, limit));
      limit.left -= 1;
    } else if (item.name === "sdt" || item.name === "sdtContent" || item.name === "customXml") {
      blocksOf(item, context, out, limit);
    }
  }
}

function tableOf(node: XmlNode, context: Context, limit: Limit): DocTable {
  const rows: DocCell[][] = [];
  for (const row of node.children) {
    if (row.name !== "tr") continue;
    const cells: DocCell[] = [];
    for (const cell of row.children) {
      if (cell.name !== "tc") continue;
      const props = child(cell, "tcPr");
      const span = Number(valueOf(props, "gridSpan") ?? 1);
      const vMerge = props ? child(props, "vMerge") : undefined;
      const merged = Boolean(vMerge) && attribute(vMerge as XmlNode, "val") !== "restart";
      const blocks: DocBlock[] = [];
      if (!merged) blocksOf(cell, context, blocks, limit);
      cells.push({ blocks, colSpan: Number.isFinite(span) && span > 0 ? span : 1, merged });
    }
    rows.push(cells);
  }
  return { type: "table", rows };
}

/**
 * The document's text, tables and pictures, at most `maxBlocks` top-level
 * paragraphs and tables.
 *
 * Throws when the bytes are not a Word document this can read; the caller
 * says so and offers the download.
 */
export async function readDocument(
  data: Blob | ArrayBuffer | Uint8Array,
  maxBlocks = 3000,
): Promise<DocPreview> {
  const bytes = data instanceof Uint8Array
    ? data
    : new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data);
  const entries = zipEntries(bytes);
  const documentXml = await zipText(bytes, entries, "word/document.xml");
  if (!documentXml) throw new Error("no document");

  const styles = new Map<string, string>();
  const stylesXml = await zipText(bytes, entries, "word/styles.xml");
  if (stylesXml) {
    for (const style of walk(parseXml(stylesXml), "style")) {
      const id = attribute(style, "styleId");
      const name = child(style, "name");
      if (id) styles.set(id, (name && attribute(name, "val")) || id);
    }
  }

  const targets = new Map<string, string>();
  const relsXml = await zipText(bytes, entries, "word/_rels/document.xml.rels");
  if (relsXml) {
    for (const rel of walk(parseXml(relsXml), "Relationship")) {
      const id = attribute(rel, "Id");
      const target = attribute(rel, "Target");
      if (!id || !target || attribute(rel, "TargetMode") === "External") continue;
      targets.set(id, target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`);
    }
  }

  const context: Context = { styles, targets, images: {}, wanted: new Map() };
  const body = walk(parseXml(documentXml), "body").next().value;
  if (!body) throw new Error("no document body");
  const blocks: DocBlock[] = [];
  const limit: Limit = { left: maxBlocks, truncated: false };
  blocksOf(body, context, blocks, limit);

  for (const [path, type] of context.wanted) {
    try {
      const picture = await zipBytes(bytes, entries, path);
      if (picture) context.images[path] = { data: picture, type };
    } catch {
      // A picture that cannot be read is left out; the text still shows.
    }
  }
  return { blocks, images: context.images, truncated: limit.truncated };
}
