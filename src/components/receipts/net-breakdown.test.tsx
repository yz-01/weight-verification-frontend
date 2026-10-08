/**
 * What a 累计净数量 number opens (client request 2026-10-09).
 *
 * 「点击『累计进场』：查看每一笔材料进场记录、数量、DO、照片及供应商」;
 * 「点击『已退场』：查看每一笔已完成退场的记录，包括 Return Note、审批、照片
 * 及签名」; 「点击『累计净数量』：查看进场与退场的数量明细」. Each row opens
 * the record's own popup, where the office can act.
 *
 * Rendered to static markup (the runner has no DOM), with the dialog drawn
 * inline so what it lists can be read.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import zh from "@/messages/zh.json";
import {
  netLineKey,
  type MaterialNetBreakdown,
  type MaterialNetBreakdownItem,
  type MaterialNetTotalRow,
} from "@/services/contractor.service";

const reader = { codes: ["receipt.view", "material_outgoing.view"] };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: (code: string) => reader.codes.includes(code) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/receipts",
  useRouter: () => ({ push: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams("view=totals"),
}));
vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open = true, children }: { open?: boolean; children?: React.ReactNode }) =>
      open ? <div data-dialog>{children}</div> : null,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});
// The records' own popups: each has its own tests; here only that they are the ones opened.
vi.mock("@/components/receipts/view-receipt", () => ({
  ViewReceipt: ({ id }: { id: string }) => <div data-opened-receipt={id} />,
}));
vi.mock("@/components/dashboard/approval-opener", () => ({
  OutgoingDecision: ({ id }: { id: string }) => <div data-opened-outgoing={id} />,
}));

const { NetBreakdownDialog } = await import("@/components/receipts/net-breakdown");

const ROW: MaterialNetTotalRow = {
  project: "p-1",
  project_name: "builder-001",
  supplier: "s-1",
  supplier_name: "star marketing",
  supplier_return_count: 2,
  material_name: "Sdf",
  material_specification: "",
  unit: "PIECE",
  received: "301.000",
  rejected: "4.000",
  returned: "25.000",
  net: "276.000",
  deliveries: 2,
  return_count: 2,
};

function item(overrides: Partial<MaterialNetBreakdownItem>): MaterialNetBreakdownItem {
  return {
    kind: "DELIVERY",
    id: "r-1",
    reference: "RC-1",
    date: "2026-10-01T02:00:00Z",
    quantity: "1.000",
    unit: "PIECE",
    delivery_note_no: "",
    vehicle_plate: "",
    supplier_name: "star marketing",
    manufacturer_name: "",
    return_note_no: "",
    project_name: "builder-001",
    cover_photo_url: null,
    photo_count: 0,
    ...overrides,
  };
}

function outgoing(overrides: Partial<MaterialOutgoing>): MaterialOutgoing {
  return {
    id: "o-1",
    reference_no: "MO-1",
    project: "p-1",
    project_name: "builder-001",
    material_name: "Sdf",
    quantity: "20.000",
    returned_quantity: "20.000",
    unit: "PIECE",
    destination: "",
    executor_name: "Ah Seng",
    vehicle_plate: "WXY 1",
    delivery_note_no: "",
    reason: "Wrong size",
    status: "COMPLETED",
    captured_at: "2026-10-05T02:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by_name: "Ah Seng",
    approved_by_name: "Mr Lim",
    approved_at: "2026-10-04T02:00:00Z",
    review_note: "",
    completed_by_name: "Office Tan",
    completed_at: "2026-10-06T02:00:00Z",
    site_signature: "https://files.test/site.png",
    supplier_signature: "https://files.test/driver.png",
    photos: [
      { id: "ph-1", image: "https://files.test/raw.jpg", watermarked: "https://files.test/stamped.jpg", caption: "", captured_at: "2026-10-05T02:00:00Z" },
    ],
    ...overrides,
  } as MaterialOutgoing;
}

const DATA: MaterialNetBreakdown = {
  line: ROW,
  deliveries: [
    item({ id: "r-1", reference: "RC-1", quantity: "300.000", delivery_note_no: "DO-301", cover_photo_url: "https://files.test/thumb-1.jpg", photo_count: 3 }),
    item({ id: "r-2", reference: "RC-2", quantity: "1.000", delivery_note_no: "DO-302" }),
  ],
  rejected: [item({ kind: "REJECTED", id: "r-9", reference: "RC-9", quantity: "4.000", delivery_note_no: "DO-BAD" })],
  returns: [
    item({
      kind: "RETURN", id: "o-1", reference: "MO-1", quantity: "20.000", return_note_no: "RN-001",
      outgoing: outgoing({}), cover_photo_url: "https://files.test/thumb-o1.jpg", photo_count: 1,
    }),
    item({
      kind: "RETURN", id: "o-2", reference: "MO-2", quantity: "5.000", return_note_no: "RN-002",
      outgoing: outgoing({ id: "o-2", reference_no: "MO-2", reason: "Damaged", approved_by_name: "Ms Wong" }),
    }),
  ],
};

const QUERY = { project: "p-1", supplier: "s-1", date_from: "2026-10-01" };

function render(focus: "received" | "returned" | "net", data: MaterialNetBreakdown | null = DATA) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["material-units", "all"], []);
  if (data) qc.setQueryData(["receipts", "net-breakdown", QUERY, netLineKey(ROW)], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <NetBreakdownDialog row={ROW} query={QUERY} focus={focus} onClose={() => {}} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rows = (html: string, kind: string) =>
  html.match(new RegExp(`<li[^>]*data-slot="net-breakdown-row"[^>]*data-kind="${kind}"`, "g")) ?? [];

describe("「累计进场」 opens every delivery behind it", () => {
  it("lists each delivery with its DO, quantity, photograph, supplier and project, and the subtotal is the number pressed", () => {
    const html = render("received");
    expect(rows(html, "DELIVERY")).toHaveLength(2);
    for (const text of ["RC-1", "DO-301", "RC-2", "DO-302", "300.000", "star marketing", "builder-001"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("每一笔进场（2 笔）");
    expect(html).toContain("301.000");
    // The photograph, three of them behind it.
    expect(html).toContain("thumb-1.jpg");
    // No returns on this tab.
    expect(html).not.toContain("RN-001");
  });

  it("shows a rejected load apart, as not counted", () => {
    const html = render("received");
    expect(html).toContain("不合格，不计入累计进场（1 笔）");
    expect(rows(html, "REJECTED")).toHaveLength(1);
  });

  it("opens each delivery's own record", () => {
    const html = render("received");
    expect(html).toContain('aria-label="打开 RC-1"');
    // Opened in place, not by leaving the totals.
    expect(html).not.toContain('href="/receipts/r-1"');
  });
});

describe("「已退场」 opens every completed return behind it", () => {
  it("says why it went back, who approved it and when, with Return Note, photographs and signatures", () => {
    const html = render("returned");
    expect(rows(html, "RETURN")).toHaveLength(2);
    for (const text of ["RN-001", "RN-002", "Wrong size", "Damaged", "Mr Lim", "Ms Wong", "Office Tan", "−20.000", "−5.000"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("每一笔已完成退场（2 笔）");
    expect(html).toContain("25.000");
    expect(html).toContain("thumb-o1.jpg");
    expect(html).toContain("site.png");
    expect(html).toContain("driver.png");
    // No deliveries on this tab.
    expect(html).not.toContain("DO-301");
  });

  it("opens a return in 材料出场's own detail for whoever may read it, and as text for anyone else", () => {
    expect(render("returned")).toContain('aria-label="打开 MO-1"');
    reader.codes = ["receipt.view"];
    try {
      const html = render("returned");
      expect(html).not.toContain('aria-label="打开 MO-1"');
      expect(html).toContain("RN-001");
    } finally {
      reader.codes = ["receipt.view", "material_outgoing.view"];
    }
  });
});

describe("「累计净数量」 opens the sum", () => {
  it("shows 进场合计 − 已完成退场合计 = 累计净数量 with both lists under it", () => {
    const html = render("net");
    const sum = html.slice(html.indexOf('data-slot="net-sum"'));
    expect(sum.indexOf("进场合计")).toBeLessThan(sum.indexOf("已完成退场合计"));
    expect(sum).toMatch(/进场合计[\s\S]*301\.000[\s\S]*−[\s\S]*已完成退场合计[\s\S]*25\.000[\s\S]*=[\s\S]*累计净数量[\s\S]*276\.000/);
    expect(rows(html, "DELIVERY")).toHaveLength(2);
    expect(rows(html, "RETURN")).toHaveLength(2);
  });

  it("says so when the line is no longer in the filters", () => {
    const html = render("net", { line: null, deliveries: [], rejected: [], returns: [] });
    expect(html).toContain("这一行已不在目前的筛选里。");
  });

  it("has a tab for each of the three numbers", () => {
    const html = render("net");
    for (const text of ["累计进场", "已退场", "累计净数量"]) expect(html).toContain(text);
  });
});
