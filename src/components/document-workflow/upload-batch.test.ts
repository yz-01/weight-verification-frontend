import { describe, expect, it } from "vitest";

import { nextUploadBatch } from "@/components/document-workflow/document-archive-parts";

const a = new File(["a"], "a.pdf");
const b = new File(["b"], "b.pdf");
const c = new File(["c"], "c.pdf");
const d = new File(["d"], "d.pdf");

describe("the document upload batch when the picker changes", () => {
  it("is a new document before anything was sent", () => {
    expect(nextUploadBatch({ files: [a], done: 0, createdId: null }, [a, b])).toEqual({
      files: [a, b],
      done: 0,
      createdId: null,
    });
  });

  it("keeps the document when a file is added after a partial upload", () => {
    expect(nextUploadBatch({ files: [a, b, c], done: 2, createdId: "doc-1" }, [a, b, c, d])).toEqual({
      files: [a, b, c, d],
      done: 2,
      createdId: "doc-1",
    });
  });

  it("keeps the document when a file still to send is taken off", () => {
    expect(nextUploadBatch({ files: [a, b, c], done: 1, createdId: "doc-1" }, [a, b])).toEqual({
      files: [a, b],
      done: 1,
      createdId: "doc-1",
    });
  });

  it("never sends a file already in the document again", () => {
    // `a` and `b` are in; `a` is taken off the list: only `c` is still to send.
    const batch = nextUploadBatch({ files: [a, b, c], done: 2, createdId: "doc-1" }, [b, c]);
    expect(batch).toEqual({ files: [b, c], done: 1, createdId: "doc-1" });
    expect(batch.files.slice(batch.done)).toEqual([c]);
  });

  it("starts a new document on a fresh choice after a completed upload", () => {
    expect(nextUploadBatch({ files: [a, b], done: 2, createdId: "doc-1" }, [c])).toEqual({
      files: [c],
      done: 0,
      createdId: null,
    });
  });
});
