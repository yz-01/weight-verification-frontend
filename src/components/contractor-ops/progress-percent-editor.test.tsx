/**
 * The office corrects a progress record's 实际完成比例 (2026-10-09).
 *
 * Lucas: 「弄成可以修改百分比的吧，不然很乱不会用」. A pencil beside the figure
 * in the detail opens the form in place; a reason is required; every change is
 * listed (old → new, who, when, why); the list shows a small 「已修改」.
 *
 * The runner has no DOM, so screens are rendered to static markup.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { SiteProgressRecord } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const post = vi.hoisted(() => vi.fn(async () => ({ id: "r1" })));
vi.mock("@/services/api-client", () => ({
  api: { post, get: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn() },
  download: vi.fn(),
  fetchAsFile: vi.fn(),
  fetchObjectUrl: vi.fn(),
  toastSuccess: vi.fn(),
}));

const {
  EditedTag,
  ProgressCorrectionHistory,
  ProgressPercentFact,
  percentProblem,
  wasCorrected,
} = await import("@/components/contractor-ops/progress-percent-editor");
const { correctProgressPercent } = await import("@/services/contractor-ops.service");

function record(extra: Partial<SiteProgressRecord> = {}): SiteProgressRecord {
  return {
    id: "r1",
    project: "p1",
    project_name: "Tower A",
    phase: "ph1",
    phase_name: "Slab",
    percent_complete: "40.00",
    category: null,
    category_name: null,
    category_code: null,
    description: "",
    status: "SUBMITTED",
    captured_at: "2026-10-09T02:00:00Z",
    uploaded_at: "2026-10-09T02:00:00Z",
    latitude: "3.1390000",
    longitude: "101.6869000",
    submitted_by_name: "Ali",
    confirmed_by_name: null,
    confirmed_at: null,
    review_note: "",
    photos: [],
    remarks: [],
    archived: false,
    corrections: [],
    ...extra,
  } as SiteProgressRecord;
}

const corrected = record({
  percent_complete: "55.00",
  corrections: [
    {
      id: "c1",
      old_percent: "40.00",
      new_percent: "55.00",
      reason: "Site typed 40 for 55",
      author_name: "Ong Office",
      created_at: "2026-10-09T03:00:00Z",
    },
  ],
});

function render(node: React.ReactNode, messages: Record<string, unknown> = zh) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const fact = (props: Partial<React.ComponentProps<typeof ProgressPercentFact>> = {}) =>
  render(
    <ProgressPercentFact
      record={record()}
      canEdit
      editing={false}
      onEditingChange={() => {}}
      onSaved={() => {}}
      {...props}
    />,
  );

describe("what may replace the figure", () => {
  it("is 0 to 100", () => {
    expect(percentProblem("101", "40.00")).toBe("range");
    expect(percentProblem("-1", "40.00")).toBe("range");
    expect(percentProblem("abc", "40.00")).toBe("range");
    expect(percentProblem("0", "40.00")).toBeNull();
    expect(percentProblem("100", "40.00")).toBeNull();
    expect(percentProblem("55.5", "40.00")).toBeNull();
  });

  it("is not the figure it already is", () => {
    expect(percentProblem("40", "40.00")).toBe("unchanged");
    expect(percentProblem("40.001", "40.00")).toBe("unchanged");
  });

  it("an empty box is the required-field rule's, not a range error", () => {
    expect(percentProblem("  ", "40.00")).toBeNull();
  });
});

describe("the figure in the detail", () => {
  it("has a pencil for the office", () => {
    const html = fact();
    expect(html).toContain("40.00%");
    expect(html).toContain("data-progress-percent-edit");
    expect(html).toContain(zh.contractorOps.progress.correction.edit);
  });

  it("has no pencil for somebody who may not correct it", () => {
    const html = fact({ canEdit: false });
    expect(html).toContain("40.00%");
    expect(html).not.toContain("data-progress-percent-edit");
  });

  it("opens into the form: new figure and a required reason, the save held until both are there", () => {
    const html = fact({ editing: true });
    expect(html).toContain("data-progress-percent-form");
    expect(html).toContain(zh.contractorOps.progress.correction.newPercent);
    expect(html).toContain(zh.contractorOps.progress.correction.reason);
    expect(html).toContain(zh.contractorOps.progress.correction.evidenceNote);
    // The reason is empty, so the save is disabled and says why.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*保存修改/);
  });

  it("on an archived record says only the figure changes and the evidence stays locked", () => {
    const html = fact({ editing: true, record: record({ archived: true, status: "CONFIRMED" }) });
    expect(html).toContain(zh.contractorOps.progress.correction.archivedNote);
  });

  it("a corrected figure carries the 已修改 tag", () => {
    expect(wasCorrected(corrected)).toBe(true);
    expect(wasCorrected(record())).toBe(false);
    const html = fact({ record: corrected });
    expect(html).toContain(zh.contractorOps.progress.correction.edited);
    expect(render(<EditedTag />)).toContain("已修改");
  });
});

describe("the history", () => {
  it("lists each change: old → new, why, who and when", () => {
    const html = render(<ProgressCorrectionHistory corrections={corrected.corrections!} />);
    expect(html).toContain("data-progress-corrections");
    expect(html).toContain("40.00% → 55.00%");
    expect(html).toContain("Site typed 40 for 55");
    expect(html).toContain("Ong Office");
    expect(html).toContain(zh.contractorOps.progress.correction.historyTitle);
  });

  it("shows nothing when the figure was never corrected", () => {
    expect(render(<ProgressCorrectionHistory corrections={[]} />)).toBe("");
  });
});

describe("the request", () => {
  it("sends the figure and the reason to correct_percent", async () => {
    await correctProgressPercent("r1", "55", "Site typed 40 for 55");
    expect(post).toHaveBeenCalledWith("/api/site-progress/r1/correct_percent/", {
      percent_complete: "55",
      reason: "Site typed 40 for 55",
    });
  });
});

describe("the words", () => {
  it("are in all four languages, with the server's two field codes", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const words = messages.contractorOps.progress.correction as Record<string, string>;
      for (const key of [
        "edit", "newPercent", "was", "reason", "reasonPlaceholder", "save", "cancel",
        "range", "unchanged", "evidenceNote", "archivedNote", "edited", "historyTitle",
        "change", "by",
      ]) {
        expect(words[key], key).toBeTruthy();
      }
      const field = messages.errors.field as Record<string, string>;
      expect(field.percent_range).toBeTruthy();
      expect(field.percent_unchanged).toBeTruthy();
    }
  });
});
