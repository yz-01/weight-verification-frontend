import { describe, expect, it } from "vitest";

import { offersOutgoingExit, onFieldApp } from "@/lib/outgoing-exit";

describe("实际退场 is recorded on the phone only (2026-10-09)", () => {
  it("knows the field app from the office console", () => {
    expect(onFieldApp("/field-staff")).toBe(true);
    expect(onFieldApp("/field-staff/records")).toBe(true);
    expect(onFieldApp("/material-outgoing")).toBe(false);
    expect(onFieldApp("/receipts")).toBe(false);
    expect(onFieldApp("/")).toBe(false);
    expect(onFieldApp("/field-staffing")).toBe(false);
    expect(onFieldApp(null)).toBe(false);
    expect(onFieldApp(undefined)).toBe(false);
  });

  it("offers the step on the phone for an approved return the account may submit", () => {
    expect(offersOutgoingExit({ pathname: "/field-staff", status: "APPROVED", canSubmit: true })).toBe(true);
  });

  it("never offers it in the office, whatever the account may do", () => {
    for (const pathname of ["/material-outgoing", "/receipts", "/dashboard", "/"]) {
      expect(offersOutgoingExit({ pathname, status: "APPROVED", canSubmit: true })).toBe(false);
    }
  });

  it("offers it only while the return waits for the lorry, and only to who may submit", () => {
    for (const status of ["PENDING", "PROCESSED", "COMPLETED", "REJECTED"]) {
      expect(offersOutgoingExit({ pathname: "/field-staff", status, canSubmit: true })).toBe(false);
    }
    expect(offersOutgoingExit({ pathname: "/field-staff", status: "APPROVED", canSubmit: false })).toBe(false);
  });
});
