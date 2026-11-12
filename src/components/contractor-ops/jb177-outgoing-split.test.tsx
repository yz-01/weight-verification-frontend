/**
 * JB177 (客户 11-12 事项 4, 图 7) - 现场记录中心: 材料出场 stays, and splits in
 * two once pressed. The second paragraph of the client's message, which Lucas
 * chose on 11-12:
 *
 * > 保留现有「材料出场」模块，点击后显示两个分类：
 * > * MO — 供应商退货
 * > * MIN — 材料领用
 * > 各自显示对应记录及数量，原有归档和查看功能不变。
 * > 不需要拆分模块，只完善现有分类筛选。
 *
 * Rendered to static markup like the other screen tests - the runner has no DOM -
 * and the wiring on the screen checked in its source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/archive-queue",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { OUTGOING_KINDS, OutgoingChips, nextOutgoing, outgoingFilter } = await import(
  "@/components/contractor-ops/archive-queue"
);

const ROOT = process.cwd();
const source = readFileSync(path.join(ROOT, "src/components/contractor-ops/archive-queue.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const screen = source.slice(source.indexOf("export function ArchiveQueue()"), source.indexOf("function RecordSheet"));

function render(node: React.ReactNode, messages: typeof zh = zh) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

/** Each button's text and whether it is the one chosen. */
function buttons(html: string) {
  return [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    current: m[1].includes('aria-current="true"'),
  }));
}

describe("the two sub-categories under 材料出场 (JB177-1, JB177-2)", () => {
  it("reads exactly as the client wrote them, each with its own count", () => {
    const html = render(<OutgoingChips value="" counts={{ RETURN: 5, ISSUE: 3 }} onPress={() => {}} />);
    expect(buttons(html)).toEqual([
      { text: "MO — 供应商退货 5", current: false },
      { text: "MIN — 材料领用 3", current: false },
    ]);
    expect(html).toContain('aria-label="材料出场分类"');
  });

  it("marks the one pressed, and shows 0 before the counts arrive", () => {
    const html = render(<OutgoingChips value="ISSUE" counts={{}} onPress={() => {}} />);
    expect(buttons(html)).toEqual([
      { text: "MO — 供应商退货 0", current: false },
      { text: "MIN — 材料领用 0", current: true },
    ]);
  });

  it("pressing one narrows to it; pressing the chosen one again goes back to both", () => {
    expect(nextOutgoing("", "RETURN")).toBe("RETURN");
    expect(nextOutgoing("RETURN", "ISSUE")).toBe("ISSUE");
    expect(nextOutgoing("ISSUE", "ISSUE")).toBe("");
    expect(OUTGOING_KINDS).toEqual(["RETURN", "ISSUE"]);
  });

  it("is asked of the server only while 材料出场 is the module chosen", () => {
    expect(outgoingFilter("MATERIAL_OUTGOING", "RETURN")).toBe("RETURN");
    expect(outgoingFilter("MATERIAL_OUTGOING", "")).toBeUndefined();
    expect(outgoingFilter("", "ISSUE")).toBeUndefined();
    expect(outgoingFilter("HAZARD", "ISSUE")).toBeUndefined();
  });

  it("is worded in all four languages, with the MO — / MIN — prefixes", () => {
    const words = (catalogue: typeof zh) => catalogue.archiveQueue.outgoing;
    expect(words(zh)).toEqual({ label: "材料出场分类", RETURN: "MO — 供应商退货", ISSUE: "MIN — 材料领用" });
    expect(words(zhTW as typeof zh)).toEqual({ label: "材料出場分類", RETURN: "MO — 供應商退貨", ISSUE: "MIN — 材料領用" });
    // The same words each catalogue already uses for the 材料出场 page's tabs.
    for (const catalogue of [zh, zhTW, en, ms] as (typeof zh)[]) {
      const out = words(catalogue);
      expect(out.RETURN).toBe(`MO — ${catalogue.contractorOps.issue.tabReturns}`);
      expect(out.ISSUE).toBe(`MIN — ${catalogue.contractorOps.issue.tabIssues}`);
      expect(out.label.length).toBeGreaterThan(0);
    }
    expect(render(<OutgoingChips value="" counts={{}} onPress={() => {}} />, en as typeof zh)).toContain(
      "MO — Supplier returns",
    );
    expect(render(<OutgoingChips value="" counts={{}} onPress={() => {}} />, ms as typeof zh)).toContain(
      "MIN — Pengeluaran bahan",
    );
  });
});

describe("the screen's wiring (JB177-2, JB177-3)", () => {
  it("shows the second row only while 材料出场 is chosen, under the module chips", () => {
    expect(screen).toContain('{kind === "MATERIAL_OUTGOING" && available.includes("MATERIAL_OUTGOING") && (');
    expect(screen.indexOf("<OutgoingChips")).toBeGreaterThan(screen.indexOf('<nav aria-label={t("modules")}'));
    expect(screen).toContain("counts={query.data?.outgoing_counts ?? {}}");
  });

  it("sends the sub-category with the list, its paging and its export", () => {
    expect(screen).toContain(
      'queryKey: ["archive-queue", state, closure, kind, project, page, waiting, outgoingAsked]',
    );
    // Once in getArchiveQueue's query and once in the export's.
    expect(screen.match(/outgoing: outgoingAsked,/g)).toHaveLength(2);
    expect(screen).toContain("const outgoingAsked = outgoingFilter(kind, outgoing);");
    // Pressing a sub-category goes back to page 1, as every other filter does.
    expect(screen).toContain("onPress={(pressed) => reset(() => setOutgoing((current) => nextOutgoing(current, pressed)))}");
  });

  it("pressing a module chip or 全部模块 starts again from both", () => {
    expect(screen.match(/setOutgoing\(""\);/g)).toHaveLength(2);
  });

  it("leaves the module chips, 全部模块 and the rows as they were", () => {
    // 材料出场 keeps its name and its total (MO and MIN together).
    expect(screen).toContain("{t(`kind.${row}`)}");
    expect(screen).toContain("{counts[row] ?? 0}");
    expect(screen).toContain('{t("allModules")}');
    // 所属模块 is still the record's own module name.
    expect(screen).toContain("{t(`kind.${recordKindKey(row)}` as never)}");
    expect(zh.archiveQueue.kind.MATERIAL_OUTGOING).toBe("材料出场");
  });
});
