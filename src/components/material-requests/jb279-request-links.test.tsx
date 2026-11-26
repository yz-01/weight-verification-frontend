/**
 * JB279 (客户 11-26 事项 20): 材料进场 / 材料退场 / 材料领用 linked to their MR / 其他申请.
 *
 * 「材料进场、材料退场及材料领用，必须能够选择并关联本项目对应的 MR／其他申请记录。」
 * 「同一申请允许关联多笔材料记录。」
 * 「在 MR／其他申请页面，可以查看所有已关联的材料进场、退场及领用记录，并点击查看原始资料。」
 * 「未完成关联，不允许确认归档。」
 * 「所有关联记录必须保持项目权限隔离。」
 * 「数量统计方面，材料进场数量与 MR 申请数量进行对比，材料退场及材料领用数量保持独立统计，不互相扣减。」
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  LinkableRequest,
  RecordRequestLinks,
  RequestLinkedRecords,
} from "@/interfaces/material-request-link";
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
  usePathname: () => "/material-requests",
}));

const {
  RecordRequestLinksPanel,
  RequestLinkPicker,
  RequestLinkedRecordsPanel,
  linkedRecordHref,
} = await import("@/components/material-requests/request-links");
const { RecordClosurePanel, recordClosureKey } = await import("@/components/shared/record-closure");
const { recordRequestLinksKey, requestLinkedRecordsKey } = await import(
  "@/services/material-request-link.service"
);

const words = zh.jb279;

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

function buttonWith(html: string, text: string): string {
  const match = [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].find((m) =>
    m[2].includes(text),
  );
  expect(match, `a button reading ${text}`).toBeTruthy();
  return match![1];
}

function request(overrides: Partial<LinkableRequest> = {}): LinkableRequest {
  return {
    id: "mr-1",
    request_no: "MR-PRJ-0003-001",
    request_type: "MATERIAL",
    request_kind_name: "",
    subject: "",
    material_name: "钢筋",
    specification: "Y12",
    quantity: "10.000",
    unit: "TONNE",
    lines: [{ material_name: "钢筋", specification: "Y12", quantity: "10.000", unit: "TONNE" }],
    status: "APPROVED",
    execution_status: "IN_PROGRESS",
    created_at: "2026-11-20T02:00:00Z",
    project: "p-1",
    ...overrides,
  };
}

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("第 1 点: the phone and the office choose this project's MR / 其他申请", () => {
  it("lists the project's requests to tick, several at once", () => {
    const html = render(<RequestLinkPicker project="p-1" value={["mr-1"]} onChange={() => {}} />, (client) =>
      client.setQueryData(["material-request-links", "options", "p-1"], {
        results: [
          request(),
          request({ id: "or-1", request_no: "OR-PRJ-0003-001", request_type: "OTHER", subject: "Scaffold hire", lines: [], status: "SUBMITTED" }),
        ],
      }),
    );
    expect(html).toContain("MR-PRJ-0003-001");
    expect(html).toContain("OR-PRJ-0003-001");
    expect(html).toContain("Scaffold hire");
    expect(html).toContain("钢筋 Y12 10.000");
    expect(html).toContain(zh.materialRequest.type.OTHER);
    expect(html).toContain(zh.materialRequest.status.APPROVED);
    expect(html).toContain(zh.materialRequest.status.SUBMITTED);
    expect(html).toContain("已选 1 张");
    expect(html.match(/role="checkbox"/g)?.length).toBe(2);
  });

  it("says so when the project has none, and asks for the project first", () => {
    const none = render(<RequestLinkPicker project="p-1" value={[]} onChange={() => {}} />, (client) =>
      client.setQueryData(["material-request-links", "options", "p-1"], { results: [] }),
    );
    expect(none).toContain(words.link.none);
    expect(render(<RequestLinkPicker project="" value={[]} onChange={() => {}} />)).toContain(words.link.chooseProjectFirst);
  });

  it("is on the three phone forms, sent with the record and cleared with the project", () => {
    const receipt = source("src/components/field-staff/field-records-panel.tsx");
    const outgoing = source("src/components/contractor-ops/operations-workspaces.tsx");
    const issue = source("src/components/contractor-ops/material-issue.tsx");
    for (const form of [receipt, outgoing, issue]) {
      expect(form).toContain("<RequestLinkPicker project=");
      expect(form).toContain('material_requests: linkedRequests.length ? linkedRequests.join(",") : undefined');
      expect(form).toContain("setLinkedRequests([])");
    }
    // Queued offline, the choice goes with the job.
    const queue = source("src/lib/offline-db.ts");
    expect(queue.match(/material_requests\?: string;/g)?.length).toBe(2);
  });
});

describe("the office links a record on its page", () => {
  const links = (overrides: Partial<RecordRequestLinks> = {}): RecordRequestLinks => ({
    kind: "MATERIAL_RECEIPT",
    record: "r-1",
    project: "p-1",
    reference: "MI-PRJ-0003-031",
    archived: false,
    missing: false,
    may_change: true,
    links: [],
    ...overrides,
  });

  it("says plainly when none is linked and offers 关联申请", () => {
    const html = render(<RecordRequestLinksPanel kind="MATERIAL_RECEIPT" recordId="r-1" />, (client) =>
      client.setQueryData(recordRequestLinksKey("MATERIAL_RECEIPT", "r-1"), links({ missing: true })),
    );
    expect(html).toContain(words.link.title);
    expect(html).toContain(words.link.missing);
    buttonWith(html, words.link.edit);
  });

  it("lists the linked requests, each opening its request, with who linked it", () => {
    const html = render(<RecordRequestLinksPanel kind="MATERIAL_OUTGOING" recordId="o-1" />, (client) =>
      client.setQueryData(
        recordRequestLinksKey("MATERIAL_OUTGOING", "o-1"),
        links({
          kind: "MATERIAL_OUTGOING",
          record: "o-1",
          links: [{ ...request(), linked_at: "2026-11-26T03:00:00Z", linked_by_name: "Mike" }],
        }),
      ),
    );
    expect(html).toContain('href="/material-requests?record=mr-1"');
    expect(html).toContain("Mike");
    expect(html).not.toContain(words.link.missing);
    buttonWith(html, words.link.change);
  });

  it("offers no change once archived, or to one who may not change it", () => {
    const html = render(<RecordRequestLinksPanel kind="MATERIAL_RECEIPT" recordId="r-1" />, (client) =>
      client.setQueryData(
        recordRequestLinksKey("MATERIAL_RECEIPT", "r-1"),
        links({ archived: true, may_change: false, links: [{ ...request(), linked_at: null, linked_by_name: "" }] }),
      ),
    );
    expect(html).not.toContain(words.link.change);
    expect(html).toContain(words.link.lockedArchived);
  });

  it("sits on the delivery's page and on the return's / issue's page", () => {
    expect(source("src/components/receipts/view-receipt.tsx")).toContain(
      '<RecordRequestLinksPanel kind="MATERIAL_RECEIPT" recordId={data.id} />',
    );
    expect(source("src/components/contractor-ops/operations-workspaces.tsx")).toContain(
      '<RecordRequestLinksPanel kind="MATERIAL_OUTGOING" recordId={row.id} />',
    );
  });
});

describe("第 4 点: 未完成关联，不允许确认归档", () => {
  const state = (missing: boolean) => (client: QueryClient) =>
    client.setQueryData(recordClosureKey("MATERIAL_RECEIPT", "r-1"), {
      kind: "MATERIAL_RECEIPT",
      record: "r-1",
      ready: true,
      closed: false,
      mr_link_missing: missing,
      closure: null,
    });

  it("keeps the button off and says why", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, state(true));
    expect(html).toContain("data-record-closure-blocked");
    expect(html).toContain(words.archiveBlocked);
    expect(buttonWith(html, zh.recordClosure.action)).toMatch(/\sdisabled=""/);
  });

  it("is pressed as before once linked", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, state(false));
    expect(html).not.toContain(words.archiveBlocked);
    expect(buttonWith(html, zh.recordClosure.action)).not.toMatch(/\sdisabled=""/);
  });
});

describe("第 2、3 点 and 数量: the request's page lists every linked record", () => {
  const linked: RequestLinkedRecords = {
    request: "mr-1",
    request_no: "MR-PRJ-0003-001",
    request_type: "MATERIAL",
    records: [
      {
        kind: "RECEIPT", record_kind: "MATERIAL_RECEIPT", id: "r-1", reference: "MI-PRJ-0003-031",
        date: "2026-11-25T02:00:00Z", status: "ACCEPTED", counted: true,
        materials: [{ material_name: "钢筋", specification: "Y12", unit: "TONNE", quantity: "7.000", applied_quantity: null, in_request: true }],
      },
      {
        kind: "RECEIPT", record_kind: "MATERIAL_RECEIPT", id: "r-2", reference: "MI-PRJ-0003-032",
        date: "2026-11-25T03:00:00Z", status: "PENDING", counted: true,
        materials: [{ material_name: "水泥", specification: "", unit: "BAG", quantity: "20.000", applied_quantity: null, in_request: false }],
      },
      {
        kind: "RETURN", record_kind: "MATERIAL_OUTGOING", id: "o-1", reference: "MO-PRJ-0003-004",
        date: "2026-11-24T02:00:00Z", status: "PENDING", counted: false,
        materials: [{ material_name: "钢筋", specification: "Y12", unit: "TONNE", quantity: "2.000", applied_quantity: "2.000", in_request: true }],
      },
      {
        kind: "ISSUE", record_kind: "MATERIAL_OUTGOING", id: "o-2", reference: "MIN-PRJ-0003-007",
        date: "2026-11-23T02:00:00Z", status: "COMPLETED", counted: true,
        materials: [{ material_name: "钢筋", specification: "Y12", unit: "TONNE", quantity: "1.500", applied_quantity: null, in_request: true }],
      },
    ],
    totals: [
      {
        material_name: "钢筋", specification: "Y12", unit: "TONNE", applied_quantity: "10.000",
        received_quantity: "7.000", returned_quantity: "0.000", issued_quantity: "1.500",
        outstanding_quantity: "3.000", over_quantity: "0.000",
      },
    ],
  };

  const html = () =>
    render(<RequestLinkedRecordsPanel requestId="mr-1" />, (client) =>
      client.setQueryData(requestLinkedRecordsKey("mr-1"), linked),
    );

  it("shows number, date, material, quantity and status of 进场, 退场 and 领用, each opening the original", () => {
    const page = html();
    for (const kind of ["材料进场", "材料退场", "材料领用"]) expect(page).toContain(kind);
    for (const reference of ["MI-PRJ-0003-031", "MI-PRJ-0003-032", "MO-PRJ-0003-004", "MIN-PRJ-0003-007"]) {
      expect(page).toContain(reference);
    }
    expect(page).toContain('href="/receipts/r-1"');
    expect(page).toContain('href="/material-outgoing?record=o-1"');
    expect(page).toContain('href="/material-outgoing?record=o-2&amp;kind=ISSUE"');
    expect(page).toContain(zh.receipts.acceptance.status.ACCEPTED);
    expect(page).toContain(zh.contractorOps.outgoingStatus.PENDING);
    expect(page).toContain(zh.contractorOps.issue.status.COMPLETED);
    expect(page).toContain(words.records.notInRequest);
    expect(page).toContain(words.records.appliedOnly);
    expect(linkedRecordHref({ kind: "ISSUE", id: "o-2" })).toBe("/material-outgoing?record=o-2&kind=ISSUE");
  });

  it("compares 进场 with 申请 and keeps 退场 and 领用 apart", () => {
    const page = html();
    for (const header of Object.values(words.records.totals).filter((text) => !text.includes("{"))) {
      if (header === words.records.totals.material || header === words.records.totals.applied) continue;
      expect(page).toContain(header);
    }
    expect(page).toContain(words.records.totalsHelp);
    expect(page).toContain("10.000");
    expect(page).toContain("3.000");
    expect(page).toContain("1.500");
  });

  it("is on the request's page", () => {
    const office = source("src/components/material-requests/material-requests-office.tsx");
    expect(office).toContain("<RequestLinkedRecordsPanel requestId={row.id} />");
  });
});

describe("four languages", () => {
  const keysOf = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => keysOf(inner, prefix ? `${prefix}.${key}` : key))
      : [prefix];

  it("has every word in zh, zh-TW, en and ms, and the server's refusals", () => {
    const expected = keysOf(zh.jb279).sort();
    for (const catalogue of [zhTW, en, ms]) {
      expect(keysOf(catalogue.jb279).sort()).toEqual(expected);
      expect(catalogue.errors.api.material_request_link_required).toBeTruthy();
      expect(catalogue.errors.api.material_request_link_invalid).toBeTruthy();
      expect(catalogue.audit.operation.material_request_linked).toBeTruthy();
      expect(catalogue.audit.operation.material_request_unlinked).toBeTruthy();
    }
    // The UI speaks 你, never 您.
    expect(JSON.stringify(zh.jb279)).not.toContain("您");
    expect(JSON.stringify(zhTW.jb279)).not.toContain("您");
  });
});
