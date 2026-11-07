/**
 * Lucas 11-08: 「整个系统都照片都一样」 - a photo that used to open as a bare
 * file in a new browser tab opens in the app's own viewer (`PhotoViewer`,
 * zoom to 400%, 上一张 / 下一张); a PDF or any other file still opens as
 * before. One shared link (`PhotoLink`) does it everywhere.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { PhotoLink, isImageFile, referencePhotos, toViewerPhotos } = await import(
  "@/components/shared/photo-link"
);

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("what counts as a photo", () => {
  it("knows the picture formats by name or address, ignoring a signed address's query", () => {
    for (const name of ["a.jpg", "a.JPEG", "b.png", "c.webp", "d.heic", "e.HEIF", "f.gif"]) {
      expect(isImageFile(name), name).toBe(true);
    }
    expect(isImageFile("https://cdn.example/media/do.jpg?X-Amz-Signature=abc")).toBe(true);
    expect(isImageFile("/media/proof.png#top")).toBe(true);
  });

  it("leaves a PDF, an Office file or a name-less address alone", () => {
    expect(isImageFile("bank.pdf")).toBe(false);
    expect(isImageFile("minutes.docx")).toBe(false);
    expect(isImageFile("https://cdn.example/files/123?sig=x.jpg")).toBe(false);
    expect(isImageFile(null)).toBe(false);
  });

  it("trusts a content type over the name", () => {
    expect(isImageFile("scan", "image/jpeg")).toBe(true);
    expect(isImageFile("scan.jpg", "application/pdf")).toBe(false);
  });

  it("steps through a task's photo references only", () => {
    expect(
      referencePhotos([
        { id: "1", kind: "PHOTO", file: "/a.jpg", label: "Gate" },
        { id: "2", kind: "FILE", file: "/b.pdf", label: "Plan" },
        { id: "3", kind: "PHOTO", file: "/c.jpg", label: "", original_filename: "c.jpg" },
      ]),
    ).toEqual([
      { id: "1", url: "/a.jpg", label: "Gate" },
      { id: "3", url: "/c.jpg", label: "c.jpg" },
    ]);
    expect(toViewerPhotos([{ url: "/a.jpg", label: "A" }])[0]).toMatchObject({ url: "/a.jpg", label: "A", metaUnknown: true });
  });
});

describe("the link", () => {
  it("marks a photo for the in-app viewer and keeps its address for a middle click", () => {
    const html = renderToStaticMarkup(
      <PhotoLink href="https://cdn.example/do.jpg" label="DO">
        <span>photo</span>
      </PhotoLink>,
    );
    expect(html).toContain("data-photo-link");
    expect(html).toContain('href="https://cdn.example/do.jpg"');
  });

  it("opens anything else in a new tab as before", () => {
    const html = renderToStaticMarkup(
      <PhotoLink href="https://cdn.example/bank.pdf" label="Bank">
        <span>pdf</span>
      </PhotoLink>,
    );
    expect(html).not.toContain("data-photo-link");
    expect(html).toContain('target="_blank"');
  });

  it("takes the caller's word that it is a photo, or that it is not", () => {
    expect(renderToStaticMarkup(<PhotoLink href="/files/9" label="x" image>x</PhotoLink>)).toContain("data-photo-link");
    expect(renderToStaticMarkup(<PhotoLink href="/a.jpg" label="x" image={false}>x</PhotoLink>)).not.toContain(
      "data-photo-link",
    );
  });

  it("opens the record viewer with its zoom, not a page of its own", () => {
    const source = read("src/components/shared/photo-link.tsx");
    expect(source).toContain('import("@/components/shared/record-detail-shell").then((module) => module.PhotoViewer)');
    expect(source).toContain("event.preventDefault()");
  });
});

describe("every screen that opened a photo in a new tab uses the shared link", () => {
  const places = [
    "src/components/contractor-ops/site-disposal-workspaces.tsx",
    "src/components/contractor-ops/waste-outgoing-workspace.tsx",
    "src/components/dispatches/view-dispatch.tsx",
    "src/components/projects/project-dockets.tsx",
    "src/components/consultant-workflow/application-form.tsx",
    "src/components/dashboard/field-task-sheet.tsx",
    "src/components/field-staff/field-staff-workspace.tsx",
    "src/components/field-staff/my-tasks-panel.tsx",
    "src/components/field-staff/my-submissions.tsx",
    "src/components/sundry-claims/sundry-claims-office.tsx",
    "src/components/site-operations/safety.tsx",
    "src/components/site-workers/worker-detail.tsx",
    "src/components/shared/file-thumbs.tsx",
  ];

  it.each(places)("%s", (file) => {
    const source = read(file);
    expect(source).toMatch(/<PhotoLink\b/);
    // No photo is drawn inside a bare new-tab link any more.
    const bare = [...source.matchAll(/<a\b[^>]*target="_blank"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const [, inside] of bare) expect(inside, file).not.toMatch(/<(img|Image)\b/);
  });

  it("leaves the public shared-file page to the browser's own viewer", () => {
    expect(read("src/components/share-link/shared-file.tsx")).not.toContain("PhotoLink");
  });
});
