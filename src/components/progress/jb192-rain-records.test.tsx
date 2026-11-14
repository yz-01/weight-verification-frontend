/**
 * JB192 (客户 11-13 晚上) - 工程进度 › 雨天记录, the office.
 *
 * > 10. 后台管理员可以作废不需要的雨天记录，保留操作历史，作废记录不参与正式统计。
 * > 11. 接收数量5份、时间间隔30分钟，希望设置为后台可调整参数。
 * > 13. 每份记录显示两张照片、开始时间、结束时间、下雨时长、拍摄人及所属项目。
 * > 17. 每个月自动累计下雨次数、下雨天数及总小时、分钟。
 * > 19. 支持按照日期、月份及项目筛选，查看对应照片和统计结果。
 * > 20. 现有工程进度PDF报表支持按月份输出 Rainy Weather 记录……
 * > 23. 用户可以按日期或月份筛选 Rainy Weather 记录，再勾选需要的雨天记录进行打包。
 *
 * Rendered to static markup like the other screen tests (the runner has no
 * DOM); the statistics are the server's (`rain_summary`) and are drawn as
 * they come. The wiring into the page and the record window is read in the
 * source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SiteProgressRecord } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({
  search: "project=p-1&month=2026-11",
  permissions: ["progress.view", "progress.manage", "progress.confirm", "package.view", "package.manage"] as string[],
}));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(reader.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Office", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => reader.permissions.includes(code),
  }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: false,
    projectId: "",
    projects: [],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
}));

const {
  RainRecordsTab,
  RainRulesDialog,
  RainVoidButton,
  RainVoidDialog,
  monthChange,
  rangeChange,
  rainPhotoRoles,
  useRainFacts,
} = await import("@/components/progress/rain-records");
const { RAIN_RECORDS_KEY } = await import("@/services/rain-records.service");
const { DataTable } = await import("@/components/shared/data-table");
const { PackCollectValueProvider } = await import("@/components/contractor-ops/pack-collect");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const words = zh.rainRecords;
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, seed: (qc: QueryClient) => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function rainRecord(overrides: Partial<SiteProgressRecord> = {}): SiteProgressRecord {
  return {
    id: "r-1",
    record_no: "PG-PRJ-0003-021",
    project: "p-1",
    project_name: "Site A",
    phase: "ph-rain",
    phase_name: "Rainy Weather",
    percent_complete: null,
    category: null,
    category_name: null,
    category_code: null,
    description: "Rainy Weather 14:05–15:10 (1h 05m)",
    status: "SUBMITTED",
    captured_at: "2026-11-13T06:05:00Z",
    uploaded_at: "2026-11-13T07:11:00Z",
    latitude: "3.1000000",
    longitude: "101.6000000",
    submitted_by_name: "Ali",
    confirmed_by_name: null,
    confirmed_at: null,
    review_note: "",
    photos: [
      { id: "ph-2", image: "/b.jpg", watermarked: "/b-w.jpg", caption: "", captured_at: "2026-11-13T07:10:00Z", latitude: "3.2000000", longitude: "101.7000000" },
      { id: "ph-1", image: "/a.jpg", watermarked: "/a-w.jpg", caption: "", captured_at: "2026-11-13T06:05:00Z", latitude: "3.1000000", longitude: "101.6000000" },
    ],
    is_rain: true,
    rain_started_at: "2026-11-13T06:05:00Z",
    rain_ended_at: "2026-11-13T07:10:00Z",
    rain_minutes: 65,
    is_voided: false,
    voided_at: null,
    voided_by_name: null,
    void_reason: "",
    ...overrides,
  } as SiteProgressRecord;
}

const VOIDED = rainRecord({
  id: "r-2",
  record_no: "PG-PRJ-0003-020",
  is_voided: true,
  voided_at: "2026-11-13T09:00:00Z",
  voided_by_name: "Mike",
  void_reason: "重复拍了",
});

const SUMMARY = {
  project: "p-1",
  from: "2026-11-01",
  to: "2026-11-30",
  times: 7,
  days: 5,
  minutes: 612,
  records: 9,
  // Always 0 since JB198 (a voided record is deleted).
  voided: 0,
  daily: [
    { date: "2026-11-03", times: 2, minutes: 95, records: 3 },
    { date: "2026-11-13", times: 1, minutes: 65, records: 1 },
  ],
  periods: [],
};

/** The tab's queries as the server would answer them. */
function seedTab(qc: QueryClient, { project = "p-1", month = "2026-11", canChange = true } = {}) {
  qc.setQueryData([...RAIN_RECORDS_KEY, "rules"], { limit: 5, minutes: 30, can_change: canChange });
  qc.setQueryData([...RAIN_RECORDS_KEY, "summary", project, { month }], SUMMARY);
  qc.setQueryData(
    [...RAIN_RECORDS_KEY, "list", { page: 1, page_size: 25, ...(project ? { project } : {}), month }, { month }],
    { count: 2, results: [rainRecord(), rainRecord({ id: "r-2", record_no: "PG-PRJ-0003-020" })] },
  );
}

describe("「雨天记录」 tab (JB192-12)", () => {
  it("is the progress page's sixth tab, at ?tab=rain", () => {
    const page = read("src/components/progress/progress-page.tsx");
    expect(page).toMatch(/active === "rain" && <RainRecordsTab \/>/);
    expect(page).toMatch(/PROGRESS_TABS = \[[^\]]*"rain"\]/);
    expect(zh.progressPage.tabs.rain).toBe("雨天记录");
    expect(zhTW.progressPage.tabs.rain).toBe("雨天記錄");
    expect(en.progressPage.tabs.rain).toBe("Rainy Weather");
    expect(ms.progressPage.tabs.rain).toBe("Rekod hujan");
  });

  it("shows the rule, the period's statistics, a line per day, the PDF buttons and the list", () => {
    reader.search = "project=p-1&month=2026-11";
    const html = render(<RainRecordsTab />, (qc) => seedTab(qc));
    const shown = text(html);
    expect(shown).toContain("接收规则：每个项目任何 30 分钟里最多接收 5 份");
    // 下雨次数 · 下雨天数 · 总时长 · 记录份数 (no 「已作废」 since JB198).
    expect(html).toMatch(/data-stat="times"[\s\S]*?7 次/);
    expect(html).toMatch(/data-stat="days"[\s\S]*?5 天/);
    expect(html).toMatch(/data-stat="minutes"[\s\S]*?10 小时 12 分/);
    expect(html).toMatch(/data-stat="records"[\s\S]*?9 份/);
    expect(html).toContain('data-day="2026-11-03"');
    expect(html).toMatch(/data-day="2026-11-03"[\s\S]*?1 小时 35 分/);
    expect(html).toContain('data-slot="rain-pdf"');
    expect(html).not.toContain('data-slot="rain-pdf-need"');
    // Newest first, as the server sends them: number, start, end, duration, who, project.
    // (RecordNo shows the running number, 「PG-021」, with the project beside it.)
    expect(shown.indexOf("PG-021")).toBeGreaterThan(-1);
    expect(shown.indexOf("PG-021")).toBeLessThan(shown.indexOf("PG-020"));
    expect(shown).toContain("1 小时 5 分");
    expect(shown).toContain("Ali");
    expect(shown).toContain("Site A");
    // The month picker shows the month, the range its first and last day.
    expect(html).toMatch(/type="month"[^>]*value="2026-11"/);
    expect(html).toMatch(/type="date"[^>]*value="2026-11-01"/);
  });

  it("with 「全部项目」 asks for a project for the statistics and the PDF, and still lists", () => {
    reader.search = "month=2026-11";
    const html = render(<RainRecordsTab />, (qc) => seedTab(qc, { project: "" }));
    expect(html).toContain(words.summary.chooseProject);
    expect(html).not.toContain('data-slot="rain-summary"');
    expect(html).toContain(words.pdf.needMonth);
    expect(text(html)).toContain("PG-021");
    reader.search = "project=p-1&month=2026-11";
  });

  it("needs a month, not a range, for the PDF", () => {
    reader.search = "project=p-1&date_from=2026-11-03&date_to=2026-11-09";
    const html = render(<RainRecordsTab />);
    expect(html).toContain(words.pdf.needMonth);
    expect(html).not.toContain('data-slot="rain-pdf"');
    reader.search = "project=p-1&month=2026-11";
  });

  it("makes a month and a date range one or the other", () => {
    expect(monthChange("2026-10")).toEqual({ month: "2026-10", date_from: undefined, date_to: undefined });
    expect(monthChange("")).toEqual({ month: undefined, date_from: undefined, date_to: undefined });
    expect(rangeChange({ date_from: "2026-11-03", date_to: "2026-11-09" })).toEqual({
      month: undefined,
      date_from: "2026-11-03",
      date_to: "2026-11-09",
    });
  });

  it("filters by project, month or dates, and reads the list with rain=1", () => {
    const tab = read("src/components/progress/rain-records.tsx");
    // No status filter since JB198.
    expect(tab).toMatch(/useListQuery\(\["project", "month", "date_from", "date_to"\]\)/);
    expect(read("src/services/rain-records.service.ts")).toMatch(/\{ \.\.\.query, rain: "1" \}/);
    // A row opens its record on click (the progress record's own window).
    expect(tab).toMatch(/onRowClick=\{setViewing\}/);
    expect(tab).toMatch(/<ProgressRecordDialog\s+key=\{shown\.id\}\s+record=\{shown\}/);
  });
});

describe("【接收规则】 (JB192-9)", () => {
  it("is offered only to whoever may change the rules; everyone sees the rule", () => {
    const html = render(<RainRecordsTab />, (qc) => seedTab(qc, { canChange: false }));
    expect(html).toContain("每个项目任何 30 分钟里最多接收 5 份");
    expect(html).not.toContain('data-slot="rain-rules-button"');
    const head = render(<RainRecordsTab />, (qc) => seedTab(qc));
    expect(head).toContain('data-slot="rain-rules-button"');
  });

  it("asks how many records in how many minutes, within the server's limits", () => {
    const html = render(<RainRulesDialog rules={{ limit: 5, minutes: 30, can_change: true }} onClose={() => {}} />);
    expect(html).toContain(words.rules.title);
    expect(html).toMatch(/type="number"[^>]*min="1"[^>]*max="50"[^>]*value="5"/);
    expect(html).toMatch(/type="number"[^>]*min="5"[^>]*max="1440"[^>]*value="30"/);
    expect(html).toContain(words.rules.save);
  });
});

describe("【作废】 and the rain section of the record window (JB192-10, JB192-12)", () => {
  function Facts({ record }: { record: SiteProgressRecord }) {
    const facts = useRainFacts(record);
    return (
      <dl>
        {facts.map((fact) => (
          <div key={fact.label} data-fact={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  it("shows start and stop, each with its own photo's GPS, and the duration", () => {
    expect(rainPhotoRoles(rainRecord())).toEqual({ start: "ph-1", end: "ph-2" });
    const shown = text(render(<Facts record={rainRecord()} />));
    expect(shown).toContain(`${words.record.start} 2026-11-13 14:05 GPS 3.1000000, 101.6000000`);
    expect(shown).toContain(`${words.record.end} 2026-11-13 15:10 GPS 3.2000000, 101.7000000`);
    expect(shown).toContain(`${words.record.duration} 1 小时 5 分`);
    expect(shown).not.toContain("作废");
  });

  it("has no 「已作废」 block, even for a record the server called voided (JB198)", () => {
    const shown = text(render(<Facts record={VOIDED} />));
    expect(shown).toBe(text(render(<Facts record={rainRecord({ id: "r-2" })} />)));
    expect(shown).not.toContain("Mike");
    expect(shown).not.toContain("重复拍了");
  });

  it("adds nothing to a progress record that is not a rain record", () => {
    const plain = rainRecord({ is_rain: false, rain_started_at: null, rain_ended_at: null, rain_minutes: null });
    expect(render(<Facts record={plain} />)).toBe("<dl></dl>");
  });

  it("offers 【作废】 on a rain record not yet voided, to whoever confirms progress - once", () => {
    expect(render(<RainVoidButton record={rainRecord()} onVoided={() => {}} />)).toContain(words.void.button);
    // Never twice, and there is no way to undo it.
    expect(render(<RainVoidButton record={VOIDED} onVoided={() => {}} />)).toBe("");
    expect(
      render(<RainVoidButton record={rainRecord({ is_rain: false, rain_started_at: null })} onVoided={() => {}} />),
    ).toBe("");
    reader.permissions = ["progress.view"];
    expect(render(<RainVoidButton record={rainRecord()} onVoided={() => {}} />)).toBe("");
    reader.permissions = ["progress.view", "progress.manage", "progress.confirm", "package.view", "package.manage"];
  });

  it("asks for a reason, and says the PIN comes next", () => {
    const html = render(<RainVoidDialog record={rainRecord()} onClose={() => {}} onVoided={() => {}} />);
    expect(html).toContain(words.void.title);
    expect(html).toContain(words.void.reason);
    expect(html).toContain(words.void.pin);
    expect(html).toContain(words.void.confirm);
    const tab = read("src/components/progress/rain-records.tsx");
    expect(tab).toMatch(/requires=\{\[\[reason\.trim\(\), t\("void\.reason"\)\]\]\}/);
    expect(tab).toMatch(/mutationFn: \(\) => voidRainRecord\(record\.id, reason\)/);
    // The PIN box says 「作废雨天记录」 (the server's action rain_record.void).
    expect(zh.signOff.action.rain_record_void).toBe("作废雨天记录");
  });

  it("is in the progress record's own window; a voided record cannot be packed from it", () => {
    const lists = read("src/components/contractor-ops/office-module-lists.tsx");
    const dialog = lists.slice(lists.indexOf("export function ProgressRecordDialog"), lists.indexOf("async function getProgressRecord"));
    expect(dialog).toMatch(/facts=\{\[\s*\.\.\.rainFacts,/);
    expect(dialog).toMatch(/label: rainPhotoLabel\(photo\.id\) \|\| photo\.caption/);
    expect(dialog).toMatch(/\{shown\.is_voided \? null : \(\s*<AddToPackageButton/);
    expect(dialog).toMatch(/<RainVoidButton\s+record=\{shown\}/);
  });
});

describe("勾选打包 (JB192-14)", () => {
  interface Row {
    id: string;
    record_no: string;
    is_voided?: boolean;
  }
  const rows: Row[] = [
    { id: "r-1", record_no: "PG-021" },
    { id: "r-2", record_no: "PG-020", is_voided: true },
  ];
  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "record_no", header: () => "No", cell: ({ row }) => row.original.record_no },
  ];

  it("ticks rain records into the package being put together - never a voided one", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    // The server would let both in: the list itself still keeps the voided one out.
    qc.setQueryData(["evidence-packages", "pack-status", "PROGRESS", "pkg-a", ["r-1", "r-2"]], {
      package: null,
      records: {
        "r-1": { count: 0, in_package: false, can_add: true, reason: "" },
        "r-2": { count: 0, in_package: false, can_add: true, reason: "" },
      },
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
          <TooltipProvider>
            <PackCollectValueProvider
              value={{
                collecting: { id: "pkg-a", name: "十一月 EOT", project: "p-1" },
                itemCount: 0,
                packageNo: "PKG-1",
                start: () => undefined,
                end: () => undefined,
              }}
            >
              <DataTable<Row>
                columns={columns}
                rows={rows}
                totalCount={2}
                page={1}
                pageSize={25}
                isLoading={false}
                isError={false}
                hasFilters={false}
                search=""
                sortBy=""
                sortOrder="desc"
                storageKey="rain-pack-test"
                pack={{ kind: "PROGRESS", blocked: (row) => (row.is_voided ? "voided" : null) }}
                onSearchChange={() => {}}
                onSortChange={() => {}}
                onPageChange={() => {}}
                onPageSizeChange={() => {}}
                onClearFilters={() => {}}
              />
            </PackCollectValueProvider>
          </TooltipProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const voidedBox = new RegExp(`title="${zh.multiEngine.collect.reason.voided}"`);
    expect(html).toMatch(voidedBox);
    expect(html.match(new RegExp(`aria-label="${zh.multiEngine.collect.selectRow}"`, "g"))).toHaveLength(1);
    const tab = read("src/components/progress/rain-records.tsx");
    expect(tab).toMatch(/pack=\{\{ kind: "PROGRESS", blocked: \(row\) => \(row\.is_voided \? "voided" : null\) \}\}/);
  });
});

describe("the words (JB192)", () => {
  /** Every leaf key under a node, dotted. */
  function keys(node: unknown, prefix = ""): string[] {
    if (typeof node !== "object" || node === null) return [prefix];
    return Object.entries(node).flatMap(([key, value]) => keys(value, prefix ? `${prefix}.${key}` : key));
  }

  it("are the same keys in all four languages, saying 你 not 您", () => {
    const zhKeys = keys(zh.rainRecords).sort();
    for (const messages of [zhTW, en, ms]) expect(keys(messages.rainRecords).sort()).toEqual(zhKeys);
    expect(JSON.stringify(zh.rainRecords)).not.toContain("您");
    expect(JSON.stringify(zhTW.rainRecords)).not.toContain("您");
  });

  it("word the six error codes, the PIN action and the three audit operations", () => {
    const codes = [
      "rain_photos_required",
      "rain_end_not_after_start",
      "rain_record_quota_full",
      "rain_void_reason_required",
      "rain_record_already_voided",
      "rain_rules_out_of_range",
    ];
    for (const messages of [zh, zhTW, en, ms]) {
      const api = messages.errors.api as Record<string, string>;
      for (const code of codes) expect(api[code], code).toBeTruthy();
      expect(messages.signOff.action.rain_record_void).toBeTruthy();
      const operations = messages.audit.operation as Record<string, string>;
      for (const operation of ["rain_record_submitted", "rain_record_voided", "rain_rules_changed"]) {
        expect(operations[operation], operation).toBeTruthy();
      }
    }
  });
});
