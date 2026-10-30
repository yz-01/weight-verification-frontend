/**
 * 10-28 screenshots (polish round) on the worker screens:
 *
 * - 「1990年6月05日」: a Chinese date writes its day as a plain number;
 * - a worker who left: the header said 「最后定位 08:05」 over 「在工地外 ·
 *   12:25」. Outside the fence nothing of where is kept (J25), so 08:05 is
 *   the last time on site - and now says so;
 * - 批量新增人员 at 1440 px: names were cut off. A name wraps in its box,
 *   the boxes keep their widths, and the reasons sit on a line under the row.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { SiteWorkerDetail } from "@/interfaces/site-workers";
import { BULK_FIELDS, blankRows, editRow } from "@/lib/site-workers-bulk";
import messages from "@/messages/zh.json";

const reader: { codes: string[]; search: string } = { codes: ["site_worker.view", "site_worker.manage"], search: "" };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Office", is_field_staff: false },
    can: (code: string) => reader.codes.includes(code),
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(reader.search),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/site-workers/bulk",
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
vi.mock("@/components/shared/location-map", () => ({ LocationMap: () => <div data-map /> }));

const { WorkerDetailDialog } = await import("@/components/site-workers/worker-detail");
const { BulkTable, FIELD_WIDTH, WRAPS } = await import("@/components/site-workers/bulk-table");

function render(node: React.ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of cache) client.setQueryData(key, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const words = messages.siteWorkers;
const bulkWords = words.bulk;

function worker(overrides: Partial<SiteWorkerDetail> = {}): SiteWorkerDetail {
  return {
    id: "w-1",
    project: "p-1",
    project_name: "Tower",
    name: "RAHMAN MD KARIM",
    phone: "",
    passport_no: "A1234567",
    nationality: "BGD",
    date_of_birth: "1990-01-15",
    passport_expiry: "2020-01-01",
    passport_photo_url: "https://files.test/passport.jpg",
    passport_photo_is_pdf: false,
    cidb_no: "",
    supplier: null,
    supplier_name: "",
    company_note: "Kuat",
    company_name: "Kuat",
    trade: null,
    trade_code: "",
    trade_name: "",
    documents: [],
    documents_text: "",
    is_active: true,
    status: "NOT_STARTED",
    last_position_at: null,
    link: {
      status: "NONE",
      last6: "",
      issued_at: null,
      bound_at: null,
      consented_at: null,
      revoked_at: null,
      last_used_at: null,
    },
    created_at: "2026-10-28T01:00:00Z",
    updated_at: "2026-10-28T01:00:00Z",
    visits: [],
    visit_count: 0,
    last_position: null,
    fences: [],
    ...overrides,
  };
}


const longName = "MUHAMMAD ABDUL RAHMAN BIN ABDULLAH SHAH";

describe("worker detail (10-28)", () => {
  it("a Chinese date without a leading zero on the day", () => {
    const html = render(<WorkerDetailDialog workerId="w-1" onClose={() => {}} onAllVisits={() => {}} />, [
      [["site-workers", "detail", "w-1"], worker({ date_of_birth: "1990-06-05" })],
    ]);
    expect(html).toContain("1990年6月5日");
    expect(html).not.toContain("6月05日");
  });

  it("a worker who left: the header names the last time on site, the line below the time off site", () => {
    const html = render(<WorkerDetailDialog workerId="w-1" onClose={() => {}} onAllVisits={() => {}} />, [
      [
        ["site-workers", "detail", "w-1"],
        worker({
          status: "LEFT" as SiteWorkerDetail["status"],
          last_position_at: "2026-10-28T00:05:00Z",
          last_position: {
            received_at: "2026-10-28T04:25:00Z",
            geofence_result: "OUTSIDE",
            latitude: null,
            longitude: null,
            accuracy_m: null,
            geofence_name: "",
            fence_distance_km: null,
          },
        }),
      ],
    ]);
    const header = words.detail.lastInsideAt.replace(" {at}", "");
    expect(header).toBe("最后在工地内的位置");
    expect(html).toContain(header);
    expect(html).toContain("08:05");
    expect(html).toContain("12:25");
    expect(html).not.toContain(words.detail.lastAt.replace(" {at}", ""));
  });

  it("a worker on site keeps 「最后定位」", () => {
    const html = render(<WorkerDetailDialog workerId="w-1" onClose={() => {}} onAllVisits={() => {}} />, [
      [
        ["site-workers", "detail", "w-1"],
        worker({
          last_position_at: "2026-10-28T04:25:00Z",
          last_position: {
            received_at: "2026-10-28T04:25:00Z",
            geofence_result: "INSIDE",
            latitude: "3.1",
            longitude: "101.6",
            accuracy_m: "8",
            geofence_name: "Gate",
            fence_distance_km: null,
          },
        }),
      ],
    ]);
    expect(html).toContain(words.detail.lastAt.replace(" {at}", ""));
    expect(html).not.toContain(words.detail.lastInsideAt.replace(" {at}", ""));
  });
});

describe("批量新增人员 table (10-28, retake at 1440 px)", () => {
  const filled = {
    phone: "+60 11-2390 5678",
    passport_no: "A12345678",
    nationality: "Bangladesh",
    date_of_birth: "15/03/1990",
    passport_expiry: "15/03/2030",
    cidb_no: "CIDB-83012345",
    company_text: "KJ Formwork Enterprise Sdn Bhd",
  } as const;

  function table(problems = {}, extra: Partial<ReturnType<typeof blankRows>[number]> = {}) {
    let row = editRow(blankRows(1)[0], "name", longName);
    for (const [field, value] of Object.entries(filled)) {
      row = editRow(row, field as keyof typeof filled, value);
    }
    const rows = [{ ...row, id: "r-1", ...extra }];
    return render(
      <BulkTable
        rows={rows}
        shown={[0]}
        problems={problems}
        companyPlaceholder="Kuat"
        focus={null}
        onRows={() => {}}
        onFocusDone={() => {}}
        onNeedMoreRows={() => {}}
        onMoveTo={() => {}}
        onRemove={() => {}}
        onCheck={() => {}}
      />,
    );
  }

  function box(html: string, column: number): string {
    const found = html.match(new RegExp(`<(input|textarea)[^>]*data-cell="0-${column}"[^>]*>`));
    expect(found, `box ${column}`).not.toBeNull();
    return found![0];
  }

  it("every box is at least as wide as its longest everyday value", () => {
    const html = table();
    BULK_FIELDS.forEach((field, column) => {
      expect(box(html, column)).toContain(FIELD_WIDTH[field]);
    });
    // A phone, a date and a CIDB number fit on one line at 14 px:
    // 16, 10 and 13 characters. Tailwind's unit is 4 px.
    const px = (field: keyof typeof FIELD_WIDTH) => Number(FIELD_WIDTH[field].replace("min-w-", "")) * 4;
    expect(px("phone")).toBeGreaterThanOrEqual(130);
    expect(px("date_of_birth")).toBeGreaterThanOrEqual(84);
    expect(px("cidb_no")).toBeGreaterThanOrEqual(116);
    expect(px("passport_no")).toBeGreaterThanOrEqual(102);
    // Without 「施工工种」 they fit the page at 1440 px with the menu open
    // (~1130 px). JB91 (10-31) adds that column at the end: the table then
    // runs ~80 px past with the menu open - it scrolls sideways in its box,
    // name kept left - and fits with the menu folded (~1370 px).
    const cells = BULK_FIELDS.reduce((sum, field) => sum + px(field) + 12, 0);
    const withoutTrade = cells - px("trade_text") - 12;
    expect(withoutTrade + 32 + 52 + 60).toBeLessThanOrEqual(1130);
    expect(cells + 32 + 52 + 60).toBeLessThanOrEqual(1370);
  });

  it("the name, the country and the company wrap; the rest stay whole on one line", () => {
    const html = table();
    for (const field of ["name", "nationality", "company_text"] as const) {
      expect(WRAPS.has(field)).toBe(true);
      expect(box(html, BULK_FIELDS.indexOf(field)).startsWith("<textarea")).toBe(true);
    }
    expect(html).toContain(`>${longName}</textarea>`);
    expect(html).toContain(">Bangladesh</textarea>");
    expect(html).toContain(">KJ Formwork Enterprise Sdn Bhd</textarea>");
    for (const field of ["phone", "passport_no", "date_of_birth", "passport_expiry", "cidb_no"] as const) {
      expect(box(html, BULK_FIELDS.indexOf(field)).startsWith("<input")).toBe(true);
    }
    expect(html).toContain(`title="${longName}"`);
  });

  it("if the screen is narrower, the name stays at the left and the bin at the right", () => {
    const html = table();
    const head = html.slice(0, html.indexOf("</thead>"));
    expect(head).toMatch(/<th[^>]*class="[^"]*sticky left-0[^"]*"[^>]*>.*姓名/);
    expect(html).toMatch(/<td[^>]*class="[^"]*sticky left-0[^"]*"[^>]*>(?:(?!<\/td>)[\s\S])*data-cell="0-0"/);
    expect(html).toMatch(/<td data-slot="table-cell" data-pin="end"/);
  });

  it("a passport-photo row stays compact: a small photo, the reasons and 「对着照片补打」 under it", () => {
    const html = table(
      { "r-1": [{ code: "check_photo", values: {} }] },
      { photoUrl: "https://files.test/p1.jpg", photoIsPdf: false, needsCheck: true },
    );
    expect(html).toContain("size-10");
    expect(html).not.toContain("size-16");
    const rows = html.split("<tr ");
    const main = rows.find((row) => row.includes('data-cell="0-0"'))!;
    const under = rows.find((row) => row.includes(bulkWords.problem.check_photo))!;
    expect(main).not.toContain(bulkWords.typeFromPhoto);
    expect(under).toContain(bulkWords.typeFromPhoto);
    // Every box, the photo and the bin (JB91 added 「施工工种」).
    expect(under).toMatch(new RegExp(`colSpan="${BULK_FIELDS.length + 2}"|colspan="${BULK_FIELDS.length + 2}"`));
  });

  it("no 「要处理」 column squeezing the others", () => {
    const html = table({ "r-1": [{ code: "name_has_digits", values: {} }] });
    expect(html).toContain(bulkWords.problem.name_has_digits);
    expect(html.slice(0, html.indexOf("</thead>"))).not.toContain(bulkWords.column.problems);
  });
});
