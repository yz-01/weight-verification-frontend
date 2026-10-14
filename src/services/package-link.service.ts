/**
 * The package link an owner, a supplier or anybody else opens (batch H, H17 五 3).
 *
 * No session: these calls never carry the office's login, even on a browser
 * that has one - the token in the address is the whole credential, and the
 * page must show what the link shows and nothing more (H17 六 1). Every
 * failure the server gives is the same 「找不到」; the page does not guess why.
 */

import { ApiError } from "@/interfaces/api";
import type { PackageLinkPage, PackageMessage } from "@/interfaces/contractor-ops";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

function linkUrl(token: string, path = "", query?: Record<string, string>) {
  const base = `${API_BASE_URL}/api/package-link/${encodeURIComponent(token)}/${path}`;
  const search = query ? new URLSearchParams(query).toString() : "";
  return search ? `${base}?${search}` : base;
}

async function linkFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // `omit`: never the office's cookies, whatever this browser holds.
    response = await fetch(url, { ...init, credentials: "omit", cache: "no-store" });
  } catch {
    throw new ApiError("network", 0, {}, "network_error");
  }
  let envelope: { success: boolean; data?: T; message?: string; code?: string; errors?: Record<string, string[]> };
  try {
    envelope = await response.json();
  } catch {
    envelope = { success: false };
  }
  if (!response.ok || !envelope.success || envelope.data === undefined) {
    const errors = Object.fromEntries(
      Object.entries(envelope.errors ?? {}).map(([field, lines]) => [field, lines[0] ?? ""]),
    );
    throw new ApiError(
      envelope.message || "package_link_failed",
      response.status,
      errors,
      envelope.code ?? "",
    );
  }
  return envelope.data;
}

function post<T>(url: string, body: Record<string, unknown> | FormData) {
  return linkFetch<T>(url, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

/** The page. `open` is a real open - counted, on the timeline - the first load only. */
export const getPackageLink = (token: string, options: { open?: boolean; lang?: string } = {}) =>
  linkFetch<PackageLinkPage>(
    linkUrl(token, "", {
      ...(options.open ? { open: "1" } : {}),
      ...(options.lang ? { lang: options.lang } : {}),
    }),
  );

// The paths are written out whole (not through `linkUrl`) so the backend's
// reachability guard can see which screen calls each write.
export const reviewLinkItem = (
  token: string,
  payload: { item: string; decision: "ACCEPTED" | "RETURNED"; reason?: string; name: string },
) => post<PackageLinkPage>(`${API_BASE_URL}/api/package-link/${encodeURIComponent(token)}/review/`, payload);

export const signPackageLink = (token: string, name: string) =>
  post<PackageLinkPage>(`${API_BASE_URL}/api/package-link/${encodeURIComponent(token)}/sign/`, { name });

export function sendLinkMessage(
  token: string,
  payload: { body: string; name: string; item?: string; attachment?: File | null },
) {
  const data = new FormData();
  data.append("body", payload.body);
  data.append("name", payload.name);
  if (payload.item) data.append("item", payload.item);
  if (payload.attachment) data.append("attachment", payload.attachment);
  return post<PackageMessage>(`${API_BASE_URL}/api/package-link/${encodeURIComponent(token)}/messages/`, data);
}

/** A file the link may read, as a `File` - for 预览 · 打印 · 下载 · 发送. */
async function linkFile(url: string, fallbackName: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "omit", cache: "no-store" });
  } catch {
    throw new ApiError("network", 0, {}, "network_error");
  }
  if (!response.ok) {
    throw new ApiError("package_link_failed", response.status, {}, "package_link_not_found");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return new File([blob], match?.[1] ?? fallbackName, {
    type: blob.type || "application/octet-stream",
  });
}

/** The current round's PDF. A download on the timeline - never an export. */
export const linkPackageFile = (token: string, name: string, who: string, inline = false) =>
  linkFile(
    linkUrl(token, "download/", { ...(inline ? { inline: "1" } : {}), ...(who ? { name: who } : {}) }),
    `${name || "package"}.pdf`,
  );

/** One record of the current round as its own PDF - no money on it. */
export const linkItemFile = (
  token: string,
  item: string,
  reference: string,
  options: { who?: string; lang?: string; inline?: boolean } = {},
) =>
  linkFile(
    linkUrl(token, "download-item/", {
      item,
      ...(options.inline ? { inline: "1" } : {}),
      ...(options.who ? { name: options.who } : {}),
      ...(options.lang ? { lang: options.lang } : {}),
    }),
    `${reference || "record"}.pdf`,
  );

/** A file from this link's own thread. `path` is what the message carries. */
export const linkAttachmentFile = (path: string, name: string) =>
  linkFile(`${API_BASE_URL}${path}`, name || "attachment");
