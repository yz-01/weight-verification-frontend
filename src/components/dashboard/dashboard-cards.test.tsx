/**
 * B8 / F6 / F7: the project dashboard's first screen is six small cards, and
 * the sections under them start closed and do not repeat the cards' numbers.
 *
 * Rendered to static markup (the runner has no DOM). The hover / tap pop-up
 * is a browser behaviour and is checked by eye (PENDING in the report); what
 * is pinned here is what the reader sees before touching anything.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ContractorDashboard } from "@/interfaces/contractor-dashboard";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard/project",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: () => true }),
}));
// Their dialogs are not under test, and both pull in every module's detail.
vi.mock("@/components/dashboard/approval-opener", () => ({
  useApprovalOpener: () => ({ open: () => {}, element: null }),
}));
vi.mock("@/components/shared/record-opener", () => ({
  useRecordOpener: () => ({ open: () => true, sheet: null }),
}));

const { DashboardCards } = await import("@/components/dashboard/dashboard-cards");
const { DashboardSection } = await import("@/components/dashboard/dashboard-section");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const payload = {
  date: "2026-10-07",
  project: "",
  sections: [],
  generated_at: "2026-10-07T03:00:00Z",
  overview: {
    today: { material_receipts: 4, attendance_events: 3, safety_incidents: 2 },
  },
  approvals: { rows: [], total: 3, mine: 0, unassigned: 3 },
  unread: { total: 4, by_kind: {}, rows: [], receipts: 4, approvals: 3 },
  rectifications: { rows: [], total: 2, overdue: 0 },
} as unknown as ContractorDashboard;

describe("the six dashboard cards (B8, F6)", () => {
  const html = render(
    <DashboardCards
      data={payload}
      unread={payload.unread}
      rectifications={payload.rectifications}
      project=""
    />,
  );

  it("shows the six the client named, in order, name and number together", () => {
    const cards = [...html.matchAll(/data-dashboard-card="([a-z]+)"/g)].map((m) => m[1]);
    expect(cards).toEqual([
      "waiting",
      "approvals",
      "rectifications",
      "receipts",
      "attendance",
      "safety",
    ]);
    for (const label of [
      "等你处理",
      "待审批事项",
      "待处理整改 / EHS",
      "今日材料到场",
      "今日进出打卡",
      "安全事件",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("never cuts a card's name short", () => {
    expect(html).not.toMatch(/truncate|line-clamp/);
  });

  it("is one row on a wide screen and 2 × 3 on a phone", () => {
    expect(html).toMatch(/grid grid-cols-2 [^"]*lg:grid-cols-6/);
  });
});

describe("the sections under the cards (F7)", () => {
  it("start closed: a title to open, and no body", () => {
    const html = render(
      <DashboardSection id="safety" title="安全巡检与整改">
        <p data-body />
      </DashboardSection>,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("安全巡检与整改");
    expect(html).not.toContain("data-body");
  });

  const source = readFileSync(
    path.join(process.cwd(), "src/components/dashboard/contractor-dashboard.tsx"),
    "utf8",
  );

  it("no longer has the three big lists the cards replaced", () => {
    for (const id of ["dashboard-unread", "dashboard-approvals", "dashboard-rectifications"]) {
      expect(source).not.toContain(id);
    }
    expect(source).not.toMatch(/function (Block|ShortList|PriorityCount)\(/);
  });

  it("does not repeat a number that is already on a card", () => {
    // 今日材料到场, 今日进出打卡, 安全事件 - and 今日巡检, the same count as 安全事件.
    for (const key of [
      'label={t("overview.materialReceipts")}',
      'label={t("overview.attendance")}',
      'label={t("overview.safety")}',
      '"today_inspections"',
    ]) {
      expect(source).not.toContain(key);
    }
  });

  it("人员进出 lists projects only when there are two (audit #18)", () => {
    // One project's line is the 今日进出打卡 card's number again; the server
    // sends no breakdown then, so "nobody clocked in" is read from the people.
    expect(source).not.toContain("personnel.by_project.length === 0");
    expect(source).toContain("personnel.unique_workers === 0");
    expect(source).toContain("personnel.by_project.length > 1");
  });

  it("puts every section under the cards in a DashboardSection", () => {
    for (const id of [
      "overview",
      "safety",
      "schedule",
      "map",
      "activity",
      "personnel",
      "notifications",
      "timeline",
      "quick-actions",
    ]) {
      expect(source).toMatch(new RegExp(`<DashboardSection\\s+id="${id}"`));
    }
  });
});
