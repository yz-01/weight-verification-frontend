import { afterEach, describe, expect, it, vi } from "vitest";

import { captureDownload, download, fetchAsFile, fileMeta, withFileFetch } from "./api-client";

/**
 * JB27 (客户 10-26 事项 3): a file fetched to preview says so - the server
 * asks no PIN and keeps no 「报表导出历史」 row - and a file fetched for a
 * print / download / send carries the grant its PIN gave, so the export
 * behind it does not ask again. The server's answer names the history row
 * and project, for the log row.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function serve(headers: Record<string, string> = {}) {
  const seen: Array<Record<string, string>> = [];
  globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    seen.push({ ...(init?.headers as Record<string, string>) });
    return new Response("%PDF", {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="r.pdf"', ...headers },
    });
  }) as unknown as typeof fetch;
  return seen;
}

describe("what a file is fetched for", () => {
  it("says preview while previewing, and nothing outside", async () => {
    const seen = serve();
    await withFileFetch({ preview: true }, () => fetchAsFile("/api/x/", { fallbackFilename: "x.pdf", silent: true }));
    await fetchAsFile("/api/x/", { fallbackFilename: "x.pdf", silent: true });
    expect(seen[0]["X-File-Action"]).toBe("preview");
    expect(seen[0]["X-File-Action-Grant"]).toBeUndefined();
    expect(seen[1]["X-File-Action"]).toBeUndefined();
  });

  it("carries the grant through a captured export", async () => {
    const seen = serve();
    await withFileFetch({ grant: "signed" }, () =>
      captureDownload(() => download("/api/x/", { method: "POST", fallbackFilename: "x.pdf", silent: true })),
    );
    expect(seen[0]["X-File-Action-Grant"]).toBe("signed");
    expect(seen[0]["X-File-Action"]).toBeUndefined();
  });

  it("keeps the history row and project the server named", async () => {
    serve({ "X-Report-Export-Id": "row-1", "X-File-Project": "project-1" });
    const file = await fetchAsFile("/api/x/", { fallbackFilename: "x.pdf", silent: true });
    expect(fileMeta(file)).toEqual({ reportExport: "row-1", project: "project-1" });
    expect(fileMeta(new File(["x"], "other.pdf"))).toEqual({});
  });
});
