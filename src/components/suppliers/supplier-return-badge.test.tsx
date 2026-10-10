/**
 * 「有退货资料」 (2026-10 C10; 有退场资料 until 2026-10-10): a supplier with finished returns is flagged in
 * every supplier list and dropdown, and the flag opens those returns.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));

import { supplierOptions } from "@/components/shared/supplier-date-filter";
import {
  SupplierReturnBadge,
  SupplierReturnsTable,
} from "@/components/suppliers/supplier-return-badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["material-units", "all"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const WITH = { id: "s-1", name: "Rebar Supply", completed_return_count: 3 };
const WITHOUT = { id: "s-2", name: "Sand Co", completed_return_count: 0 };

describe("the badge", () => {
  it("shows only for a supplier with finished returns", () => {
    // 「有退货资料」 since 2026-10-10 (Lucas: 「这样容易理解」).
    expect(render(<SupplierReturnBadge supplier={WITH} />)).toContain("有退货资料");
    expect(render(<SupplierReturnBadge supplier={WITH} />)).not.toContain("有退场资料");
    expect(render(<SupplierReturnBadge supplier={WITHOUT} />)).toBe("");
    expect(render(<SupplierReturnBadge supplier={null} />)).toBe("");
  });

  it("is a button that says how many, beside a chosen supplier or in a list", () => {
    const html = render(<SupplierReturnBadge supplier={WITH} />);
    expect(html).toMatch(/^<button/);
    expect(html).toContain("这家供应商有 3 笔已完成的退场，点开查看");
  });

  it("is only a mark inside a dropdown option, where pressing chooses the supplier", () => {
    const html = render(<SupplierReturnBadge supplier={WITH} interactive={false} />);
    expect(html).toMatch(/^<span/);
    expect(html).not.toContain("<button");
  });

  it("marks the supplier in the shared supplier filter's options", () => {
    const options = supplierOptions([WITH, WITHOUT], "全部供应商");
    expect(options.find((row) => row.value === "s-1")?.suffix).toBeTruthy();
    expect(options.find((row) => row.value === "s-2")?.suffix).toBeUndefined();
  });
});

describe("「有退货资料」, in every language (Lucas 2026-10-10)", () => {
  it("names the supplier's mark and the totals' line tag the same way", () => {
    const expected: Array<[typeof zh, string]> = [
      [zh, "有退货资料"],
      [zhTW, "有退貨資料"],
      [en, "Has return records"],
      [ms, "Ada rekod pemulangan"],
    ];
    for (const [catalogue, label] of expected) {
      expect(catalogue.supplierReturns.badge).toBe(label);
      expect(catalogue.receipts.net.returnTag).toBe(label);
    }
    expect(zh.supplierReturns.title).toBe("{name} 的退货资料");
  });
});

describe("the returns it opens", () => {
  const row: MaterialOutgoing = {
    id: "o-1",
    reference_no: "MO-SITE-261007-001",
    project: "p-1",
    project_name: "Site",
    category: "c-1",
    category_name: "钢筋",
    supplier: "s-1",
    supplier_name: "Rebar Supply",
    material_name: "钢筋",
    quantity: "2.000",
    returned_quantity: "1.500",
    unit: "TONNE",
    destination: "Rebar Supply",
    executor_name: "Ah Seng",
    vehicle_plate: "WXY 1234",
    delivery_note_no: "DO-778",
    reason: "Surplus after the slab",
    status: "COMPLETED",
    captured_at: "2026-10-07T02:00:00Z",
    processed_at: "2026-10-07T05:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by_name: "Ah Seng",
    approved_by_name: "Site Office",
    approved_at: "2026-10-07T03:00:00Z",
    review_note: "",
    site_signature: "https://files.test/site.png",
    supplier_signature: "https://files.test/driver.png",
    approver_signature: "https://files.test/approver.png",
    approver_name: "Mr Tan",
    has_return_note: true,
    return_note_no: "RN-SITE-261007-001",
    return_note_at: "2026-10-07T03:00:00Z",
    photos: [
      { id: "p-1", stage: "PROCESSING", image: "https://files.test/a.jpg", watermarked: "https://files.test/a-w.jpg", caption: "", captured_at: "2026-10-07T05:00:00Z" },
    ],
  };

  it("lists date, material, quantity, plate, reason, Return Note, photos, both signatures and the approval", () => {
    const html = render(<SupplierReturnsTable rows={[row]} />);
    for (const heading of ["日期", "材料", "数量", "车牌", "退回原因", "Return Note", "照片", "双方签名", "批准资料"]) {
      expect(html).toContain(heading);
    }
    for (const text of ["WXY 1234", "Surplus after the slab", "RN-SITE-261007-001", "Site Office", "Mr Tan", "1.500"]) {
      expect(html).toContain(text);
    }
    // The stamped photograph, both signatures and the approver's.
    expect(html).toContain("a-w.jpg");
    expect(html).toContain("site.png");
    expect(html).toContain("driver.png");
    expect(html).toContain("approver.png");
    // Each row opens its record over the list (图8 → 图9): no link that
    // takes the reader to the 材料出场 page.
    expect(html).not.toContain("/material-outgoing?record=o-1");
    expect(html).not.toContain("<a href=\"/material-outgoing");
    expect(html).toContain('data-slot="supplier-return-row"');
    expect(html).toContain('aria-label="查看 MO-SITE-261007-001 的完整记录"');
    // Nothing is open until a row is pressed.
    expect(html).not.toContain("MO-SITE-261007-001</h2>");
  });

  it("opens the pressed return in 材料出场's own record popup, on top of the list", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/suppliers/supplier-return-badge.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(source).toMatch(/onOpen=\{\(\) => setOpened\(row\.id\)\}/);
    expect(source).toMatch(/<OutgoingDecision id=\{opened\} onClose=\{\(\) => setOpened\(null\)\} \/>/);
    expect(source).not.toMatch(/<Link/);
    // A press on a photograph or a signature is for the picture, not the row.
    expect(source).toMatch(/<TableCell onClick=\{ownPress\}>[\s\S]{0,200}<PhotoThumb/);
    expect(source).toMatch(/onClick=\{ownPress\}[\s\S]{0,120}title=\{label\}/);
  });
});
