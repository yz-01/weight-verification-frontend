/**
 * The header of a page the browser prints (2026-10-10, 全系统公司表头规则).
 *
 * The client: 「整个系统所有正式表格、PDF、打印件、导出文件都不能固定使用
 * MSE Trace / 系统公司的名称作为客户文件表头」 - a printed list is headed with
 * the client company's own name and logo and, when one was chosen, the
 * project. The platform's name is only the small tag in the top right corner:
 * 「如需要显示平台来源，只放在页右上角小标识，Evidence Chain by MSE Trace」.
 *
 * The header data comes from the server with the list it heads
 * (`utils.letterhead.letterhead_payload`), read off the list's own company and
 * project - never pieced together from whoever is looking at the screen.
 */

/** The only words naming the platform on a client's printed page. */
export const PLATFORM_TAG = "Evidence Chain by MSE Trace";

export interface PrintLetterhead {
  company_name: string;
  company_logo_url: string | null;
  project_code: string;
  project_name: string;
  platform_tag?: string;
}

export function escapePrintHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** Only an http(s) picture is put in the page; anything else is left out. */
function safeImageUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value, typeof window === "undefined" ? "http://localhost" : window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** The print page's styles for the header block and the corner tag. */
export const LETTERHEAD_PRINT_CSS =
  ".letterhead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1.5px solid #0f5f6b;padding-bottom:6px;margin:0 0 10px}" +
  ".letterhead .party{display:flex;align-items:center;gap:10px;min-width:0}" +
  ".letterhead .party img{display:block;max-height:40px;max-width:120px;object-fit:contain}" +
  ".letterhead .company{font-size:16px;font-weight:700;margin:0;color:#111}" +
  ".letterhead .project{font-size:11px;color:#555;margin:2px 0 0}" +
  ".letterhead .what{text-align:right}" +
  ".letterhead .what h1{font-size:18px;margin:0}" +
  ".platform-tag{position:fixed;top:4px;right:8px;font-size:8px;color:#9ca3af;margin:0}";

/**
 * The header block: the company's logo, name and project left, what the page
 * is right; and the platform's small tag, which repeats in the top right
 * corner of every printed sheet.
 */
export function letterheadHtml(head: PrintLetterhead | null | undefined, title: string) {
  const projectLine = [head?.project_code, head?.project_name].filter(Boolean).join(" - ");
  const logo = safeImageUrl(head?.company_logo_url);
  const party = [
    logo ? `<img src="${escapePrintHtml(logo)}" alt="">` : "",
    `<div>${head?.company_name ? `<p class="company">${escapePrintHtml(head.company_name)}</p>` : ""}${projectLine ? `<p class="project">${escapePrintHtml(projectLine)}</p>` : ""}</div>`,
  ].join("");
  return (
    `<p class="platform-tag">${escapePrintHtml(head?.platform_tag || PLATFORM_TAG)}</p>` +
    `<header class="letterhead"><div class="party">${party}</div><div class="what"><h1>${escapePrintHtml(title)}</h1></div></header>`
  );
}
