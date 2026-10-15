import { describe, expect, it } from "vitest";

import {
  isValidTargetQuantity,
  parseTargetAlerts,
  projectTargetsLink,
  targetBar,
  targetRecordLinks,
  targetTone,
} from "@/lib/material-targets";

/** I18 (ID39-ID42): what the 材料目标 screen draws and where it leads. */

describe("the progress bar", () => {
  it("fills to the percent and stops at full past 100", () => {
    expect(targetBar({ percent: 52, status: "NORMAL" })).toEqual({ width: 52, tone: "bg-primary" });
    expect(targetBar({ percent: 130, status: "EXCEEDED" })).toEqual({ width: 100, tone: "bg-destructive" });
    expect(targetBar({ percent: null, status: "NORMAL" }).width).toBe(0);
  });

  it("colours near, reached and over apart", () => {
    expect(targetBar({ percent: 85, status: "APPROACHING" }).tone).toBe("bg-warning");
    expect(targetBar({ percent: 100, status: "REACHED" }).tone).toBe("bg-success");
    expect(targetTone("EXCEEDED")).toBe("danger");
    expect(targetTone("REACHED")).toBe("positive");
    expect(targetTone("APPROACHING")).toBe("warning");
    expect(targetTone("NORMAL")).toBe("neutral");
  });
});

describe("the alert lines (ID41)", () => {
  it("reads whole percentages 1-100, sorted, once each", () => {
    expect(parseTargetAlerts("100, 80, 80")).toEqual([80, 100]);
    expect(parseTargetAlerts("90，100")).toEqual([90, 100]);
    expect(parseTargetAlerts("")).toEqual([]);
  });

  it("refuses what it cannot read", () => {
    expect(parseTargetAlerts("80, ninety")).toBeNull();
    expect(parseTargetAlerts("120")).toBeNull();
    expect(parseTargetAlerts("0")).toBeNull();
    expect(parseTargetAlerts("80.5")).toBeNull();
  });
});

describe("the target figure", () => {
  it("is above zero with up to three decimals", () => {
    expect(isValidTargetQuantity("100")).toBe(true);
    expect(isValidTargetQuantity("12.125")).toBe(true);
    expect(isValidTargetQuantity("1.0005")).toBe(false);
    expect(isValidTargetQuantity("0")).toBe(false);
    expect(isValidTargetQuantity("-3")).toBe(false);
  });
});

describe("from a target to its records (ID42)", () => {
  it("opens the deliveries and the confirmed returns, filtered to the spec", () => {
    expect(targetRecordLinks({ project: "p", category: "c", spec_category: "s" })).toEqual({
      deliveries: "/receipts?project=p&category=c&spec_category=s",
      returns: "/material-outgoing?project=p&category=c&spec_category=s&status=COMPLETED",
    });
  });

  it("leaves the spec out for a whole-material target", () => {
    expect(targetRecordLinks({ project: "p", category: "c", spec_category: null }).deliveries).toBe(
      "/receipts?project=p&category=c",
    );
  });

  it("lands head office on the project's targets", () => {
    expect(projectTargetsLink("p 1")).toBe("/material-targets?project=p%201");
  });
});
