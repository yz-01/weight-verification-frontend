import { describe, expect, it } from "vitest";

import { acceptFiles, matchesAccept, megabytes, transferFiles } from "@/lib/attachment-picker";

const file = (name: string, type = "", size = 10) => {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
};

describe("matchesAccept", () => {
  it("takes anything when nothing is asked", () => {
    expect(matchesAccept(file("a.xyz"), "")).toBe(true);
  });
  it("reads extensions, wildcards and exact types", () => {
    const accept = ".pdf,.docx,image/*,application/zip";
    expect(matchesAccept(file("Form.PDF"), accept)).toBe(true);
    expect(matchesAccept(file("shot", "image/png"), accept)).toBe(true);
    expect(matchesAccept(file("a.zip", "application/zip"), accept)).toBe(true);
    expect(matchesAccept(file("a.exe", "application/x-msdownload"), accept)).toBe(false);
  });
});

describe("acceptFiles", () => {
  const rule = { accept: ".pdf,image/*", maxFiles: 3, maxBytes: 100, multiple: true };

  it("refuses a wrong type and a too-large file by name", () => {
    const { files, refused } = acceptFiles([], [file("a.pdf"), file("b.exe"), file("c.pdf", "", 500)], rule);
    expect(files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(refused).toEqual([
      { kind: "type", name: "b.exe" },
      { kind: "size", name: "c.pdf" },
    ]);
  });

  it("stops at the file count and reports the rest", () => {
    const existing = [file("1.pdf"), file("2.pdf")];
    const { files, refused } = acceptFiles(existing, [file("3.pdf"), file("4.pdf")], rule);
    expect(files.map((f) => f.name)).toEqual(["1.pdf", "2.pdf", "3.pdf"]);
    expect(refused).toEqual([{ kind: "count", name: "4.pdf" }]);
  });

  it("replaces the held file when only one is allowed", () => {
    const single = { ...rule, multiple: false };
    const { files } = acceptFiles([file("old.pdf")], [file("new.pdf"), file("extra.pdf")], single);
    expect(files.map((f) => f.name)).toEqual(["new.pdf"]);
  });

  it("keeps the held file when a single replacement is refused", () => {
    const single = { ...rule, multiple: false };
    const { files, refused } = acceptFiles([file("old.pdf")], [file("bad.exe")], single);
    expect(files.map((f) => f.name)).toEqual(["old.pdf"]);
    expect(refused).toHaveLength(1);
  });
});

describe("transferFiles", () => {
  const now = new Date("2026-10-16T08:30:00.000Z");

  it("reads files first and never counts the same screenshot twice", () => {
    const shot = file("image.png", "image/png");
    const found = transferFiles(
      { files: [shot], items: [{ kind: "file", type: "image/png", getAsFile: () => shot }] },
      now,
    );
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("pasted-2026-10-16T08-30-00.png");
  });

  it("falls back to items and skips text", () => {
    const shot = file("image.png", "image/png");
    const found = transferFiles(
      {
        files: [],
        items: [
          { kind: "string", type: "text/plain", getAsFile: () => null },
          { kind: "file", type: "image/png", getAsFile: () => shot },
        ],
      },
      now,
    );
    expect(found).toHaveLength(1);
  });

  it("leaves a real file name alone and copes with nothing", () => {
    expect(transferFiles({ files: [file("receipt.pdf")] }, now)[0].name).toBe("receipt.pdf");
    expect(transferFiles(null)).toEqual([]);
  });
});

describe("megabytes", () => {
  it("shows whole numbers whole", () => {
    expect(megabytes(50 * 1024 * 1024)).toBe("50");
    expect(megabytes(1.5 * 1024 * 1024)).toBe("1.5");
  });
});
