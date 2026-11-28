/**
 * JB302 (客户 11-28e): a linked record counted by its MR's 材料、规格及单位, and
 * 「归档前的规格核对」.
 *
 * 「材料退场记录既然已经关联指定的 MR，系统就必须按照该 MR 对应的材料名称、规格及单位进行归类统计。」
 * 「如截图所示，材料 111 已关联 MR-PRJ-0003-006，退货数量 1 包应归入对应的 T001 规格，而不是独立产生
 * 一条没有 MR 批准数量的记录。」
 * 「请完善关联逻辑及归档前的规格核对，确保申请累计统计准确。」
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { RecordRequestLinks, RequestLinkedRecords, SpecMatch } from "@/interfaces/material-request-link";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-office", full_name: "Office", is_field_staff: false },
    can: () => true,
  }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/material-outgoing",
}));

const { RecordRequestLinksPanel, RequestLinkedRecordsPanel } = await import(
  "@/components/material-requests/request-links"
);
const { RecordClosurePanel, recordClosureKey } = await import("@/components/shared/record-closure");
const { recordRequestLinksKey, requestLinkedRecordsKey } = await import(
  "@/services/material-request-link.service"
);

const words = zh.jb302;

function render(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "active"], []);
  client.setQueryData(["material-units", "all"], []);
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const t001 = {
  id: "line-1", request: "mr-6", request_no: "MR-PRJ-0003-006", position: 1,
  material_name: "111", specification: "T 001", unit: "BAG", quantity: "300.000",
};

function match(overrides: Partial<SpecMatch> = {}): SpecMatch {
  return {
    target: "outgoing", id: "mo-16", position: 1, material_name: "111", specification: "", unit: "BAG",
    quantity: "1.000", state: "auto", unsettled: false, request_line: t001, options: [t001], ...overrides,
  };
}

function links(overrides: Partial<RecordRequestLinks> = {}): RecordRequestLinks {
  return {
    kind: "MATERIAL_OUTGOING", record: "mo-16", project: "p-3", reference: "MO-PRJ-0003-016",
    archived: false, missing: false, may_change: true,
    links: [{
      id: "mr-6", request_no: "MR-PRJ-0003-006", request_type: "MATERIAL", request_kind_name: "", subject: "",
      material_name: "111", specification: "T 001", quantity: "300.000", unit: "BAG",
      lines: [{ material_name: "111", specification: "T 001", quantity: "300.000", unit: "BAG" }],
      status: "APPROVED", execution_status: "IN_PROGRESS", created_at: "2026-11-28T02:00:00Z", project: "p-3",
      linked_at: "2026-11-28T02:49:00Z", linked_by_name: "mike",
    }],
    matches: [match()],
    spec_unmatched: false,
    ...overrides,
  };
}

const panel = (data: RecordRequestLinks) =>
  render(<RecordRequestLinksPanel kind="MATERIAL_OUTGOING" recordId="mo-16" />, (client) =>
    client.setQueryData(recordRequestLinksKey("MATERIAL_OUTGOING", "mo-16"), data),
  );

describe("「退货数量 1 包应归入对应的 T001 规格」: the record's card says where it is counted", () => {
  it("shows what the record says and the MR line it is counted under", () => {
    const html = panel(links());
    expect(html).toContain(words.title);
    expect(html).toContain('data-slot="spec-check"');
    expect(html).toContain(words.recorded);
    expect(html).toContain(words.noSpec);
    expect(html).toContain(words.countedUnder);
    expect(html).toContain("MR-PRJ-0003-006 · 111 T 001 300.000");
    expect(html).toContain(words.state.auto);
    expect(html).toContain(words.explain.auto);
    expect(html).not.toContain(words.unsettled);
  });

  it("asks the office to choose when the 规格 differs, and says the archive waits", () => {
    const html = panel(
      links({ spec_unmatched: true, matches: [match({ specification: "T 002", state: "pick", unsettled: true, request_line: null })] }),
    );
    expect(html).toContain(words.unsettled);
    expect(html).toContain(words.state.pick);
    expect(html).toContain(words.explain.pick);
    expect(html).toContain(words.choose);
    expect(html).toContain('data-spec-match="pick"');
  });

  it("tells a reader who cannot choose who must", () => {
    const html = panel(
      links({
        may_change: false,
        spec_unmatched: true,
        matches: [match({ state: "pick", unsettled: true, request_line: null })],
      }),
    );
    expect(html).toContain(words.unsettledReadOnly);
    expect(html).not.toContain(words.choose);
  });

  it("explains another unit and offers no choice", () => {
    const html = panel(
      links({ spec_unmatched: true, matches: [match({ unit: "KG", state: "unit", unsettled: true, request_line: null, options: [] })] }),
    );
    expect(html).toContain(words.state.unit);
    expect(html).toContain(words.explain.unit);
    expect(html).not.toContain(words.choose);
  });

  it("archived: nothing to change", () => {
    const html = panel(links({ archived: true, matches: [match({ state: "chosen" })] }));
    expect(html).toContain(words.state.chosen);
    expect(html).not.toContain(words.change);
  });

  it("no section without a link", () => {
    const html = panel(links({ links: [], missing: true, matches: [] }));
    expect(html).not.toContain(words.title);
  });
});

describe("「归档前的规格核对」: the 确认归档 button", () => {
  it("a 领用 (no checklist) says why it stays off", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_OUTGOING" recordId="mo-16" />, (client) =>
      client.setQueryData(recordClosureKey("MATERIAL_OUTGOING", "mo-16"), {
        kind: "MATERIAL_OUTGOING", record: "mo-16", ready: true, closed: false,
        mr_link_missing: false, mr_spec_unmatched: true, closure: null,
      }),
    );
    expect(html).toContain(words.archiveBlocked);
    expect(html).toContain("data-record-closure-blocked");
  });

  it("a 进场 / 退场 lists it inside 「以下必填资料不完整」", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_OUTGOING" recordId="mo-16" />, (client) =>
      client.setQueryData(recordClosureKey("MATERIAL_OUTGOING", "mo-16"), {
        kind: "MATERIAL_OUTGOING", record: "mo-16", ready: true, closed: false,
        mr_link_missing: false, mr_spec_unmatched: true, closure: null, checklist: true, missing: ["mr_spec"],
      }),
    );
    expect(html).toContain(zh.jb276.missing.mr_spec);
    expect(html).not.toContain(words.archiveBlocked);
  });
});

describe("the MR's page shows a linked record counted under its line", () => {
  it("says which 规格 it is counted as", () => {
    const data: RequestLinkedRecords = {
      request: "mr-6", request_no: "MR-PRJ-0003-006", request_type: "MATERIAL",
      records: [{
        kind: "RETURN", record_kind: "MATERIAL_OUTGOING", id: "mo-16", reference: "MO-PRJ-0003-016",
        date: "2026-11-28T02:37:00Z", status: "COMPLETED", counted: true,
        materials: [{
          material_name: "111", specification: "", unit: "BAG", quantity: "1.000", applied_quantity: null, in_request: true,
          counted_as: { request_no: "MR-PRJ-0003-006", material_name: "111", specification: "T 001", unit: "BAG" },
        }],
      }],
      totals: [],
    };
    const html = render(<RequestLinkedRecordsPanel requestId="mr-6" />, (client) =>
      client.setQueryData(requestLinkedRecordsKey("mr-6"), data),
    );
    expect(html).toContain("按 MR 的 T 001 ·");
    expect(html).not.toContain(zh.jb279.records.notInRequest);
  });
});

describe("every language has the words", () => {
  it("jb302, the checklist line and both refusals", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(Object.keys(messages.jb302).sort()).toEqual(Object.keys(zh.jb302).sort());
      expect(Object.keys(messages.jb302.state).sort()).toEqual(Object.keys(zh.jb302.state).sort());
      expect(Object.keys(messages.jb302.explain).sort()).toEqual(Object.keys(zh.jb302.explain).sort());
      expect(messages.jb276.missing.mr_spec).toBeTruthy();
      expect(messages.errors.api.material_request_spec_unmatched).toContain("{reference}");
      expect(messages.errors.api.material_request_spec_choice_invalid).toBeTruthy();
    }
  });
});
