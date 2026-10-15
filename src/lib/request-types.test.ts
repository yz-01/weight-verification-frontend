import { describe, expect, it } from "vitest";

import {
  REQUEST_ATTACHMENT_ACCEPT,
  isAllowedRequestAttachment,
  isValidRequestQuantity,
} from "@/interfaces/material-request";
import { newTypeName, requestTypeNameOptions } from "@/lib/request-types";

/** I16 (ID36, ID37, ID49) and I19 (ID47): the MR rules the screens share. */

describe("the list's type filter across projects (ID37)", () => {
  it("offers each name once, in the projects' order", () => {
    const rows = [
      { name: "材料申请", sort_order: 0 },
      { name: "设备申请", sort_order: 1 },
      { name: "材料申请", sort_order: 0 },
      { name: "人员申请", sort_order: 5 },
      { name: "设备申请", sort_order: 1 },
      { name: "其他申请", sort_order: 4 },
    ];
    expect(requestTypeNameOptions(rows).map((row) => row.value)).toEqual([
      "材料申请",
      "设备申请",
      "其他申请",
      "人员申请",
    ]);
  });
});

describe("a new type's name", () => {
  it("is trimmed and said to be taken when the project has it", () => {
    expect(newTypeName("  人员申请 ", [{ name: "材料申请" }])).toEqual({ name: "人员申请", taken: false });
    expect(newTypeName("设备申请", [{ name: "设备申请" }]).taken).toBe(true);
    expect(newTypeName("", []).taken).toBe(false);
  });
});

describe("what a request may carry (ID49)", () => {
  it("takes pictures, PDF, Office files, CSV / TXT, DWG and ZIP", () => {
    for (const name of ["a.JPG", "b.pdf", "c.docx", "d.xlsx", "e.pptx", "f.csv", "g.txt", "h.dwg", "i.zip", "j.heic"]) {
      expect(isAllowedRequestAttachment(name), name).toBe(true);
    }
  });

  it("refuses everything else, and a name with no extension", () => {
    for (const name of ["setup.exe", "script.js", "page.html", "noextension"]) {
      expect(isAllowedRequestAttachment(name), name).toBe(false);
    }
  });

  it("offers the same list to the file picker", () => {
    expect(REQUEST_ATTACHMENT_ACCEPT).toContain(".dwg");
    expect(REQUEST_ATTACHMENT_ACCEPT).not.toContain(".exe");
  });
});

describe("the quantity (ID47)", () => {
  it("has up to three decimals, as a delivery", () => {
    expect(isValidRequestQuantity("12.125")).toBe(true);
    expect(isValidRequestQuantity("1,250.5")).toBe(true);
    expect(isValidRequestQuantity("1.0005")).toBe(false);
    expect(isValidRequestQuantity("0")).toBe(false);
  });
});
