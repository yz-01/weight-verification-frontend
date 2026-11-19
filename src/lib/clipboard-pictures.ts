/**
 * Pasting a WhatsApp photo or a screenshot (JB223, 客户 11-19 事项 3:
 * 「支持粘贴 WhatsApp 照片及截图」).
 *
 * Two ways in, both for somebody at a desk: the 【粘贴截图】 button, which reads
 * the clipboard itself, and Ctrl+V anywhere on the page. Each ends in one
 * plain line - what was pasted, or why nothing was - because a paste that
 * does nothing and says nothing is the thing an older user cannot recover from.
 */

import { transferFiles } from "@/lib/attachment-picker";
import type { TransferLike } from "@/lib/voucher-sources";

export type ClipboardPictures =
  | { kind: "ok"; files: File[] }
  /** Nothing picture-like on the clipboard (words, or nothing copied yet). */
  | { kind: "empty" }
  /** The browser would not let the page read it (no API, or permission refused). */
  | { kind: "refused" };

interface ClipboardItemLike {
  types: readonly string[];
  getType(type: string): Promise<Blob>;
}

export interface ClipboardLike {
  read?: () => Promise<readonly ClipboardItemLike[]>;
}

/** Whether 【粘贴截图】 can work here: a browser that lets a page read pictures. */
export function canReadClipboardPictures(
  nav: { clipboard?: ClipboardLike } | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  return typeof nav?.clipboard?.read === "function";
}

function two(value: number) {
  return String(value).padStart(2, "0");
}

/** 「截图 19-11 14:05.png」: the moment it was pasted, as the person reads a date. */
export function screenshotName(prefix: string, at: Date, index: number, type: string): string {
  const extension = (/^image\/(\w+)/i.exec(type)?.[1] ?? "png").toLowerCase().replace("jpeg", "jpg");
  const stamp = `${two(at.getDate())}-${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
  return `${prefix} ${stamp}${index > 0 ? ` (${index + 1})` : ""}.${extension}`;
}

/**
 * A pasted picture comes in as `image.png` (`transferFiles` makes that
 * `pasted-<time>.png`): give it the screenshot name instead. Real files keep
 * their own names.
 */
export function nameScreenshots(files: readonly File[], prefix: string, at: Date): File[] {
  let index = 0;
  return files.map((file) => {
    if (!/^(image|pasted-[^.]*)\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
    const name = screenshotName(prefix, at, index, file.type);
    index += 1;
    return new File([file], name, { type: file.type, lastModified: file.lastModified });
  });
}

/** What 【粘贴截图】 found: every picture on the clipboard, or why there is none. */
export async function readClipboardPictures(
  clipboard: ClipboardLike | undefined,
  prefix: string,
  at: Date = new Date(),
): Promise<ClipboardPictures> {
  if (typeof clipboard?.read !== "function") return { kind: "refused" };
  let items: readonly ClipboardItemLike[];
  try {
    items = await clipboard.read();
  } catch {
    // NotAllowedError (the person said no, or the page is not in front) and
    // a browser that has the call but not for pictures alike.
    return { kind: "refused" };
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.toLowerCase().startsWith("image/"));
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      files.push(new File([blob], screenshotName(prefix, at, files.length, type), { type, lastModified: at.getTime() }));
    } catch {
      // One picture the browser will not hand over is skipped, not the rest.
    }
  }
  return files.length > 0 ? { kind: "ok", files } : { kind: "empty" };
}

interface PasteTargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "number", "password"]);

/** A box somebody types into: words pasted there are meant for it. */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as PasteTargetLike;
  if (element.isContentEditable) return true;
  const tag = (element.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  return tag === "INPUT" && TEXT_INPUT_TYPES.has((element.type ?? "").toLowerCase());
}

/**
 * The files a Ctrl+V anywhere on the page brings to the box, or none.
 *
 * Pictures and files are taken wherever the cursor is - in 说明 too, which
 * cannot hold a picture anyway. Words are never taken: pasted into 标题 or
 * 说明 they stay there, and a copy that carries words as well as a picture
 * (cells copied from Excel) is words when it lands in a box for words.
 */
export function pastedForTheBox(
  target: unknown,
  data: (TransferLike & { getData?: (format: string) => string }) | null | undefined,
  at: Date = new Date(),
): File[] {
  const files = transferFiles(data, at);
  if (files.length === 0) return [];
  if (isTypingTarget(target) && (data?.getData?.("text/plain") ?? "").trim()) return [];
  return files;
}

/** Which line says what a paste added: pictures, or files of any kind. */
export function pastedLineKey(files: readonly Pick<File, "type">[]): "pastedPictures" | "pastedFiles" {
  return files.every((file) => (file.type || "").toLowerCase().startsWith("image/")) ? "pastedPictures" : "pastedFiles";
}
