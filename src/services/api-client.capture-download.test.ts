import { afterEach, describe, expect, it, vi } from "vitest";

import { captureDownload, download } from "./api-client";

/**
 * PDF 统一操作规则 (2026-10-10): 预览、打印、导出、发送 act on the one file a
 * screen's export produced. `captureDownload` runs the screen's own export
 * and keeps the file its `download()` fetched - saving nothing - so the
 * preview is byte for byte what is then printed, saved or sent.
 *
 * Saving would need `document`, which this test environment does not have:
 * a captured download that tried to save would throw here.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function serve(...bodies: string[]) {
  const queue = [...bodies];
  globalThis.fetch = vi.fn(async () => {
    const body = queue.shift() ?? "";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`材料出场-${body}.pdf`)}`,
      },
    });
  }) as unknown as typeof fetch;
}

describe("captureDownload", () => {
  it("keeps the export's file, with the server's name, instead of saving it", async () => {
    serve("%PDF-one");
    const file = await captureDownload(() =>
      download("/api/material-outgoing/export_records/", { method: "POST", fallbackFilename: "x.pdf", silent: true }),
    );
    expect(file.name).toBe("材料出场-%PDF-one.pdf");
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-one");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("gives each of two captures its own file, in order", async () => {
    serve("A", "B");
    const run = () => download("/api/x/", { fallbackFilename: "x.pdf", silent: true });
    const [first, second] = await Promise.all([captureDownload(run), captureDownload(run)]);
    expect(await first.text()).toBe("A");
    expect(await second.text()).toBe("B");
  });

  it("fails when the export downloads nothing", async () => {
    serve();
    await expect(captureDownload(async () => undefined)).rejects.toThrow(/no file/);
  });

  it("fails when the export fails, and the next capture still works", async () => {
    await expect(
      captureDownload(async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    serve("C");
    const file = await captureDownload(() => download("/api/x/", { fallbackFilename: "x.pdf", silent: true }));
    expect(await file.text()).toBe("C");
  });
});
