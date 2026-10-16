import { describe, expect, it } from "vitest";

import { parseRecordNo } from "@/lib/record-no";

describe("parseRecordNo (2026-10 D4, Q12)", () => {
  it("reads a daily number as prefix and sequence, project small", () => {
    expect(parseRecordNo("MR-builder-001-261005-002")).toEqual({
      short: "MR-002",
      projectCode: "builder-001",
    });
    expect(parseRecordNo("RC-TRX-P1-260723-004")).toEqual({
      short: "RC-004",
      projectCode: "TRX-P1",
    });
  });

  it("reads every module's prefix the same way", () => {
    for (const prefix of ["RC", "MO", "MR", "EQ", "SI", "PM", "DISP", "WO"]) {
      expect(parseRecordNo(`${prefix}-P-NORTH-261005-017`)?.short).toBe(`${prefix}-017`);
    }
  });

  it("keeps a sequence past 999 whole", () => {
    expect(parseRecordNo("RC-P1-261005-1204")?.short).toBe("RC-1204");
  });

  it("reads a claim's monthly number", () => {
    expect(parseRecordNo("CLM-P-NORTH-2610-03")).toEqual({
      short: "CLM-03",
      projectCode: "P-NORTH",
    });
  });

  it("prefers the project code it is given", () => {
    expect(parseRecordNo("MR-builder-001-261005-002", "BUILDER")?.projectCode).toBe("BUILDER");
  });

  it("shows the rest of a number that starts with the project code", () => {
    expect(parseRecordNo("P-NORTH-ME-RFI-0001", "P-NORTH")).toEqual({
      short: "ME-RFI-0001",
      projectCode: "P-NORTH",
    });
    expect(parseRecordNo("P-NORTH-ME-RFI-0001/R1", "P-NORTH")?.short).toBe("ME-RFI-0001/R1");
  });

  it("reads a running record number (I6, ID21)", () => {
    expect(parseRecordNo("MI-TRX-P1-004")).toEqual({ short: "MI-004", projectCode: "TRX-P1" });
    expect(parseRecordNo("GT-SITE-A-012")?.short).toBe("GT-012");
    expect(parseRecordNo("MI-P1-1204")?.short).toBe("MI-1204");
  });

  it("splits by the project code it is given, even one ending in digits (ID35)", () => {
    expect(parseRecordNo("MI-P-261005-001", "P-261005")).toEqual({
      short: "MI-001",
      projectCode: "P-261005",
    });
    expect(parseRecordNo("PS-builder-001-007", "builder-001")).toEqual({
      short: "PS-007",
      projectCode: "builder-001",
    });
    expect(parseRecordNo("RC-builder-001-261005-002", "builder-001")?.short).toBe("RC-002");
    expect(parseRecordNo("CLM-P-NORTH-2610-03", "P-NORTH")?.short).toBe("CLM-03");
  });

  it("leaves an unreadable old number alone", () => {
    for (const value of ["RC-Q-1", "DOC-0001", "EQ-Q", "12345", "Tower crane", "P-NORTH-"]) {
      expect(parseRecordNo(value, "P-NORTH")).toBeNull();
    }
    expect(parseRecordNo("")).toBeNull();
    expect(parseRecordNo(null)).toBeNull();
    expect(parseRecordNo(undefined)).toBeNull();
  });
});
