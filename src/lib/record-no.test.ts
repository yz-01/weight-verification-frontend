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

  it("leaves an unreadable old number alone", () => {
    for (const value of ["RC-Q-1", "DOC-0001", "EQ-Q", "12345", "Tower crane", "P-NORTH-"]) {
      expect(parseRecordNo(value, "P-NORTH")).toBeNull();
    }
    expect(parseRecordNo("")).toBeNull();
    expect(parseRecordNo(null)).toBeNull();
    expect(parseRecordNo(undefined)).toBeNull();
  });
});
