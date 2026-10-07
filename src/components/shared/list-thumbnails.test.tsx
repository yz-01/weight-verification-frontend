/**
 * E3 「整个系统用照片说话」 on every list: each one draws the row's
 * `cover_photo_url` through `PhotoThumb` (or the module's icon when there is
 * none), and the old photo-count badge is gone.
 *
 * The phone's 「我提交过的」 and the office column are rendered; the other
 * lists are read from source - the point there is which component a row
 * draws, and each list would need its own page of mocks to render.
 */
import { readFileSync } from "node:fs";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { HardHat } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1", full_name: "Ah Meng", is_field_staff: true }, can: () => false }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/field-staff",
}));

const { photoColumn } = await import("@/components/shared/photo-thumb");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");

const COVER = "https://api.example/media/evidence/thumbnails/v2/x.jpg";

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

function source(path: string) {
  return readFileSync(path, "utf8");
}

type Row = { id: string; ref: string; cover_photo_url: string | null; photo_count: number };

function Cells({ rows }: { rows: Row[] }) {
  const table = useReactTable({
    data: rows,
    columns: [photoColumn<Row>({ label: "照片", icon: HardHat, reference: (row) => row.ref })],
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <Table>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

describe("the office list column", () => {
  it("draws the row's thumbnail, and the module's icon for a row without one", () => {
    const html = render(
      <Cells
        rows={[
          { id: "1", ref: "MO-1", cover_photo_url: COVER, photo_count: 4 },
          { id: "2", ref: "MO-2", cover_photo_url: null, photo_count: 0 },
        ]}
      />,
    );
    const [withPhoto, without] = html.split(/<tr[\s>]/).slice(1);
    expect(withPhoto).toContain(COVER);
    expect(withPhoto).toContain('data-photo-thumb="photo"');
    expect(withPhoto).toContain(">4</span>");
    expect(without).toContain('data-photo-thumb="none"');
    expect(without).toContain("lucide-hard-hat");
    expect(without).not.toContain("<img");
  });
});

describe("the phone's own submissions", () => {
  const row = {
    id: "mo-1",
    kind: "MATERIAL_OUTGOING" as const,
    reference: "MO-001",
    detail: "Rebar",
    project_id: "p-1",
    project_name: "Site",
    submitted_at: "2026-10-08T01:00:00Z",
    status: "PENDING",
    status_label: "Pending",
    photo: "https://api.example/media/evidence/watermarked/v2/full.jpg",
  };

  it("puts the thumbnail on the left of the card, not the full photograph", () => {
    const html = render(<MySubmissions />, [
      [["my-submissions"], { results: [{ ...row, cover_photo_url: COVER, photo_count: 2 }], count: 1 }],
    ]);
    expect(html).toContain(COVER);
    expect(html).not.toContain("full.jpg");
    // The card is the button; the picture is not a second one inside it.
    expect(html).toMatch(/<span role="img" aria-label="2 张照片" data-photo-thumb="photo"/);
  });

  it("shows the kind's icon when the submission has no photograph", () => {
    const html = render(<MySubmissions />, [
      [["my-submissions"], { results: [{ ...row, photo: null, cover_photo_url: null, photo_count: 0 }], count: 1 }],
    ]);
    expect(html).toContain('data-photo-thumb="none"');
    expect(html).toContain("lucide-package-minus");
  });
});

describe("every list draws its rows' photograph (E3)", () => {
  const lists: Array<[string, RegExp]> = [
    ["src/components/receipts/receipts.tsx", /photoColumn<MaterialReceipt>/],
    ["src/components/contractor-ops/office-module-lists.tsx", /photoColumn<MaterialOutgoing>/],
    ["src/components/contractor-ops/office-module-lists.tsx", /photoColumn<EquipmentMovement>/],
    ["src/components/contractor-ops/office-module-lists.tsx", /photoColumn<SiteEquipment>/],
    ["src/components/contractor-ops/office-module-lists.tsx", /photoColumn<SiteProgressRecord>/],
    ["src/components/contractor-ops/site-disposal-workspaces.tsx", /photoColumn<DisposalRequest>/],
    ["src/components/contractor-ops/waste-outgoing-workspace.tsx", /photoColumn<WasteOutgoingRecord>/],
    ["src/components/sundry-claims/sundry-claims-office.tsx", /photoColumn<SundryClaim>/],
    ["src/components/material-requests/material-requests-office.tsx", /photoColumn<MaterialRequest>/],
    ["src/components/site-operations/safety.tsx", /coverUrl=\{row\.original\.cover_photo_url\}/],
    ["src/components/site-operations/safety.tsx", /coverUrl=\{incident\.cover_photo_url\}/],
    ["src/components/consultant-workflow/applications-list.tsx", /coverUrl=\{application\.cover_photo_url\}/],
    ["src/components/contractor-ops/operations-workspaces.tsx", /coverUrl=\{row\.cover_photo_url\}/],
    ["src/components/field-staff/field-staff-workspace.tsx", /coverUrl=\{task\.cover_photo_url\}/],
    ["src/components/contractor-ops/archive-queue.tsx", /coverUrl=\{row\.cover_photo_url \?\? row\.photo\}/],
    ["src/components/contractor-ops/category-management.tsx", /coverUrl=\{row\.cover_photo_url \?\? row\.photo\}/],
    ["src/components/document-workflow/documents.tsx", /coverUrl=\{row\.original\.cover_photo_url\}/],
    ["src/components/dashboard/dashboard-cards.tsx", /photo: \{ url: row\.cover_photo_url/],
    ["src/components/dashboard/contractor-dashboard.tsx", /coverUrl=\{row\.cover_photo_url\}/],
    ["src/components/dashboard/contractor-dashboard.tsx", /thumbnail: entry\.cover_photo_url/],
  ];

  it.each(lists)("%s draws the thumbnail (%s)", (file, pattern) => {
    expect(source(file)).toMatch(pattern);
  });

  it("no list shows a bare photo count badge any more", () => {
    for (const file of new Set(lists.map(([path]) => path))) {
      expect(source(file)).not.toMatch(/<TypeBadge label=\{String\(row\.original\.(photos|evidence|attachments)\.length\)\}/);
      expect(source(file)).not.toMatch(/<TypeBadge label=\{String\(row\.original\.photo_count/);
    }
  });

  it("puts the receipt's photograph between 材料 and 数量", () => {
    const code = source("src/components/receipts/receipts.tsx");
    const material = code.indexOf('accessorKey: "material_name"');
    const photo = code.indexOf("photoColumn<MaterialReceipt>");
    const quantity = code.indexOf('accessorKey: "quantity"');
    expect(material).toBeGreaterThan(-1);
    expect(material).toBeLessThan(photo);
    expect(photo).toBeLessThan(quantity);
  });
});
