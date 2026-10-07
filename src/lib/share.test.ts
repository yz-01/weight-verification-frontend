/**
 * 「分享」 (2026-10 C11): the file where the phone can share files, the link
 * where it can only share links, the link copied where there is no share
 * sheet at all.
 */
import { describe, expect, it, vi } from "vitest";

import { shareOrCopy } from "@/lib/share";

const FILE = new File(["%PDF"], "MO-1.pdf", { type: "application/pdf" });
const LINK = "https://app.test/material-outgoing?record=o-1";

describe("shareOrCopy", () => {
  it("shares the file itself when the phone can", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const outcome = await shareOrCopy(
      { title: "MO-1", url: LINK, file: FILE },
      { share, canShare: () => true },
    );
    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "MO-1", files: [FILE] });
  });

  it("shares the link when files cannot be shared", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const outcome = await shareOrCopy(
      { title: "MO-1", url: LINK, file: FILE },
      { share, canShare: () => false },
    );
    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "MO-1", url: LINK });
  });

  it("copies the link where there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const outcome = await shareOrCopy({ title: "MO-1", url: LINK, file: FILE }, { clipboard: { writeText } });
    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("falls back to copying when the share sheet refuses", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no gesture", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const outcome = await shareOrCopy(
      { title: "MO-1", url: LINK, file: FILE },
      { share, canShare: () => true, clipboard: { writeText } },
    );
    expect(outcome).toBe("copied");
  });

  it("does nothing more when the person closes the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    const writeText = vi.fn();
    const outcome = await shareOrCopy(
      { title: "MO-1", url: LINK },
      { share, clipboard: { writeText } },
    );
    expect(outcome).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("says it failed when nothing can be done", async () => {
    expect(await shareOrCopy({ title: "MO-1", url: LINK }, {})).toBe("failed");
  });
});
