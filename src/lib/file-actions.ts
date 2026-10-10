/**
 * PDF 统一操作规则 (Lucas, 2026-10-10): every file the system exports - a
 * report, a list, one record - offers the same four things, on the one file
 * the export produced:
 *
 * 1. 预览 - look at it in the page, without downloading it first;
 * 2. 打印 - straight to the printer;
 * 3. 导出 - save it, as before;
 * 4. 发送 - hand it to WhatsApp, email or whatever the phone offers.
 *
 * The browser plumbing for those lives here; the buttons, menu and dialogs
 * live in `components/shared/file-actions.tsx`. Nothing here talks to the
 * server: every function takes the `File` already fetched, so preview, print,
 * save and share are the same bytes.
 *
 * 「发送」 shares a copy of a file. It is not an approval and not a receipt
 * confirmation inside the system - the screens say so beside the button.
 */

export type FileFormat = "pdf" | "sheet" | "image" | "other";

/** What kind of file this is, from its type, falling back to its name. */
export function fileFormat(file: Pick<File, "name" | "type">): FileFormat {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    name.endsWith(".xlsx")
  ) {
    return "sheet";
  }
  if (type.startsWith("image/")) return "image";
  return "other";
}

/** Save the file under its own name, as an export always has. */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** iPhone and iPad, including an iPad that calls itself a Mac. */
export function isAppleMobile(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined =
  typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Whether this browser draws a PDF inside the page.
 *
 * Desktop Chrome, Edge, Firefox and Safari do. Chrome on Android does not -
 * a PDF in a frame there is a blank box or a download - and says so through
 * `navigator.pdfViewerEnabled`. iOS Safari draws only the first page in a
 * frame, so it is treated as not drawing it either: the preview then offers
 * the phone's own viewer, which shows every page and can print and share.
 */
export function canShowPdfInPage(
  nav: (Pick<Navigator, "userAgent" | "maxTouchPoints"> & { pdfViewerEnabled?: boolean }) | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!nav) return false;
  if (isAppleMobile(nav)) return false;
  if (nav.pdfViewerEnabled === false) return false;
  if (nav.pdfViewerEnabled === undefined && /Android/i.test(nav.userAgent)) return false;
  return true;
}

let printFrame: HTMLIFrameElement | null = null;

/**
 * Print a PDF without leaving the page: load it into an invisible frame and
 * ask that frame to print, which brings up the browser's own print dialog.
 *
 * Returns false where that cannot work - a phone whose browser has no PDF
 * viewer to print from (Android Chrome, iOS Safari) - so the caller opens the
 * preview instead, where the phone's own viewer prints it.
 */
export function printFile(file: File): Promise<boolean> {
  if (fileFormat(file) !== "pdf" || !canShowPdfInPage()) return Promise.resolve(false);
  return new Promise((resolve) => {
    // One frame at a time; the last one is left in place until the next
    // print, because removing it while the dialog is open cancels the print
    // in Firefox.
    if (printFrame) {
      const old = printFrame;
      URL.revokeObjectURL(old.src);
      old.remove();
    }
    const url = URL.createObjectURL(file);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    // Not `display: none`: a frame that is not laid out has nothing to print.
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
    frame.onload = () => {
      // The PDF viewer needs a moment after `load` before it can print.
      setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve(true);
        } catch {
          resolve(false);
        }
      }, 250);
    };
    frame.src = url;
    document.body.appendChild(frame);
    printFrame = frame;
  });
}

export type ShareFileOutcome = "shared" | "cancelled" | "unsupported" | "failed";

interface FileShareNavigator {
  share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

/** Whether the share sheet here can take this file (most phones can). */
export function canShareFile(
  file: File,
  nav: FileShareNavigator = typeof navigator === "undefined" ? {} : (navigator as FileShareNavigator),
): boolean {
  try {
    return Boolean(nav.share && nav.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

/**
 * Hand the file itself to the phone's share sheet (WhatsApp, email, Drive...).
 *
 * `unsupported` where there is no share sheet for files (most desktops); the
 * caller then offers download plus an email or WhatsApp message instead.
 * `failed` includes the share sheet refusing because the tap that asked for
 * it is too long ago (iOS allows the sheet only straight after a tap, and
 * fetching the file can take longer) - the caller offers a second tap.
 */
export async function shareFile(
  file: File,
  title: string,
  nav: FileShareNavigator = typeof navigator === "undefined" ? {} : (navigator as FileShareNavigator),
): Promise<ShareFileOutcome> {
  if (!canShareFile(file, nav)) return "unsupported";
  try {
    await nav.share!({ title, files: [file] });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return "failed";
  }
}

/** An email with the file's name in it, for attaching the saved file to. */
export function mailtoLink(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** A WhatsApp message, opened in the app or WhatsApp Web. */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
