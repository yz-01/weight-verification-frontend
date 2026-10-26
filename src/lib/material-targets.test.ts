import { describe, expect, it } from "vitest";

import {
  isValidTargetQuantity,
  parseTargetAlerts,
  projectTargetsLink,
  targetAfterAdding,
  targetBar,
  targetRecordLinks,
  targetTone,
  trancheLines,
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

/** JB26 (客户 10-26 事项 2): 「新目标显示在旧目标下一行，用不同颜色区分」. */
describe("a raised target's lines", () => {
  const tranche = (kind: "ORIGINAL" | "ADDED", quantity: string, percent: number | null) => ({
    kind,
    quantity,
    cumulative_target: quantity,
    filled: "0.000",
    remaining: quantity,
    percent,
    created_at: "2026-10-26T09:00:00+08:00",
    actor_name: "qs",
  });

  it("draws nothing under a target never raised", () => {
    expect(trancheLines({ tranches: [tranche("ORIGINAL", "100.000", 30)] })).toEqual([]);
    expect(trancheLines({ tranches: [] })).toEqual([]);
  });

  it("gives the original the page's colour and each addition its own", () => {
    const lines = trancheLines({
      tranches: [tranche("ORIGINAL", "100.000", 100), tranche("ADDED", "200.000", 140), tranche("ADDED", "50.000", 0)],
    });
    expect(lines.map((line) => line.index)).toEqual([0, 1, 2]);
    expect(lines[0].bar).toBe("bg-primary");
    expect(new Set(lines.map((line) => line.bar)).size).toBe(3);
    expect(new Set(lines.map((line) => line.row)).size).toBe(3);
    // The bar stops at full.
    expect(lines.map((line) => line.width)).toEqual([100, 100, 0]);
  });
});

describe("the target after an addition", () => {
  it("adds in thousandths", () => {
    expect(targetAfterAdding("100.000", "200")).toBe("300.000");
    expect(targetAfterAdding("0.100", "0.2")).toBe("0.300");
  });

  it("is nothing for an amount the server refuses", () => {
    for (const bad of ["", "0", "-5", "1.0005", "lots"]) {
      expect(targetAfterAdding("100.000", bad), bad).toBeNull();
    }
  });
});
