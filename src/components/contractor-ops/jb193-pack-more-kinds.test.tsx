/**
 * JB193 (客户 11-14): 「材料领用（MIN）、工程进度日报告、文件档案、现场记录中心」
 * get the tick boxes every packable list already has - the same column, the
 * same 「资料包」 badge, the same bar - while a package is being put together;
 * 「完善现有打包功能即可，不需要建立重复模块」.
 *
 * Rendered to static markup (the runner has no DOM) with the lists' answers
 * and their `pack_status` already in the cache; the wiring nobody can click
 * here is checked in the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  ArchiveQueueRow,
  MaterialIssueListRow,
  PackageLinkPage,
  PackRowStatus,
} from "@/interfaces/contractor-ops";
import type { DocumentRecord } from "@/interfaces/document-workflow";
import type { DailyReport } from "@/interfaces/progress-reports";
import zh from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ search: "", pathname: "/archive-queue" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => nav.pathname,
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "u-office",
      full_name: "Office",
      portal: "MSE_TRACE",
      account_type: "TENANT",
      is_field_staff: false,
      features: [],
      permissions: [],
      company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" },
    },
    can: () => true,
  }),
}));

// One fixed list state for every list here: the package's project.
const LIST = vi.hoisted(() => ({
  page: 1,
  pageSize: 25,
  search: "",
  sortBy: "",
  sortOrder: "desc" as const,
  hasFilters: false,
  filters: { project: "p-1" } as Record<string, string>,
  query: { page: 1, page_size: 25, project: "p-1" } as Record<string, string | number>,
}));
vi.mock("@/hooks/use-list-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-list-query")>()),
  useListQuery: () => ({
    ...LIST,
    setFilter: () => {},
    setFilters: () => {},
    setPage: () => {},
    setPageSize: () => {},
    setSearch: () => {},
    setSort: () => {},
    clearFilters: () => {},
  }),
}));

vi.mock("@/components/shared/module-records-table", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shared/module-records-table")>()),
  ProjectListFilter: () => null,
}));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));

const { KIND_PERMISSION, PackCollectValueProvider, mayPickFrom } = await import(
  "@/components/contractor-ops/pack-collect"
);
const { MaterialIssueList } = await import("@/components/contractor-ops/material-issue");
const { DailyReportsTab } = await import("@/components/progress/daily-reports");
const { Documents } = await import("@/components/document-workflow/documents");
const { ArchiveQueue } = await import("@/components/contractor-ops/archive-queue");
const { PackageLinkView } = await import("@/components/package-link/package-link");
const { PACK_TARGETS } = await import("@/lib/pack-collect");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const words = zh.multiEngine.collect;

const COLLECTING = {
  collecting: { id: "pkg-a", name: "钢筋证明", project: "p-1" },
  itemCount: 1,
  packageNo: "PKG-1",
  start: () => {},
  end: () => {},
};

const status = (over: Partial<PackRowStatus> = {}): PackRowStatus => ({
  count: 0,
  in_package: false,
  can_add: true,
  reason: "",
  ...over,
});

function render(node: React.ReactNode, seed: [readonly unknown[], unknown][], collecting = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "active"], []);
  client.setQueryData(["material-units", "all"], []);
  for (const [key, data] of seed) client.setQueryData(key, data);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          {collecting ? <PackCollectValueProvider value={COLLECTING}>{node}</PackCollectValueProvider> : node}
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { html, keys: client.getQueryCache().getAll().map((query) => query.queryKey) };
}

/** Every tick box's opening tag. */
const boxes = (html: string) => [...html.matchAll(/<button[^>]*role="checkbox"[^>]*>/g)].map((m) => m[0]);
const enabledRowBoxes = (html: string) =>
  boxes(html).filter((tag) => tag.includes(`aria-label="${words.selectRow}"`) && !/\sdisabled=""/.test(tag));

/* ------------------------------------------------------------------ */

describe("JB193-2: whoever may read the records is offered the list", () => {
  it("reads 日报告 with progress.view and 文件档案 with document.view", () => {
    expect(KIND_PERMISSION.DAILY_REPORT).toBe("progress.view");
    expect(KIND_PERMISSION.DOCUMENT).toBe("document.view");
    expect(KIND_PERMISSION.ATTENDANCE_DAY).toBe("attendance.view");
  });

  it("offers 现场记录中心 to whoever may read any one of its kinds", () => {
    const queue = PACK_TARGETS.find((target) => target.key === "archiveQueue")!;
    expect(mayPickFrom(queue, (permission) => permission === "attendance.view")).toBe(true);
    expect(mayPickFrom(queue, (permission) => permission === "receipt.view")).toBe(true);
    expect(mayPickFrom(queue, () => false)).toBe(false);
    const reports = PACK_TARGETS.find((target) => target.key === "dailyReports")!;
    expect(mayPickFrom(reports, (permission) => permission === "progress.view")).toBe(true);
    expect(mayPickFrom(reports, (permission) => permission === "document.view")).toBe(false);
  });

  it("the chooser asks that rule, not one kind's permission", () => {
    const source = read("src/components/contractor-ops/pack-collect.tsx");
    expect(source).toContain("mayPickFrom(target, can) &&");
    expect(source).not.toContain("can(KIND_PERMISSION[target.kind])");
  });
});

/* ------------------------------------------------------------------ */

function issueLine(over: Partial<MaterialIssueListRow>): MaterialIssueListRow {
  return {
    id: "l-1",
    record: "o-1",
    reference_no: "MIN-P1-001",
    project: "p-1",
    project_name: "North",
    status: "COMPLETED",
    at: "2026-11-11T02:00:00Z",
    captured_at: "2026-11-11T01:00:00Z",
    processed_at: "2026-11-11T02:00:00Z",
    material_name: "Diesel",
    material_specification: "",
    quantity: "200.000",
    issued_quantity: "180.000",
    unit: "Liter",
    equipment_company: "HH",
    equipment_no: "EQ1",
    recipient_name: "Ali",
    issuer_name: "Seng",
    issuer_signature: null,
    recipient_signature: null,
    photo_count: 0,
    cover_photo_url: null,
    unit_price: null,
    amount: null,
    priced: false,
    handed_over: true,
    ...over,
  };
}

describe("JB193-1: the 材料领用 list ticks a whole MIN", () => {
  // Two lines of MIN o-1 (one of them the second material), one of o-2.
  const lines = [
    issueLine({ id: "l-1", record: "o-1", material_name: "Diesel" }),
    issueLine({ id: "l-2", record: "o-1", material_name: "Grease" }),
    issueLine({ id: "l-3", record: "o-2", reference_no: "MIN-P1-002", status: "PENDING" }),
  ];
  const seed = (records: Record<string, PackRowStatus>): [readonly unknown[], unknown][] => [
    [["material-outgoing", "issues", LIST.query], { results: lines, count: lines.length }],
    [["material-outgoing", "issue-options", "p-1"], { materials: [], companies: [], equipment_nos: [], recipients: [] }],
    // One question for the page, each MIN once.
    [["evidence-packages", "pack-status", "MATERIAL_OUTGOING", "pkg-a", ["o-1", "o-2"]], { package: null, records }],
  ];

  it("asks once per MIN, and every line of a MIN carries that MIN's box", () => {
    const { html, keys } = render(<MaterialIssueList onOpen={() => {}} />, seed({
      "o-1": status(),
      "o-2": status({ can_add: false, reason: "not_finished" }),
    }));
    expect(keys).toContainEqual(["evidence-packages", "pack-status", "MATERIAL_OUTGOING", "pkg-a", ["o-1", "o-2"]]);
    // The bar, the 全选 box and the 资料包 column, as on every packable list.
    expect(html).toContain('data-slot="pack-action-bar"');
    expect(html).toContain(`aria-label="${words.selectAll}"`);
    expect(html).toContain(`>${words.column}</th>`);
    // o-1's two lines: two boxes for one record; o-2 is greyed with its reason.
    expect(enabledRowBoxes(html)).toHaveLength(2);
    expect(html).toContain(`title="${words.reason.not_finished}"`);
    // 「已勾选 0 条」: nothing counted twice before anything is ticked.
    expect(html).toContain(words.ticked.replace("{count}", "0"));
  });

  it("shows 「已加入当前资料包」 on every line of a MIN already in it", () => {
    const { html } = render(<MaterialIssueList onOpen={() => {}} />, seed({
      "o-1": status({ in_package: true, can_add: false, reason: "in_package", count: 1 }),
      "o-2": status(),
    }));
    expect(html.split(`aria-label="${words.inCurrent}"`).length - 1).toBe(2);
    expect(enabledRowBoxes(html)).toHaveLength(1);
  });

  it("looks as it did when no package is being put together", () => {
    const { html } = render(<MaterialIssueList onOpen={() => {}} />, seed({ "o-1": status(), "o-2": status() }), false);
    expect(html).not.toContain('data-slot="pack-action-bar"');
    expect(boxes(html)).toHaveLength(0);
    expect(html).not.toContain(`>${words.column}</th>`);
  });

  it("keeps the tick from opening the MIN", () => {
    const list = read("src/components/contractor-ops/material-issue.tsx");
    expect(list).toContain('usePackList({ kind: "MATERIAL_OUTGOING", rowId: (row: MaterialIssueListRow) => row.record }, results)');
    expect(list).toMatch(
      /<TableCell onClick=\{\(event\) => event\.stopPropagation\(\)\} onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}>\s*\{pack\.check\(row\.record\)\}/,
    );
    expect(list).toContain("{pack.badge(row.record)}");
  });
});

/* ------------------------------------------------------------------ */

function report(id: string, over: Partial<DailyReport> = {}): DailyReport {
  return {
    id,
    record_no: `DR-P1-00${id.slice(-1)}`,
    project: "p-1",
    project_name: "North",
    name: `日报 ${id}`,
    body: "",
    report_date: "2026-11-13",
    end_date: null,
    photos: [],
    photo_count: 2,
    record_count: 3,
    entries: [],
    collected_at: null,
    author: null,
    author_name: "PM",
    created_at: "2026-11-13T10:00:00Z",
    updated_at: "2026-11-13T10:00:00Z",
    ...over,
  };
}

describe("JB193-3: the 日报告 list can be ticked", () => {
  const rows = [report("d1"), report("d2")];
  const seed: [readonly unknown[], unknown][] = [
    [["daily-reports", LIST.filters, 1], { results: rows, count: 2 }],
    [
      ["evidence-packages", "pack-status", "DAILY_REPORT", "pkg-a", ["d1", "d2"]],
      { package: null, records: { d1: status(), d2: status({ count: 2 }) } },
    ],
  ];

  it("gives each saved report a box, the bar and the 资料包 column", () => {
    nav.pathname = "/progress";
    nav.search = "tab=reports&project=p-1&pack=pkg-a";
    const { html } = render(<DailyReportsTab />, seed);
    expect(html).toContain('data-slot="pack-action-bar"');
    expect(enabledRowBoxes(html)).toHaveLength(2);
    expect(html).toContain(`>${words.column}</th>`);
    // 「已打包 2 次」 on the report packed before.
    expect(html).toContain(words.packed.replace("{count}", "2"));
  });

  it("is the list as it was without a package", () => {
    nav.search = "tab=reports&project=p-1";
    const { html } = render(<DailyReportsTab />, seed, false);
    expect(boxes(html)).toHaveLength(0);
    expect(html).not.toContain('data-slot="pack-action-bar"');
  });

  it("opens a report named in the address, keeps the row's own opening, and the tick opens nothing", () => {
    const tab = read("src/components/progress/daily-reports.tsx");
    expect(tab).toContain('const [viewing, setViewing] = useUrlSelection("report");');
    expect(tab).toContain('usePackList({ kind: "DAILY_REPORT" }, reportRows)');
    expect(tab).toMatch(/<TableCell onClick=\{\(event\) => event\.stopPropagation\(\)\} onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}>\s*\{pack\.check\(row\.id\)\}/);
    // The single export, print and send of a report are untouched (JB193-10).
    expect(tab).toContain('recordKind: "DAILY_REPORT"');
  });
});

/* ------------------------------------------------------------------ */

function documentRow(id: string, over: Partial<DocumentRecord>): DocumentRecord {
  return {
    id,
    document_no: `DOC-00${id.slice(-1)}`,
    reference_no: "",
    title: `File ${id}`,
    description: "",
    keywords: "",
    project: "p-1",
    project_name: "North",
    category: "c-1",
    category_name: "图纸",
    subcategory: null,
    subcategory_name: null,
    status: "ARCHIVED",
    version_count: 1,
    latest_version: null,
    file_count: 1,
    archived_at: null,
    archived_by: null,
    archive_reason: "",
    created_by: null,
    created_by_name: "PM",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    ...over,
  };
}

describe("JB193-4: the 文件档案 list ticks archived documents only", () => {
  const rows = [
    documentRow("d1", { status: "ARCHIVED" }),
    documentRow("d2", { status: "ACTIVE" }),
    // A company-wide document: belongs to no project, packable into any.
    documentRow("d3", { status: "ARCHIVED", project: null, project_name: null }),
  ];
  const query = { ...LIST.query, with_company: "1" };

  it("asks for the project's documents and the company-wide ones while a package is put together", () => {
    nav.pathname = "/documents";
    nav.search = "project=p-1&pack=pkg-a";
    const { html, keys } = render(<Documents />, [
      [["documents", query], { results: rows, count: rows.length, page: 1, page_size: 25, total_pages: 1 }],
      [
        ["evidence-packages", "pack-status", "DOCUMENT", "pkg-a", ["d1", "d2", "d3"]],
        { package: null, records: { d1: status(), d2: status(), d3: status() } },
      ],
    ]);
    expect(keys).toContainEqual(["documents", query]);
    // d1 and d3 can be ticked; d2 is greyed and says why, even though the server said yes.
    expect(enabledRowBoxes(html)).toHaveLength(2);
    expect(html).toContain(`title="${words.reason.not_archived}"`);
    expect(html).toContain(`aria-label="${words.reason.not_archived}"`);
    expect(words.reason.not_archived).toBe("这份文件还没确认归档，归档后才能放进资料包");
  });

  it("names the rule once, on the list, whatever category or sub-category is chosen", () => {
    const source = read("src/components/document-workflow/documents.tsx");
    expect(source).toContain(
      'pack={{ kind: "DOCUMENT", blocked: (row) => (row.status !== "ARCHIVED" ? "not_archived" : null) }}',
    );
    expect(source).toMatch(/\(topBar\.active \|\| collecting !== null\) && list\.filters\.project/);
  });
});

/* ------------------------------------------------------------------ */

function queueRow(over: Partial<ArchiveQueueRow>): ArchiveQueueRow {
  return {
    id: "r1",
    kind: "MATERIAL_RECEIPT",
    reference: "GRN-P1-001",
    detail: "Rebar",
    project_id: "p-1",
    project_name: "North",
    project_code: "P1",
    submitted_at: "2026-11-12T02:00:00Z",
    status: "ACCEPTED",
    status_label: "已验收",
    photo: null,
    seen_at: null,
    archivable: true,
    archived: null,
    ...over,
  };
}

describe("JB193-6 / JB193-7: 现场记录中心 ticks records of several kinds in one go", () => {
  const DAY = "5f0c6a8e-1d7b-5c3e-9a41-2b8f0e6d7c19";
  const rows = [
    queueRow({ id: "r1", kind: "MATERIAL_RECEIPT" }),
    queueRow({ id: "o1", kind: "MATERIAL_OUTGOING", reference: "MIN-P1-002" }),
    queueRow({ id: DAY, kind: "ATTENDANCE_DAY", reference: "P1 2026-11-12", archivable: false }),
    queueRow({ id: "h1", kind: "HAZARD", reference: "HZ-P1-001" }),
  ];
  const statusKey = [
    "evidence-packages",
    "pack-status",
    "items",
    "pkg-a",
    ["MATERIAL_RECEIPT:r1", "MATERIAL_OUTGOING:o1", `ATTENDANCE_DAY:${DAY}`, "HAZARD:h1"],
  ];

  it("asks one question for the whole page, each row with its own kind", () => {
    nav.pathname = "/archive-queue";
    nav.search = "project=p-1&pack=pkg-a";
    const { html, keys } = render(<ArchiveQueue />, [
      [
        ["archive-queue", "pending", "", "", "p-1", 1, false, undefined],
        { results: rows, count: rows.length, counts: {}, kinds: ["MATERIAL_RECEIPT", "MATERIAL_OUTGOING", "HAZARD", "ATTENDANCE_DAY"] },
      ],
      [
        statusKey,
        {
          package: null,
          records: {
            r1: status(),
            o1: status(),
            [DAY]: status(),
            // Each kind keeps its own rule: an unfinished hazard says so.
            h1: status({ can_add: false, reason: "not_finished" }),
          },
        },
      ],
    ]);
    expect(keys).toContainEqual(statusKey);
    expect(html).toContain('data-slot="pack-action-bar"');
    expect(enabledRowBoxes(html)).toHaveLength(3);
    expect(html).toContain(`title="${words.reason.not_finished}"`);
  });

  it("keeps the record window read-only and the tick from opening the row or marking it 已看", () => {
    const queue = read("src/components/contractor-ops/archive-queue.tsx");
    expect(queue).toContain("usePackList({ kind: (row: ArchiveQueueRow) => row.kind }, rows)");
    expect(queue).toMatch(/<TableCell onClick=\{\(event\) => event\.stopPropagation\(\)\} onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}>\s*\{pack\.check\(row\.id\)\}/);
    // The sheet itself gains nothing (四 5; confirm-on-business-page pins its buttons).
    const sheet = queue.slice(queue.indexOf("export function RecordSheet"));
    expect(sheet).not.toMatch(/usePackList|AddToPackageButton|linkPackageRecords/);
  });
});

/* ------------------------------------------------------------------ */

describe("JB193-8: the owner's link page names each record", () => {
  const item = (id: string, record_kind: string, outgoing_kind?: string) => ({
    id,
    record_kind,
    outgoing_kind,
    reference: `REF-${id}`,
    fields: [],
    photo_count: 0,
    document_count: 0,
    file_count: 1,
    round_no: 1,
    review_state: "PENDING",
    returned_reason: "",
    answered_by: "",
    answered_at: null,
  });
  const page = {
    company_name: "Co",
    company_logo: "",
    project_name: "North",
    project_code: "P1",
    package_no: "PKG-1",
    package_name: "Pack",
    remarks: "",
    round: 1,
    confirmed_at: "2026-11-14T02:00:00Z",
    recipient: {
      display_name: "Owner",
      kind: "OWNER",
      organization: "",
      status: "VIEWED",
      signed_name: "",
      signed_at: null,
      expires_at: "2027-01-12T02:00:00Z",
      seen_round: 1,
    },
    exported: false,
    can_decide: true,
    can_sign: true,
    items: [
      item("i1", "MATERIAL_OUTGOING", "ISSUE"),
      item("i2", "MATERIAL_OUTGOING", "RETURN"),
      item("i3", "DAILY_REPORT"),
      item("i4", "DOCUMENT"),
      item("i5", "ATTENDANCE_DAY"),
      item("i6", "SOMETHING_NEW"),
    ],
    messages: [],
  } as unknown as PackageLinkPage;

  it("says 材料领用, 材料出场, 日报告, 文件档案, 人员进场 - and never breaks on a kind it does not know", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["package-link", "tok", "zh"], page);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
          <TooltipProvider>
            <PackageLinkView token="tok" />
          </TooltipProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    ).replace(/<!-- -->/g, "");
    for (const [index, name] of [
      [1, "材料领用"],
      [2, "材料出场"],
      [3, "日报告"],
      [4, "文件档案"],
      [5, "人员进场"],
      [6, "SOMETHING_NEW"],
    ] as const) {
      expect(html, name).toContain(`${index}. ${name}`);
    }
  });
});

describe("JB193-8: one naming rule in every place a package record is written", () => {
  it.each([
    "src/components/contractor-ops/multi-engine.tsx",
    "src/components/contractor-ops/package-review.tsx",
    "src/components/contractor-ops/package-exchange.tsx",
    "src/components/package-link/package-link.tsx",
  ])("%s names records with packageKindName", (file) => {
    const source = read(file);
    expect(source).toContain("packageKindName(");
    expect(source).not.toContain("t(`kind.${item.record_kind}`)");
    expect(source).not.toContain("kinds(`kind.${item.record_kind}`)");
  });

  it("offers 日报告, 文件档案 and 人员进场 in the quick list, and keeps a record's body ticked", () => {
    const sheet = read("src/components/contractor-ops/multi-engine.tsx");
    const kinds = sheet.slice(sheet.indexOf("const KINDS: ArchiveRecordKind[] = ["), sheet.indexOf("];", sheet.indexOf("const KINDS")));
    for (const kind of ["DAILY_REPORT", "DOCUMENT", "ATTENDANCE_DAY"]) expect(kinds).toContain(`"${kind}"`);
    expect(sheet).toContain("packageKindName(t, { record_kind: row })");
    // TickPartsDialog: a fixed file is ticked, disabled, says so, and is always sent.
    expect(sheet).toMatch(/file\.fixed \?[\s\S]{0,200}data-fixed-file[\s\S]{0,200}<Checkbox checked disabled/);
    expect(sheet).toContain('{t("fixedPart")}');
    expect(sheet).toMatch(/const selection: PackageSelection = withFixedFiles\(/);
  });

  it("opens a daily report from a package in its own book; a day of attendance in the record centre's sheet", () => {
    const inPlace = read("src/components/shared/in-place-record.tsx");
    expect(inPlace).toContain('"DAILY_REPORT",');
    expect(inPlace).toContain('case "DAILY_REPORT":\n      return <DailyReportBook report={id} onClose={onClose} />;');
    expect(inPlace).not.toContain('"ATTENDANCE_DAY"');
  });
});
