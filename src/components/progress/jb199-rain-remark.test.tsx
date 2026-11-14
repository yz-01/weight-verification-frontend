/**
 * JB199 (客户 11-14) - 「意见 / 备注」 on a rain record and on the month's report.
 *
 * > 两种都支持填写意见备注
 *
 * A: the record window's rain block has its 「意见 / 备注」 - a box and
 * 【保存】 for whoever may void (the same rule as 【作废】), the text or
 * 「还没有填写。」 for everybody else, and who wrote it when.
 * B (Lucas: 「加给他吧」): the 月报 block has 「这个月的意见 / 备注」 above the
 * four file buttons - for a month, not for a date range.
 *
 * Rendered to static markup like the JB192 / JB198 tests (the runner has no
 * DOM); the wiring is read in the source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const state = vi.hoisted(() => ({ can: true, search: "project=p-1&month=2026-11" }));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Office", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => (code === "progress.confirm" ? state.can : true),
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

const { RainRecordsTab, RainRemarkBlock, RainMonthRemarkBox, useRainFacts } = await import(
  "@/components/progress/rain-records"
);
const { RAIN_RECORDS_KEY } = await import("@/services/rain-records.service");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

type Messages = typeof zh;

function render(node: React.ReactNode, seed: (qc: QueryClient) => void = () => {}, messages: Messages = zh, locale = "zh") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const RECORD = {
  id: "r-1",
  record_no: "PG-PRJ-0003-009",
  project: "p-1",
  project_name: "Site A",
  phase: "ph-rain",
  phase_name: "Rainy Weather",
  percent_complete: null,
  description: "Rainy Weather 14:05–15:10 (1h 05m)",
  status: "SUBMITTED",
  captured_at: "2026-11-14T06:05:00Z",
  uploaded_at: "2026-11-14T07:11:00Z",
  submitted_by_name: "Ali",
  photos: [],
  is_rain: true,
  rain_started_at: "2026-11-14T06:05:00Z",
  rain_ended_at: "2026-11-14T07:10:00Z",
  rain_minutes: 65,
  is_voided: false,
  voided_at: null,
  voided_by_name: null,
  void_reason: "",
  rain_remark: "",
  rain_remark_by_name: "",
  rain_remark_at: null,
} as unknown as SiteProgressRecord;

const WRITTEN = {
  ...RECORD,
  rain_remark: "can not work heavy rain",
  rain_remark_by_name: "Lucas",
  rain_remark_at: "2026-11-14T03:30:00Z",
} as SiteProgressRecord;

function Facts({ record }: { record: SiteProgressRecord }) {
  const facts = useRainFacts(record);
  return (
    <dl>
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

describe("a rain record's 「意见 / 备注」 in its window (JB199-1, JB199-2)", () => {
  it("sits under the rain details: start, stop, duration, then 意见 / 备注, as wide as the window", () => {
    state.can = true;
    const html = render(<Facts record={WRITTEN} />);
    const shown = text(html);
    expect(shown.indexOf("时长")).toBeLessThan(shown.indexOf("意见 / 备注"));
    expect(html).toContain('data-slot="rain-remark"');
    const source = read("src/components/progress/rain-records.tsx");
    expect(source).toMatch(/label: t\("remark\.label"\),\s*value: <RainRemarkBlock key=\{record\.id\} record=\{record\} onSaved=\{onRemarkSaved\} \/>,\s*wide: true/);
  });

  it("gives whoever may void a box with the text, the placeholder and 【保存】 - still while nothing changed", () => {
    state.can = true;
    const html = render(<RainRemarkBlock record={WRITTEN} onSaved={() => {}} />);
    expect(html).toContain("<textarea");
    expect(html).toContain("can not work heavy rain");
    expect(html).toContain(`placeholder="${zh.rainRecords.remark.placeholder}"`);
    expect(html).toContain('maxLength="1000"');
    expect(html).toMatch(/<button[^>]*data-slot="rain-remark-save"[^>]*disabled=""/);
    expect(text(html)).toContain("保存");
    // Who wrote it, when (Malaysian time).
    expect(text(html)).toContain("Lucas 于 2026-11-14 11:30 填写");
  });

  it("an empty one for a writer: the box, no 「谁填的」 line", () => {
    state.can = true;
    const html = render(<RainRemarkBlock record={RECORD} onSaved={() => {}} />);
    expect(html).toContain("<textarea");
    expect(html).not.toContain('data-slot="rain-remark-by"');
  });

  it("everybody else reads the text and who wrote it - no box, no button", () => {
    state.can = false;
    const html = render(<RainRemarkBlock record={WRITTEN} onSaved={() => {}} />);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('data-slot="rain-remark-save"');
    expect(text(html)).toContain("can not work heavy rain");
    expect(text(html)).toContain("Lucas 于 2026-11-14 11:30 填写");
    const empty = render(<RainRemarkBlock record={RECORD} onSaved={() => {}} />);
    expect(text(empty)).toContain("还没有填写。");
    expect(empty).not.toContain('data-slot="rain-remark-by"');
    state.can = true;
  });

  it("a cleared one reads as never written, though the server says who cleared it", () => {
    state.can = false;
    const cleared = { ...WRITTEN, rain_remark: "" } as SiteProgressRecord;
    const html = render(<RainRemarkBlock record={cleared} onSaved={() => {}} />);
    expect(text(html)).toContain("还没有填写。");
    expect(html).not.toContain('data-slot="rain-remark-by"');
    state.can = true;
  });

  it("any other progress record has none (JB199-8)", () => {
    state.can = true;
    const plain = { ...RECORD, is_rain: false, rain_started_at: null } as SiteProgressRecord;
    expect(render(<Facts record={plain} />)).toBe("<dl></dl>");
  });

  it("saves the trimmed text, stays open on the answer and reads the lists again as a void does", () => {
    const source = read("src/components/progress/rain-records.tsx");
    const block = source.slice(source.indexOf("export function RainRemarkBlock"), source.indexOf("export function RainMonthRemarkBox"));
    expect(block).toContain("mutationFn: () => setRainRemark(record.id, text)");
    expect(block).toContain("disabled={save.isPending || text.trim() === stored}");
    expect(block).toMatch(/invalidateQueries\(\{ queryKey: \[\.\.\.RAIN_RECORDS_KEY\] \}\)/);
    expect(block).toMatch(/invalidateQueries\(\{ queryKey: \["site-progress"\] \}\)/);
    expect(block).toMatch(/invalidateQueries\(\{ queryKey: \["evidence-packages"\] \}\)/);
    expect(block).toContain("onSaved(fresh)");
    // The same people as 【作废】: whoever confirms progress, on a rain record.
    expect(source).toContain('return Boolean(record.is_rain || record.rain_started_at) && can("progress.confirm");');
    expect(source).toContain('|| record.is_voided || !can("progress.confirm")) return null;');
    expect(block).toContain("if (!mayWriteRainRemark(record, can))");
    const lists = read("src/components/contractor-ops/office-module-lists.tsx");
    expect(lists).toMatch(/useRainFacts\(shown, \(fresh\) => \{\s*onShow\(fresh\);\s*refreshProgress\(\);\s*\}\)/);
  });
});

const MONTH_KEY = [...RAIN_RECORDS_KEY, "month-remark", "p-1", "2026-11"];

function seedTab(qc: QueryClient) {
  qc.setQueryData([...RAIN_RECORDS_KEY, "rules"], { limit: 5, minutes: 30, can_change: true });
  qc.setQueryData([...RAIN_RECORDS_KEY, "summary", "p-1", { month: "2026-11" }], {
    project: "p-1",
    from: "2026-11-01",
    to: "2026-11-30",
    times: 2,
    days: 1,
    minutes: 21,
    records: 2,
    voided: 0,
    daily: [{ date: "2026-11-14", times: 2, minutes: 21, records: 2 }],
    periods: [],
  });
  qc.setQueryData(
    [...RAIN_RECORDS_KEY, "list", { page: 1, page_size: 25, project: "p-1", month: "2026-11" }, { month: "2026-11" }],
    { count: 1, results: [RECORD] },
  );
  qc.setQueryData(MONTH_KEY, {
    project: "p-1",
    month: "2026-11",
    remark: "本月因下雨停工 5 天。",
    by_name: "Lucas",
    at: "2026-11-14T04:00:00Z",
  });
}

describe("the month's 「意见 / 备注」 on the 月报 block (JB199-9, JB199-11)", () => {
  it("is above the four file buttons when a project and a month are chosen", () => {
    state.can = true;
    state.search = "project=p-1&month=2026-11";
    const html = render(<RainRecordsTab />, seedTab);
    expect(html).toContain('data-slot="rain-month-remark"');
    expect(html.indexOf('data-slot="rain-month-remark"')).toBeLessThan(html.indexOf('data-slot="rain-pdf"'));
    const shown = text(html);
    expect(shown).toContain("这个月的意见 / 备注");
    expect(shown).toContain("会印在这个月的月报 PDF 上。");
    expect(html).toContain("本月因下雨停工 5 天。");
    expect(html).toContain(`placeholder="${zh.rainRecords.monthRemark.placeholder}"`);
    expect(html).toContain('maxLength="2000"');
    expect(html).toMatch(/<button[^>]*data-slot="rain-month-remark-save"[^>]*disabled=""/);
    expect(shown).toContain("Lucas 于 2026-11-14 12:00 填写");
  });

  it("is not there for a date range, nor without a project", () => {
    state.search = "project=p-1&date_from=2026-11-01&date_to=2026-11-09";
    const range = render(<RainRecordsTab />, seedTab);
    expect(range).not.toContain('data-slot="rain-month-remark"');
    expect(range).toContain('data-slot="rain-pdf-need"');
    state.search = "month=2026-11";
    expect(render(<RainRecordsTab />, seedTab)).not.toContain('data-slot="rain-month-remark"');
    state.search = "project=p-1&month=2026-11";
  });

  it("everybody else reads it - no box, no button; nothing written says so", () => {
    state.can = false;
    const html = render(<RainMonthRemarkBox project="p-1" month="2026-11" />, seedTab);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('data-slot="rain-month-remark-save"');
    expect(text(html)).toContain("本月因下雨停工 5 天。");
    const empty = render(<RainMonthRemarkBox project="p-1" month="2026-11" />, (qc) =>
      qc.setQueryData(MONTH_KEY, { project: "p-1", month: "2026-11", remark: "", by_name: "", at: null }),
    );
    expect(text(empty)).toContain("还没有填写。");
    state.can = true;
  });

  it("each project and month is its own: read by both, kept by both, the box made anew for each", () => {
    const source = read("src/components/progress/rain-records.tsx");
    expect(source).toContain('<RainMonthRemarkBox key={`${project}:${period.month}`} project={project} month={period.month} />');
    expect(source).toContain('const key = [...RAIN_RECORDS_KEY, "month-remark", project, month];');
    expect(source).toContain("queryFn: () => getRainMonthRemark({ project, month })");
    expect(source).toContain("mutationFn: () => setRainMonthRemark({ project: remark.project, month: remark.month, remark: text })");
    expect(source).toContain("queryClient.setQueryData(queryKey, saved)");
    // A failed read says so, as its neighbours do.
    expect(source).toContain('<QueryFailedNote query={remark} what={t("monthRemark.label")} />');
  });

  it("reads in every language", () => {
    state.can = true;
    for (const [messages, locale, label] of [
      [en, "en", "Remarks for this month"],
      [ms, "ms", "Catatan untuk bulan ini"],
      [zhTW, "zh-TW", "這個月的意見 / 備註"],
    ] as const) {
      const html = render(<RainMonthRemarkBox project="p-1" month="2026-11" />, seedTab, messages as unknown as Messages, locale);
      expect(text(html)).toContain(label);
    }
  });
});

describe("the words (JB199)", () => {
  it("rainRecords.remark in four languages, exactly as the spec", () => {
    expect(zh.rainRecords.remark).toEqual({
      label: "意见 / 备注",
      placeholder: "例如：雨太大，全部停工。",
      save: "保存",
      saved: "意见 / 备注已保存。",
      by: "{name} 于 {at} 填写",
      empty: "还没有填写。",
    });
    expect(zhTW.rainRecords.remark).toEqual({
      label: "意見 / 備註",
      placeholder: "例如：雨太大，全部停工。",
      save: "保存",
      saved: "意見 / 備註已保存。",
      by: "{name} 於 {at} 填寫",
      empty: "還沒有填寫。",
    });
    expect(en.rainRecords.remark).toEqual({
      label: "Remarks",
      placeholder: "For example: heavy rain, all work stopped.",
      save: "Save",
      saved: "Remarks saved.",
      by: "Written by {name} on {at}",
      empty: "Nothing written yet.",
    });
    expect(ms.rainRecords.remark).toEqual({
      label: "Catatan",
      placeholder: "Contoh: hujan lebat, semua kerja dihentikan.",
      save: "Simpan",
      saved: "Catatan disimpan.",
      by: "Ditulis oleh {name} pada {at}",
      empty: "Belum ditulis.",
    });
  });

  it("rainRecords.monthRemark in four languages, exactly as the spec", () => {
    expect(zh.rainRecords.monthRemark).toEqual({
      label: "这个月的意见 / 备注",
      placeholder: "例如：本月因下雨停工 5 天。",
      hint: "会印在这个月的月报 PDF 上。",
    });
    expect(zhTW.rainRecords.monthRemark).toEqual({
      label: "這個月的意見 / 備註",
      placeholder: "例如：本月因下雨停工 5 天。",
      hint: "會印在這個月的月報 PDF 上。",
    });
    expect(en.rainRecords.monthRemark).toEqual({
      label: "Remarks for this month",
      placeholder: "For example: work stopped for 5 days this month because of rain.",
      hint: "Printed on this month's report PDF.",
    });
    expect(ms.rainRecords.monthRemark).toEqual({
      label: "Catatan untuk bulan ini",
      placeholder: "Contoh: kerja terhenti 5 hari bulan ini kerana hujan.",
      hint: "Dicetak pada PDF laporan bulan ini.",
    });
  });

  it("the package readers' field and the two audit operations", () => {
    const field = { zh: "意见 / 备注", "zh-TW": "意見 / 備註", en: "Remarks", ms: "Catatan" };
    const record = {
      zh: "填写雨天记录的意见 / 备注",
      "zh-TW": "填寫雨天記錄的意見 / 備註",
      en: "Wrote a rain record's remarks",
      ms: "Menulis catatan rekod hujan",
    };
    const month = {
      zh: "填写雨天月报的意见 / 备注",
      "zh-TW": "填寫雨天月報的意見 / 備註",
      en: "Wrote the rain report's monthly remarks",
      ms: "Menulis catatan bulanan laporan hujan",
    };
    for (const [locale, messages] of [
      ["zh", zh],
      ["zh-TW", zhTW],
      ["en", en],
      ["ms", ms],
    ] as const) {
      const fields = messages.mySubmissions.field as Record<string, string>;
      const operations = messages.audit.operation as Record<string, string>;
      expect(fields.rain_remark).toBe(field[locale]);
      expect(operations.rain_remark_set).toBe(record[locale]);
      expect(operations.rain_month_remark_set).toBe(month[locale]);
    }
  });
});
