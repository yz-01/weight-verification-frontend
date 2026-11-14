/**
 * JB198 (客户 11-14) - a voided rain record is deleted, no trace.
 *
 * > 雨天记录已作废的记录，直接删除，不留痕迹
 *
 * The list loses its 状态 column, its status filter and the statistics'
 * 「已作废 N 份」; the 【作废】 confirmation says the record will be deleted;
 * after a void the record window closes and the list and statistics are read
 * again. Rendered to static markup like the JB192 tests (the runner has no
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

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams("project=p-1&month=2026-11"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Office", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
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

const { RainRecordsTab, RainVoidDialog } = await import("@/components/progress/rain-records");
const { RAIN_RECORDS_KEY } = await import("@/services/rain-records.service");
const { TooltipProvider } = await import("@/components/ui/tooltip");

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

const RECORD = {
  id: "r-1",
  record_no: "PG-PRJ-0003-021",
  project: "p-1",
  project_name: "Site A",
  phase: "ph-rain",
  phase_name: "Rainy Weather",
  percent_complete: null,
  description: "Rainy Weather 14:05–15:10 (1h 05m)",
  status: "SUBMITTED",
  captured_at: "2026-11-13T06:05:00Z",
  uploaded_at: "2026-11-13T07:11:00Z",
  submitted_by_name: "Ali",
  photos: [],
  is_rain: true,
  rain_started_at: "2026-11-13T06:05:00Z",
  rain_ended_at: "2026-11-13T07:10:00Z",
  rain_minutes: 65,
  is_voided: false,
  voided_at: null,
  voided_by_name: null,
  void_reason: "",
} as unknown as SiteProgressRecord;

function seedTab(qc: QueryClient) {
  qc.setQueryData([...RAIN_RECORDS_KEY, "rules"], { limit: 5, minutes: 30, can_change: true });
  // An older server could still say a number: it is not drawn.
  qc.setQueryData([...RAIN_RECORDS_KEY, "summary", "p-1", { month: "2026-11" }], {
    project: "p-1",
    from: "2026-11-01",
    to: "2026-11-30",
    times: 1,
    days: 1,
    minutes: 65,
    records: 1,
    voided: 3,
    daily: [{ date: "2026-11-13", times: 1, minutes: 65, records: 1 }],
    periods: [],
  });
  qc.setQueryData(
    [...RAIN_RECORDS_KEY, "list", { page: 1, page_size: 25, project: "p-1", month: "2026-11" }, { month: "2026-11" }],
    { count: 1, results: [RECORD] },
  );
}

describe("the list has no 「已作废」 (JB198-2)", () => {
  it("draws no 状态 column, no status filter and no 「已作废 N 份」", () => {
    const html = render(<RainRecordsTab />, seedTab);
    const shown = text(html);
    expect(shown).toContain("PG-021");
    expect(html).toMatch(/data-stat="records"[\s\S]*?1 份/);
    expect(html).not.toContain('data-stat="voided"');
    expect(shown).not.toContain("已作废");
    expect(shown).not.toContain("状态");
    expect(shown).not.toContain("全部状态");
    expect(shown).not.toContain("3 份");
  });

  it("asks the server for no `voided` filter and draws no status column or badge in the list", () => {
    const tab = read("src/components/progress/rain-records.tsx");
    expect(tab).toMatch(/useListQuery\(\["project", "month", "date_from", "date_to"\]\)/);
    expect(tab).not.toContain('param="voided"');
    expect(tab).not.toContain('id: "status"');
    expect(tab).not.toContain('"record_no", "status"');
    expect(tab).not.toContain('key: "voided"');
    expect(tab).not.toMatch(/t\("(column\.status|filter\.allStates|filter\.voided|summary\.voided|record\.voided\w*|record\.voidReason|void\.help)"\)/);
  });
});

describe("【作废】 deletes it (JB198-1, JB198-5)", () => {
  it("the confirmation says the record will be deleted, for good", () => {
    const html = render(<RainVoidDialog record={RECORD} onClose={() => {}} onVoided={() => {}} />);
    expect(html).toContain("作废后这笔记录会直接删除，清单、统计和月报里都不会再有，不能恢复。");
    expect(html).toContain('data-slot="rain-void-gone"');
    // The reason and the PIN are asked as before.
    expect(html).toContain(zh.rainRecords.void.reason);
    expect(html).toContain(zh.rainRecords.void.pin);
    expect(html).toContain(zh.rainRecords.void.confirm);
    // The JB192 sentence 「记录还在，标「已作废」」 is not said any more.
    expect(html).not.toContain("记录还在");
  });

  it("after a void the window closes, and the list and the statistics are read again", () => {
    const tab = read("src/components/progress/rain-records.tsx");
    const dialog = tab.slice(tab.indexOf("export function RainVoidDialog"));
    expect(dialog).toMatch(/invalidateQueries\(\{ queryKey: \[\.\.\.RAIN_RECORDS_KEY\] \}\)/);
    expect(dialog).toMatch(/invalidateQueries\(\{ queryKey: \["site-progress"\] \}\)/);
    expect(dialog).toMatch(/invalidateQueries\(\{ queryKey: \["evidence-packages"\] \}\)/);
    const lists = read("src/components/contractor-ops/office-module-lists.tsx");
    const recordWindow = lists.slice(
      lists.indexOf("export function ProgressRecordDialog"),
      lists.indexOf("async function getProgressRecord"),
    );
    expect(recordWindow).toMatch(/<RainVoidButton\s+record=\{shown\}\s+onVoided=\{\(\) => \{\s*refreshProgress\(\);\s*onClose\(\);\s*\}\}/);
    // The rain tab's window is that window, closed by `onClose`.
    expect(tab).toMatch(/onClose=\{\(\) => setViewing\(null\)\}/);
  });
});

describe("the words (JB198)", () => {
  it("say the new sentence in four languages, exactly", () => {
    expect(zh.rainRecords.voidGone).toBe("作废后这笔记录会直接删除，清单、统计和月报里都不会再有，不能恢复。");
    expect(zhTW.rainRecords.voidGone).toBe("作廢後這筆記錄會直接刪除，清單、統計和月報裡都不會再有，不能恢復。");
    expect(en.rainRecords.voidGone).toBe(
      "Once voided, this record is deleted. It will no longer be in the list, the totals or the monthly report, and it cannot be brought back.",
    );
    expect(ms.rainRecords.voidGone).toBe(
      "Selepas dibatalkan, rekod ini dipadam terus. Ia tidak lagi ada dalam senarai, jumlah atau laporan bulanan, dan tidak boleh dikembalikan.",
    );
  });

  it("no longer hold the status, the filter, the count or the voided block, nor 「已作废」 on the tab", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const group = messages.rainRecords as Record<string, Record<string, unknown> | string>;
      const section = (name: string) => group[name] as Record<string, unknown>;
      expect(section("column")).not.toHaveProperty("status");
      expect(section("filter")).not.toHaveProperty("allStates");
      expect(section("filter")).not.toHaveProperty("voided");
      expect(section("summary")).not.toHaveProperty("voided");
      for (const key of ["voided", "voidedBy", "voidedAt", "voidReason"]) expect(section("record")).not.toHaveProperty(key);
      expect(section("void")).not.toHaveProperty("help");
    }
    expect(zh.rainRecords.summary.hint).not.toContain("作废");
    expect(zhTW.rainRecords.summary.hint).not.toContain("作廢");
    expect(en.rainRecords.summary.hint).not.toMatch(/void/i);
    expect(ms.rainRecords.summary.hint).not.toContain("dibatalkan");
  });
});
