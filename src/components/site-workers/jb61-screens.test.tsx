/**
 * JB61 (10-28) on screen: 批量新增人员, the passport on the worker, phone optional.
 *
 * Rendered to static markup (the runner has no DOM) with the queries filled
 * in, the way the other screen tests here do; the table's own logic is in
 * `src/lib/site-workers-bulk.test.ts`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { BatchDetail, SiteWorkerDetail } from "@/interfaces/site-workers";
import { blankRows, editRow, rowFromServer } from "@/lib/site-workers-bulk";
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
const { WorkerFormDialog } = await import("@/components/site-workers/worker-form");
const { BulkTable } = await import("@/components/site-workers/bulk-table");
const { WorkerBulk } = await import("@/components/site-workers/worker-bulk");
const { PassportCapture } = await import("@/components/site-workers/passport-capture");

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

beforeEach(() => {
  reader.codes = ["site_worker.view", "site_worker.manage"];
  reader.search = "";
});

describe("worker detail (JB61-2, JB61-3)", () => {
  it("no phone: the link button is grey and says why beside it", () => {
    const html = render(<WorkerDetailDialog workerId="w-1" onClose={() => {}} onAllVisits={() => {}} />, [
      [["site-workers", "detail", "w-1"], worker()],
    ]);
    expect(html).toContain(words.link.needPhone);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*发送定位链接/);
  });

  it("with a phone the button works as before", () => {
    const html = render(<WorkerDetailDialog workerId="w-1" onClose={() => {}} onAllVisits={() => {}} />, [
      [["site-workers", "detail", "w-1"], worker({ phone: "+60123456789" })],
    ]);
    expect(html).not.toContain(words.link.needPhone);
  });

  it("shows the passport, its country, the expiry warning and the photo", () => {
    const html = render(<WorkerDetailDialog workerId="w-1" onClose={() => {}} onAllVisits={() => {}} />, [
      [["site-workers", "detail", "w-1"], worker()],
    ]);
    expect(html).toContain("A1234567");
    expect(html).toContain("BGD · ");
    expect(html).toContain(words.detail.passportExpired);
    expect(html).toContain("passport.jpg");
    expect(html).toContain(words.field.passportPhoto);
  });
});

describe("worker form (JB61-2, JB61-3)", () => {
  it("the phone is optional and the passport boxes are there", () => {
    const html = render(<WorkerFormDialog open defaultProject="p-1" onClose={() => {}} onSaved={() => {}} />, [
      [["site-workers", "company-options", "list", ""], []],
    ]);
    expect(html).toContain(words.form.phoneHint);
    for (const label of [
      words.field.passportNo,
      words.field.nationality,
      words.field.dateOfBirth,
      words.field.passportExpiry,
      words.field.passportPhoto,
    ]) {
      expect(html).toContain(label);
    }
    // No red star on the phone: only the project and the name are demanded.
    const phoneLabel = html.slice(html.indexOf(words.field.phone) - 300, html.indexOf(words.field.phone) + 200);
    expect(phoneLabel).toContain(messages.common.optional);
  });
});

describe("批量新增人员 table (JB61-1)", () => {
  const base = {
    id: "r-1",
    position: 1,
    name: "KARIM 2",
    phone: "",
    passport_no: "",
    nationality: "BGD",
    date_of_birth: "",
    passport_expiry: "",
    cidb_no: "",
    company_text: "",
    source: "PHONE" as const,
    read_status: "CHECK_FAILED" as const,
    needs_check: true,
    photo_url: "https://files.test/p1.jpg",
    photo_is_pdf: false,
  };

  it("a yellow photo row: the photo beside it, 「对着照片补打」 and the reasons", () => {
    const rows = [rowFromServer(base), editRow(blankRows(1)[0], "name", "Typed")];
    const html = render(
      <BulkTable
        rows={rows}
        shown={[0, 1]}
        problems={{
          "r-1": [
            { code: "name_has_digits", values: {} },
            { code: "check_photo", values: {} },
          ],
        }}
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
    expect(html).toContain("p1.jpg");
    expect(html).toContain(bulkWords.typeFromPhoto);
    expect(html).toContain(bulkWords.problem.name_has_digits);
    expect(html).toContain(bulkWords.problem.check_photo);
    expect(html).toContain('placeholder="Kuat"');
    expect(html).toContain("bg-destructive/5");
  });

  it("the problem a clash names says who and where", () => {
    const rows = [rowFromServer({ ...base, needs_check: false, read_status: "READ" })];
    const html = render(
      <BulkTable
        rows={rows}
        shown={[0]}
        problems={{ "r-1": [{ code: "passport_on_roster", values: { name: "Ali", project: "Tower" } }] }}
        companyPlaceholder=""
        focus={null}
        onRows={() => {}}
        onFocusDone={() => {}}
        onNeedMoreRows={() => {}}
        onMoveTo={() => {}}
        onRemove={() => {}}
        onCheck={() => {}}
      />,
    );
    expect(html).toContain("Ali");
    expect(html).toContain("Tower");
  });
});

describe("批量新增人员 page (JB61-1)", () => {
  it("starts with the project and company once, and lists batches to continue", () => {
    const html = render(<WorkerBulk />, [
      [
        ["site-workers", "batches", "open"],
        [
          {
            id: "b-1",
            project: "p-1",
            project_name: "Tower",
            supplier: null,
            supplier_name: "",
            company_note: "Kuat",
            company_name: "Kuat",
            status: "OPEN",
            saved_count: 3,
            row_count: 7,
            created_at: "2026-10-28T01:00:00Z",
          },
        ],
      ],
      [["site-workers", "company-options", "list", ""], []],
    ]);
    expect(html).toContain(bulkWords.step1);
    expect(html).toContain(bulkWords.start);
    expect(html).toContain(bulkWords.continueTitle);
    expect(html).toContain("/site-workers/bulk?batch=b-1");
  });

  it("a batch: the three ways in, the table of 20 empty rows, 「再加 20 行」 and 「全部保存」", () => {
    reader.search = "batch=b-1";
    const detail: BatchDetail = {
      now: "2026-10-28T03:00:00Z",
      batch: {
        id: "b-1",
        project: "p-1",
        project_name: "Tower",
        supplier: null,
        supplier_name: "",
        company_note: "Kuat",
        company_name: "Kuat",
        status: "OPEN",
        saved_count: 0,
        row_count: 0,
        created_at: "2026-10-28T01:00:00Z",
      },
      rows: [],
      problems: {},
      row_count: 0,
      saved_count: 0,
    };
    const html = render(<WorkerBulk />, [[["site-workers", "batch", "b-1"], detail]]);
    for (const label of [
      bulkWords.usePhones,
      bulkWords.uploadPhotos,
      bulkWords.downloadTemplate,
      bulkWords.uploadExcel,
      bulkWords.addRows,
      bulkWords.saveAll,
      bulkWords.howTo,
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/data-cell="\d+-0"/g)).toHaveLength(20);
    // Nothing typed yet: 「全部保存」 is grey and says why.
    expect(html).toContain(bulkWords.nothingToSave);
  });
});

describe("the phone's capture page (JB61-1)", () => {
  it("one frame, one button, what to do", () => {
    const html = render(<PassportCapture token="tok" />, [
      [["passport-capture", "tok"], { project_name: "Tower", company_name: "MSE", phone_count: 4 }],
    ]);
    expect(html).toContain(messages.passportCapture.title);
    expect(html).toContain("Tower");
    expect(html).toContain("4");
    expect(html).toContain(messages.passportCapture.aimHint);
  });
});
