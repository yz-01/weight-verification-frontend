/**
 * The decisions behind the unified desktop attachment component (I3).
 *
 * Pure so the two things that are easy to get wrong - which files a page may
 * take given its own server-side limits, and which files a paste or a drop
 * carries - are tested without a browser. The server keeps judging every
 * upload; this only says no earlier, in the same words.
 */

import type { TransferLike } from "@/lib/voucher-sources";

export interface AttachmentRule {
  /** An `accept` string: ".pdf,.docx,image/*,application/pdf". Empty = any file. */
  accept?: string;
  /** Files one upload may hold. Undefined = no client-side ceiling. */
  maxFiles?: number;
  /** One file's ceiling in bytes. Undefined = no client-side ceiling. */
  maxBytes?: number;
  /** More than one file at a time. Off = a new file replaces the old one. */
  multiple?: boolean;
}

export type RefusalKind = "type" | "size" | "count";

export interface Refusal {
  kind: RefusalKind;
  name: string;
}

/** Whether one file satisfies an `accept` string, the way a file input reads it. */
export function matchesAccept(file: Pick<File, "name" | "type">, accept = ""): boolean {
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/**
 * The files the picker holds after `incoming` is offered, and what was refused.
 *
 * Order of judgement per file: type, size, then count - the same order the
 * permit and attachment endpoints use. Several refused files are all reported.
 */
export function acceptFiles(
  existing: readonly File[],
  incoming: readonly File[],
  rule: AttachmentRule,
): { files: File[]; refused: Refusal[] } {
  const refused: Refusal[] = [];
  const accepted: File[] = [];
  for (const file of incoming) {
    if (!matchesAccept(file, rule.accept)) {
      refused.push({ kind: "type", name: file.name });
    } else if (rule.maxBytes !== undefined && file.size > rule.maxBytes) {
      refused.push({ kind: "size", name: file.name });
    } else {
      accepted.push(file);
    }
  }
  if (!rule.multiple) {
    const [first] = accepted;
    return { files: first ? [first] : [...existing], refused };
  }
  const room = rule.maxFiles === undefined ? Infinity : Math.max(0, rule.maxFiles - existing.length);
  const taken = accepted.slice(0, room);
  for (const file of accepted.slice(room)) refused.push({ kind: "count", name: file.name });
  return { files: [...existing, ...taken], refused };
}

/**
 * The files a paste or a drop carries, in order.
 *
 * `files` first (a drop, and a pasted screenshot in current browsers); `items`
 * only when `files` is empty, so one screenshot is never counted twice. A
 * pasted picture arrives named `image.png`, which makes every paste look like
 * the same file, so it gets the moment it was pasted in its name.
 */
export function transferFiles(transfer: TransferLike | null | undefined, now = new Date()): File[] {
  if (!transfer) return [];
  const direct = Array.from(transfer.files ?? []);
  const found =
    direct.length > 0
      ? direct
      : Array.from(transfer.items ?? [])
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file));
  const stamp = now.toISOString().replaceAll(":", "-").replace(/\..+$/, "");
  return found.map((file) => {
    if (!/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
    const extension = file.name.split(".").pop()!.toLowerCase();
    return new File([file], `pasted-${stamp}.${extension}`, { type: file.type, lastModified: file.lastModified });
  });
}

/** Megabytes for the "50 MB each" line: whole numbers stay whole. */
export function megabytes(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
