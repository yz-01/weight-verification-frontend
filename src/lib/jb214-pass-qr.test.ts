/**
 * 二维码打印大小 works (JB214-3b, Lucas 11-16 「把它们真的做出来」): the pass QR
 * is drawn and downloaded at the company's size - 小型 160, 标准 220 (as
 * before), 大字打印 440 - and the 大字打印 PNG carries the pass number under
 * the code.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PASS_QR_SIZES, passQrPng, passQrSize } from "@/lib/pass-qr";
import { parseRecordNo } from "@/lib/record-no";

// The runner has no DOM: the one call the PNG makes, a new canvas, is stood in for.
const createElement = vi.fn();
vi.stubGlobal("document", { createElement });
afterEach(() => createElement.mockReset());

describe("pass QR size (JB214-3b)", () => {
  it("follows the company's 二维码打印大小; 标准 when the pass does not say", () => {
    expect(passQrSize({ qr_print_size: "COMPACT" })).toBe(160);
    expect(passQrSize({ qr_print_size: "STANDARD" })).toBe(220);
    expect(passQrSize({ qr_print_size: "LARGE" })).toBe(440);
    expect(passQrSize({})).toBe(PASS_QR_SIZES.STANDARD);
  });

  it("downloads 标准 and 小型 as the code alone, as before", () => {
    const qr = { width: 220, height: 220, toDataURL: vi.fn(() => "data:qr") } as unknown as HTMLCanvasElement;
    expect(passQrPng(qr, { pass_no: "PS-PRJ-0001-001", qr_print_size: "STANDARD" })).toBe("data:qr");
    expect(passQrPng(qr, { pass_no: "PS-PRJ-0001-001", qr_print_size: "COMPACT" })).toBe("data:qr");
    expect(passQrPng(qr, { pass_no: "PS-PRJ-0001-001" })).toBe("data:qr");
    expect(createElement).not.toHaveBeenCalled();
  });

  it("prints the pass number under a 大字打印 code", () => {
    const drawn: string[] = [];
    const context = {
      fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn((text: string) => drawn.push(text)),
      fillStyle: "", textAlign: "", textBaseline: "", font: "",
    };
    const card = { width: 0, height: 0, getContext: () => context, toDataURL: () => "data:card" };
    createElement.mockReturnValue(card);
    const qr = { width: 440, height: 440, toDataURL: () => "data:qr" } as unknown as HTMLCanvasElement;

    const png = passQrPng(qr, { pass_no: "KL-PRJ-0001-007", qr_print_size: "LARGE" });

    expect(png).toBe("data:card");
    expect(drawn).toEqual(["KL-PRJ-0001-007"]);
    expect(card.width).toBe(440);
    expect(card.height).toBeGreaterThan(440);
    expect(context.drawImage).toHaveBeenCalledWith(qr, 0, 0);
  });

  it("is what the pass dialog draws and downloads", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/site-access/site-access-workspace.tsx"), "utf8");
    expect(source).toContain("const size = passQrSize(row);");
    expect(source).toContain("size={size}");
    expect(source).toContain("link.href = passQrPng(canvas, row);");
    expect(source).not.toContain("size={220}");
  });
});

describe("a company prefix in the lists (JB214-3a)", () => {
  it("splits a pass number of any 2 to 6 letters as it splits PS", () => {
    expect(parseRecordNo("PS-PRJ-0001-001", "PRJ-0001")).toEqual({ short: "PS-001", projectCode: "PRJ-0001" });
    expect(parseRecordNo("KL-PRJ-0001-007", "PRJ-0001")).toEqual({ short: "KL-007", projectCode: "PRJ-0001" });
    expect(parseRecordNo("ABCDEF-SITE-A-012", "SITE-A")).toEqual({ short: "ABCDEF-012", projectCode: "SITE-A" });
  });
});
