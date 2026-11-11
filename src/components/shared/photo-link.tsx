"use client";

/**
 * A link to a photo that opens it in the app's own viewer (Lucas 11-08:
 * 「整个系统都照片都一样」).
 *
 * Many screens used to open a photo as a bare file in a new browser tab - no
 * zoom bar, no 上一张 / 下一张, and on a phone a second window to find the
 * way back from. A photo now opens in `PhotoViewer`, the one every record
 * uses: whole, 放大 / 缩小 / 整张显示 to 400%, and the neighbours one press
 * away when the screen has several. Anything that is not a picture (a PDF, a
 * Word file...) still opens as before, in a new tab.
 *
 * The `href` stays on the link, so a middle click, Ctrl/⌘-click or "open in
 * new tab" still gives the file itself.
 *
 * `PhotoViewer` is loaded the first time a photo is opened: the record shell
 * it lives in reaches back to `file-thumbs`, which uses this link, so a
 * static import would go round in a circle.
 */

import dynamic from "next/dynamic";
import { useState } from "react";

import type { ShellPhoto } from "@/components/shared/record-detail-shell";

const PhotoViewer = dynamic(
  () => import("@/components/shared/record-detail-shell").then((module) => module.PhotoViewer),
  { ssr: false },
);

/** Picture formats a browser draws (and the phones' HEIC, which the server stamps). */
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|heic|heif|gif)$/i;

/**
 * Whether a file is a photo: by its content type when known, else by the
 * extension of its name or of the address's path (a signed address's query
 * is ignored).
 */
export function isImageFile(name?: string | null, contentType?: string | null): boolean {
  if (contentType) return contentType.toLowerCase().startsWith("image/");
  if (!name) return false;
  let path = name;
  try {
    path = new URL(name, "http://local").pathname;
  } catch {
    path = name.split(/[?#]/)[0] ?? name;
  }
  return IMAGE_EXTENSION.test(path);
}

/** One photo the viewer can step to. */
export interface LinkPhoto {
  url: string;
  label: string;
  id?: string;
  /** A signature or a stamp: shown on white (`ShellPhoto.paper`, JB172). */
  paper?: boolean;
}

export function toViewerPhotos(photos: readonly LinkPhoto[]): ShellPhoto[] {
  return photos.map((photo, index) => ({
    id: photo.id ?? `${index}-${photo.url}`,
    url: photo.url,
    label: photo.label,
    // A bare file address carries no time or place; the record has them.
    metaUnknown: true,
    ...(photo.paper ? { paper: true } : {}),
  }));
}

/** A task's reference files that are photos, for stepping through them. */
export function referencePhotos(
  references: readonly { id: string; kind: string; file: string; label?: string | null; original_filename?: string | null }[],
): LinkPhoto[] {
  return references
    .filter((reference) => reference.kind === "PHOTO")
    .map((reference) => ({
      id: reference.id,
      url: reference.file,
      label: reference.label || reference.original_filename || "",
    }));
}

type AnchorProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "onClick">;

export function PhotoLink({
  href,
  label,
  name,
  contentType,
  image,
  paper,
  photos,
  index = 0,
  reference,
  children,
  ...anchor
}: AnchorProps & {
  href: string;
  /** What the photo is: the viewer's title. */
  label: string;
  /** The file's name, when the address does not end in it. */
  name?: string | null;
  contentType?: string | null;
  /** The caller knows it is a photo (it draws it as one): skip the guess. */
  image?: boolean;
  /**
   * It is a signature or a stamp (JB172): the viewer shows it on white, where
   * its dark ink can be read in both modes. For this link's own picture; a
   * set passed in `photos` says so photo by photo.
   */
  paper?: boolean;
  /** The screen's photos, for 上一张 / 下一张; this one is `photos[index]`. */
  photos?: readonly LinkPhoto[];
  index?: number;
  /** Names the downloaded copy and the viewer's caption; defaults to `label`. */
  reference?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const isPhoto = image ?? isImageFile(name || href, contentType);
  if (!isPhoto) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...anchor}>
        {children}
      </a>
    );
  }
  const set: readonly LinkPhoto[] = photos && photos.length > 0 ? photos : [{ url: href, label, paper }];
  const start = photos && photos.length > 0 ? Math.min(Math.max(index, 0), set.length - 1) : 0;
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        data-photo-link
        {...anchor}
        onClick={(event) => {
          // A middle click or Ctrl/⌘/Shift-click still opens the file itself.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(start);
        }}
      >
        {children}
      </a>
      {open !== null ? (
        // The viewer is a portal, but React still bubbles its clicks up
        // through here: a list row's own click must not fire under it.
        <span className="contents" onClick={(event) => event.stopPropagation()}>
          <PhotoViewer
            photos={toViewerPhotos(set)}
            index={open}
            reference={reference ?? label}
            onIndex={setOpen}
            onClose={() => setOpen(null)}
          />
        </span>
      ) : null}
    </>
  );
}
