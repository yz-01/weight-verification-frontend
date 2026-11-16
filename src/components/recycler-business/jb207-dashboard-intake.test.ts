import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRouteAllowed } from "@/lib/navigation";

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("JB207-8: the dashboard's 待派车 row", () => {
  const dashboard = read("src/components/recycler-business/recycler-dashboard.tsx");

  it("opens 废料订单 on 已接单, where those orders and their 派车 are", () => {
    const row = dashboard.slice(dashboard.indexOf('key: "dispatch"'), dashboard.indexOf('key: "deduction"'));
    expect(row).toContain('href: "/waste-orders?state=ACCEPTED"');
    expect(row).not.toContain('href: "/tasks"');
    expect(isRouteAllowed("MSE_SCRAP", ["waste_orders"], "/waste-orders")).toBe(true);
  });

  it("does the same on the 今日 card with that count (the sibling)", () => {
    const at = dashboard.indexOf("value={number(data.business_today.pending_dispatch)}");
    expect(at).toBeGreaterThan(-1);
    const card = dashboard.slice(dashboard.lastIndexOf("<MetricCard", at), dashboard.indexOf("/>", at));
    expect(card).toContain('href="/waste-orders?state=ACCEPTED"');
    expect(card).not.toContain('href="/tasks"');
  });
});

describe("JB207-10: 私人入库 完成 lists only confirmed tickets", () => {
  const workspace = read("src/components/recycler-business/recycler-customers-workspace.tsx");
  const dialog = workspace.slice(workspace.indexOf("function CompleteIntakeDialog"));

  it("asks the server for confirmed tickets and keeps only those", () => {
    expect(dialog).toMatch(/getWeighSessions\(\{[^}]*ticket_status: "CONFIRMED"/);
    expect(dialog).toContain('row.ticket_status === "CONFIRMED"');
  });

  it("says why one is missing and what to do", () => {
    expect(dialog).toContain('hint={t("intakes.confirmedOnly")}');
    const zh = JSON.parse(read("src/messages/zh.json"));
    expect(zh.recyclerBusiness.intakes.confirmedOnly).toContain(zh.weighing.action.confirm);
  });
});
