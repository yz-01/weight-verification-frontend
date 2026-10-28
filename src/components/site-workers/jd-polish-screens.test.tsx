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
import { blankRows, editRow } from "@/lib/site-workers-bulk";
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
const { BulkTable } = await import("@/components/site-workers/bulk-table");

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

describe("批量新增人员 table (10-28)", () => {
  function table(problems = {}) {
    const rows = [{ ...editRow(blankRows(1)[0], "name", longName), id: "r-1" }];
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

  it("the name wraps in its box, whole, and the passport box keeps its width", () => {
    const html = table();
    expect(html).toMatch(new RegExp(`<textarea[^>]*data-cell="0-0"[^>]*>${longName}</textarea>`));
    expect(html).toMatch(/<textarea[^>]*class="[^"]*min-w-40/);
    expect(html).toMatch(/<input[^>]*class="[^"]*min-w-28[^"]*"[^>]*data-cell="0-2"/);
    // The whole value on hover too.
    expect(html).toContain(`title="${longName}"`);
  });

  it("the reasons sit on a line under the row, not in a narrow last column", () => {
    const html = table({ "r-1": [{ code: "name_has_digits", values: {} }] });
    expect(html).toContain(bulkWords.problem.name_has_digits);
    expect(html).toMatch(/colSpan="10"|colspan="10"/);
    // No 「要处理」 header squeezing the names.
    expect(html.slice(0, html.indexOf("</thead>"))).not.toContain(bulkWords.column.problems);
  });
});
