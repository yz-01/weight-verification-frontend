/**
 * 「分享」 (2026-10 C11): hand a record to WhatsApp, email or whatever the
 * phone offers, so a return can be taken outside as evidence.
 *
 * In order of what is most useful to the person receiving it:
 *
 * 1. the file itself, through the Web Share API, where the browser can share
 *    files (most phones);
 * 2. a link to the record, through the Web Share API, where it can share
 *    only links;
 * 3. the link copied to the clipboard, where there is no share sheet at all
 *    (most desktops) - the caller says 「链接已复制」.
 *
 * The link opens the record in the system: the download itself needs the
 * reader's session, so a copied download address would only fail for the
 * person it was sent to.
 */

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

interface ShareNavigator {
  share?: (data: { title?: string; text?: string; url?: string; files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export async function shareOrCopy(
  {
    title,
    url,
    file,
  }: {
    title: string;
    /** Where the record opens in the system. */
    url: string;
    /** The record's PDF, when it could be fetched. */
    file?: File | null;
  },
  nav: ShareNavigator = typeof navigator === "undefined" ? {} : (navigator as ShareNavigator),
): Promise<ShareOutcome> {
  const attempt = async (data: Parameters<NonNullable<ShareNavigator["share"]>>[0]) => {
    try {
      await nav.share!(data);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const;
      return null;
    }
  };
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    const outcome = await attempt({ title, files: [file] });
    if (outcome) return outcome;
  }
  if (nav.share) {
    const outcome = await attempt({ title, url });
    if (outcome) return outcome;
  }
  if (nav.clipboard) {
    try {
      await nav.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
  return "failed";
}

/** An address inside the app, made absolute for someone else to open. */
export function absoluteUrl(href: string): string {
  if (typeof window === "undefined") return href;
  return new URL(href, window.location.origin).toString();
}
