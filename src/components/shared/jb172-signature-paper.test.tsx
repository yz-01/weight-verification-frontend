/**
 * JB172 (Lucas 11-12): 「按供应商查看总数的签名背景是透明的，修复一下弄成白色，然后
 * 检查看其他地方有没有类似的问题进行修复」.
 *
 * A signature drawn on the pad was saved as dark ink on a see-through file.
 * Drawn as a photograph - on the dark placeholder, in the viewer's dark frame,
 * on the browser's own dark page - the ink could not be seen. A signature is
 * now ink on paper everywhere: whole, on white, in both modes; and the pad
 * puts the white sheet into the file it saves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PackageMinus } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/shared/evidence-file-actions", () => ({
  EvidenceFileActions: ({ paper }: { paper?: boolean }) => (
    <div data-stub="file-actions" data-paper={paper || undefined} />
  ),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PhotoViewer, photoSurface } = await import("@/components/shared/record-detail-shell");
const { PhotoThumb } = await import("@/components/shared/photo-thumb");
const { toViewerPhotos } = await import("@/components/shared/photo-link");
const { openImageOnPaper } = await import("@/lib/file-actions");

const SIGNATURE = "https://files.test/signatures/driver.png";
const PHOTO = "https://files.test/evidence/arrival-stamped.jpg";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");
}

/** The opening tag that carries `marker`. */
function tagWith(html: string, marker: string) {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

describe("a signature's thumbnail", () => {
  it("is whole on white, not cut to fill on the dark placeholder", () => {
    const html = renderDetail(
      <PhotoThumb
        paper
        size="sm"
        coverUrl={SIGNATURE}
        count={1}
        icon={PackageMinus}
        reference="MO-001 · 供应商 / 司机签名"
        photos={[{ id: "s", url: SIGNATURE, label: "供应商 / 司机签名" }]}
      />,
    );
    const tile = tagWith(html, 'data-photo-thumb="photo"');
    expect(tile).toContain('data-paper="true"');
    expect(tile).toContain("bg-paper");
    expect(tile).not.toContain("photo-hatch");
    const img = tagWith(html, SIGNATURE);
    expect(img).toContain("object-contain");
    expect(img).not.toContain("object-cover");
  });

  it("leaves a photograph as it was", () => {
    const html = renderDetail(
      <PhotoThumb coverUrl={PHOTO} count={1} icon={PackageMinus} reference="MO-001" photos={[]} />,
    );
    const tile = tagWith(html, 'data-photo-thumb="photo"');
    expect(tile).toContain("photo-hatch");
    expect(tile).not.toContain("bg-paper");
    expect(tile).not.toContain("data-paper");
    expect(tagWith(html, PHOTO)).toContain("object-cover object-bottom");
  });

  it("hands the viewer its photos as ink on paper", () => {
    const text = source("components/shared/photo-thumb.tsx");
    expect(text).toMatch(/paper \? list\.map\(\(photo\) => \(\{ \.\.\.photo, paper: true \}\)\) : list/);
    // Every way the viewer is opened goes through it.
    expect(text.match(/setOpened\(\{ photos: onPaper\(/g)).toHaveLength(3);
  });
});

describe("the viewer", () => {
  function viewer(paper: boolean) {
    return renderDetail(
      <PhotoViewer
        photos={[{ id: "s", url: paper ? SIGNATURE : PHOTO, label: "供应商 / 司机签名", metaUnknown: true, paper }]}
        index={0}
        reference="MO-001"
        onIndex={() => {}}
        onClose={() => {}}
      />,
    );
  }

  it("puts white under a signature", () => {
    const frame = tagWith(viewer(true), "data-photo-frame");
    expect(frame).toContain('data-paper="true"');
    expect(frame).toContain("bg-paper");
    expect(frame).not.toContain("bg-muted");
  });

  it("keeps the theme's muted surface around a photograph", () => {
    const frame = tagWith(viewer(false), "data-photo-frame");
    expect(frame).toContain("bg-muted");
    expect(frame).not.toContain("bg-paper");
    expect(frame).not.toContain("data-paper");
  });

  it("tells 预览 it is ink on paper", () => {
    expect(tagWith(viewer(true), 'data-stub="file-actions"')).toContain('data-paper="true"');
    expect(tagWith(viewer(false), 'data-stub="file-actions"')).not.toContain("data-paper");
  });

  it("names the two surfaces", () => {
    expect(photoSurface(true)).toBe("bg-paper");
    expect(photoSurface(false)).toBe("bg-muted");
    expect(photoSurface(undefined)).toBe("bg-muted");
  });

  it("is told by a link which of its photos are ink on paper", () => {
    const [signature, photo] = toViewerPhotos([
      { url: SIGNATURE, label: "签名", paper: true },
      { url: PHOTO, label: "照片" },
    ]);
    expect(signature.paper).toBe(true);
    expect(photo.paper).toBeUndefined();
  });
});

describe("预览 of a signature", () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeWindow(popup: unknown) {
    const open = vi.fn().mockReturnValue(popup);
    vi.stubGlobal("window", { open, location: { href: "https://app.test/receipts" } });
    return open;
  }

  it("opens a white page of ours with the picture on it", () => {
    const written: string[] = [];
    const image: Record<string, unknown> = {};
    const appended: unknown[] = [];
    const popup = {
      opener: {} as unknown,
      document: {
        open: vi.fn(),
        write: (html: string) => written.push(html),
        close: vi.fn(),
        title: "",
        createElement: () => image,
        body: { appendChild: (node: unknown) => appended.push(node) },
      },
    };
    const open = fakeWindow(popup);

    openImageOnPaper("/media/signatures/driver.png", "MO-001 · 供应商 / 司机签名");

    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.opener).toBeNull();
    expect(written.join("")).toContain("background:#fff");
    expect(popup.document.title).toBe("MO-001 · 供应商 / 司机签名");
    // The picture by its whole address: the blank page has none of its own.
    expect(image.src).toBe("https://app.test/media/signatures/driver.png");
    expect(appended).toEqual([image]);
  });

  it("opens the file itself where no window of ours is allowed", () => {
    const open = fakeWindow(null);

    openImageOnPaper(SIGNATURE, "x");

    expect(open).toHaveBeenLastCalledWith(SIGNATURE, "_blank", "noopener,noreferrer");
  });

  it("keeps the file's address on the button, for a middle click", () => {
    const text = source("components/shared/evidence-file-actions.tsx");
    expect(text).toMatch(/<a\s+href=\{url\}\s+target="_blank"/);
    expect(text).toMatch(/event\.preventDefault\(\);\s+openImageOnPaper\(url, title\);/);
  });
});

describe("the pad saves the sheet with the ink", () => {
  const pad = source("components/field-staff/field-signature-pad.tsx");

  it("lays white before the first stroke, and again after 清除", () => {
    const start = pad.slice(pad.indexOf("const start ="), pad.indexOf("const move ="));
    expect(start).toMatch(/if \(!sheet\.current\) \{\s+context\.fillStyle = SIGNATURE_PAPER;\s+context\.fillRect\(0, 0, canvas\.width, canvas\.height\);\s+sheet\.current = true;/);
    expect(start.indexOf("fillRect")).toBeLessThan(start.indexOf("beginPath"));
    const clear = pad.slice(pad.indexOf("const clear ="), pad.indexOf("return ("));
    expect(clear).toContain("sheet.current = false");
    expect(pad).toContain('export const SIGNATURE_PAPER = "#ffffff";');
  });

  it("is still a PNG, as before", () => {
    expect(pad).toContain('type: "image/png"');
  });

  it("a kept file redrawn for upload is on white too", () => {
    const sync = source("services/offline-sync.service.ts");
    const redraw = sync.slice(sync.indexOf("async function redrawPhoto"), sync.indexOf("async function redrawPhoto") + 1400);
    expect(redraw.indexOf("fillRect(0, 0, canvas.width, canvas.height)")).toBeGreaterThan(-1);
    expect(redraw.indexOf("fillRect(")).toBeLessThan(redraw.indexOf("drawImage("));
  });
});

describe("every screen that draws a signature", () => {
  it("按供应商查看总数: the three signatures of a return are ink on paper", () => {
    const text = source("components/receipts/net-breakdown.tsx");
    const signatures = text.slice(text.indexOf("{signatures.map("));
    expect(signatures).toMatch(/<PhotoThumb\s+key=\{key\}\s+size="sm"\s+paper\s/);
  });

  it("材料领用结账单: both signatures and the logo sit on white", () => {
    const text = source("components/contractor-ops/issue-statement.tsx");
    expect(text).toMatch(/<img src=\{url\} alt=\{label\} className="[^"]*\bbg-paper\b[^"]*" \/>/);
    expect(text).toMatch(/<img src=\{head\.logo\} alt="" className="[^"]*\bbg-paper\b[^"]*" \/>/);
  });

  it("the phone's 待上传 sheet: a kept signature sits on white", () => {
    const text = source("components/field-staff/my-submissions.tsx");
    expect(text).toMatch(/className="aspect-4\/3 w-full rounded-md border bg-paper object-cover object-bottom"/);
  });

  it("a delivery note's, a return's, a consultant's: opened in the viewer on white, not as a bare file", () => {
    for (const [file, count] of [
      ["components/projects/project-dockets.tsx", 1],
      ["components/suppliers/supplier-return-badge.tsx", 1],
      ["components/consultant-workflow/approval-credential.tsx", 2],
      ["components/consultant-workflow/application-detail.tsx", 2],
    ] as const) {
      const text = source(file);
      const links = text.match(/<PhotoLink\b[^>]*?\bimage\s+paper\b/g) ?? [];
      expect(links, file).toHaveLength(count);
    }
    // No signature or stamp left as a bare link to its file.
    expect(source("components/consultant-workflow/approval-credential.tsx")).not.toMatch(/<a\s+href=\{credential\.data\.(signature|stamp)\}/);
    expect(source("components/consultant-workflow/application-detail.tsx")).not.toMatch(/<a href=\{entry\.(signature|stamp)_snapshot\}/);
    expect(source("components/suppliers/supplier-return-badge.tsx")).not.toMatch(/<a\s+href=\{src\}/);
  });

  it("设备进退场: a signature kept among the photographs is ink on paper", () => {
    const text = source("components/contractor-ops/office-module-lists.tsx");
    expect(text).toMatch(/\.\.\.\(photo\.kind === "SIGNATURE" \? \{ paper: true \} : \{\}\)/);
  });

  it("a record's own 签名 panel was white already, and stays so", () => {
    const text = source("components/shared/record-detail-shell.tsx");
    expect(text).toMatch(/aspect-3\/1 overflow-hidden rounded-lg border border-panel-border bg-switch-thumb/);
  });
});
