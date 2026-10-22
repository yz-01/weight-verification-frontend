/**
 * J8 (Q8): the photo report is one row per business record - a few words on
 * the left, the record's photographs as equal squares on the right - with its
 * evidence report and the record one press away. No file names, devices or
 * coordinates in the row.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ContractorReportFilters, PhotoGroupPage } from "@/interfaces/contractor-report";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/reports",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { PhotoGroupsReport } = await import("@/components/reports/photo-groups-report");

const filters: ContractorReportFilters = { report_type: "photos", date_from: "2026-10-21", date_to: "2026-10-21" };

const photo = (index: number) => ({
  id: `a${index}`,
  url: `https://cdn.example/full-${index}.jpg`,
  thumbnail_url: `https://cdn.example/thumb-${index}.webp`,
  captured_at: "2026-10-21T02:00:00Z",
  latitude: "3.1",
  longitude: "101.6",
});

const page: PhotoGroupPage = {
  count: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
  truncated: false,
  results: [
    {
      key: "MATERIAL_OUTGOING|r1",
      kind: "MATERIAL_OUTGOING",
      record_id: "r1",
      export_kind: "MATERIAL_OUTGOING",
      reference: "MO-013",
      project_id: "p1",
      project: "Tower",
      date: "2026-10-21T02:00:00Z",
      uploaded_by: "Ah Meng",
      photo_count: 8,
      has_gps: true,
      photos: Array.from({ length: 8 }, (_, index) => photo(index)),
    },
    {
      key: "PERSON|u1|2026-10-21T02:00:00+00:00",
      kind: "",
      record_id: null,
      export_kind: null,
      reference: "",
      project_id: "p1",
      project: "Tower",
      date: "2026-10-21T02:00:00Z",
      uploaded_by: "Ah Meng",
      photo_count: 1,
      has_gps: false,
      photos: [photo(9)],
    },
  ],
};

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["contractor-reports", "photo-groups", filters, 1], page);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <PhotoGroupsReport filters={filters} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the photo report by record (J8)", () => {
  it("draws one row per record, its eight photographs side by side", () => {
    const html = render();
    expect(html.match(/data-photo-group=/g)).toHaveLength(2);
    const first = html.slice(html.indexOf('data-photo-group="MATERIAL_OUTGOING|r1"'), html.indexOf('data-photo-group="PERSON'));
    expect(first.match(/thumb-\d\.webp/g)).toHaveLength(8);
    expect(first).toContain("MO-013 · 材料出场");
    expect(first).toContain("8 张照片");
    // Thumbnails only; the full photograph waits for the viewer.
    expect(first).not.toContain("full-0.jpg");
  });

  it("keeps the row to its words and photographs: no buttons, no file names (J43)", () => {
    const html = render();
    // 打开原记录, 完整证据 PDF and 修改前原单 are not on the row.
    expect(html).not.toContain("打开原记录");
    expect(html).not.toContain("证据 PDF");
    expect(html).not.toContain("修改前原单");
    expect(html).not.toContain("预览");
    expect(html).not.toContain(".jpg<");
    expect(html).not.toContain("101.6");
  });

  it("names a photograph without a record as such, with nothing to open", () => {
    const html = render();
    const loose = html.slice(html.indexOf('data-photo-group="PERSON'));
    expect(loose).toContain("没有所属记录的照片");
    expect(loose).not.toContain("打开原记录");
  });
});
