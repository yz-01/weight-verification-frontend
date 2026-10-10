/**
 * A module's list, as Multi Engine sees it (2026-10-10, 客户「添加资料及勾选
 * 关联优化」 and 「最后补充 4 项」).
 *
 * - 「✅ 已打包 X 次」 on a packed row, nothing on the others (三 4);
 * - while a package is being put together: a tick box per row, the row
 *   already in it ticked and greyed with 「✅ 已加入当前资料包」 (补充 3), a row
 *   that cannot go in greyed with the reason, and the bar with 「加入当前
 *   资料包」 (二 5);
 * - the packages a record is in, with number, recipient and state, and the
 *   reminder that packed is not claimed and not approved (三 5, 三 7).
 *
 * Rendered to static markup with the queries answered from the cache (the
 * runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PackStatus, RecordPackageRow } from "@/interfaces/contractor-ops";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => "/receipts",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { DataTable } = await import("@/components/shared/data-table");
const {
  PackActionBar,
  PackCollectValueProvider,
  PackageList,
  packageStateLine,
} = await import("@/components/contractor-ops/pack-collect");

const words = zh.multiEngine.collect;

interface Row {
  id: string;
  receipt_no: string;
}

const rows: Row[] = [
  { id: "r1", receipt_no: "RC-001" },
  { id: "r2", receipt_no: "RC-002" },
  { id: "r3", receipt_no: "RC-003" },
];

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "receipt_no", header: () => "No", cell: ({ row }) => row.original.receipt_no },
];

const collecting = {
  collecting: { id: "pkg-a", name: "三月进度 Claim", project: "p-1" },
  itemCount: 1,
  packageNo: "PKG-P1-261010-001",
  start: () => undefined,
  end: () => undefined,
};

function table(status: PackStatus, packageId = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(
    ["evidence-packages", "pack-status", "MATERIAL_RECEIPT", packageId, ["r1", "r2", "r3"]],
    status,
  );
  const body = (
    <DataTable<Row>
      columns={columns}
      rows={rows}
      totalCount={3}
      page={1}
      pageSize={20}
      isLoading={false}
      isError={false}
      hasFilters={false}
      search=""
      sortBy=""
      sortOrder="desc"
      storageKey="pack-test"
      pack={{ kind: "MATERIAL_RECEIPT" }}
      onSearchChange={() => {}}
      onSortChange={() => {}}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
      onClearFilters={() => {}}
    />
  );
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          {packageId ? <PackCollectValueProvider value={collecting}>{body}</PackCollectValueProvider> : body}
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const packed = words.packed.replace("{count}", "2");
/** The attribute, not the `disabled:` styling every box carries. */
const DISABLED = /\sdisabled=""/;

describe("a module's list, not collecting", () => {
  const html = table({
    package: null,
    records: {
      r1: { count: 0, in_package: false, can_add: false, reason: "no_package" },
      r2: { count: 2, in_package: false, can_add: false, reason: "no_package" },
      r3: { count: 0, in_package: false, can_add: false, reason: "no_package" },
    },
  });

  it("says 「✅ 已打包 X 次」 on the packed row only (三 4)", () => {
    expect(html.split(packed).length - 1).toBe(1);
    expect(html).toContain(words.column);
  });

  it("offers no tick boxes and no 「加入当前资料包」", () => {
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain(words.addTicked);
  });
});

describe("a module's list while a package is being put together", () => {
  const html = table(
    {
      package: { id: "pkg-a", package_no: "PKG-P1-261010-001", name: "三月进度 Claim", project: "p-1", state: "DRAFT" },
      records: {
        r1: { count: 0, in_package: false, can_add: true, reason: "" },
        r2: { count: 2, in_package: true, can_add: false, reason: "in_package" },
        r3: { count: 0, in_package: false, can_add: false, reason: "not_finished" },
      },
    },
    "pkg-a",
  );
  const boxes = html.match(/<button[^>]*role="checkbox"[^>]*>/g) ?? [];

  it("gives every row a tick box, and one for the page", () => {
    expect(boxes.length).toBe(4);
  });

  it("ticks and greys the row already in the package, and says so (补充 3)", () => {
    expect(html).toContain(words.inCurrent);
    const inPackage = boxes.find((box) => box.includes(`aria-label="${words.inCurrent}"`));
    expect(inPackage).toBeDefined();
    expect(inPackage).toContain('aria-checked="true"');
    expect(inPackage).toMatch(DISABLED);
    expect(html).toContain(packed);
  });

  it("greys a row that cannot go in, with the reason", () => {
    const unfinished = boxes.find((box) => box.includes(words.reason.not_finished));
    expect(unfinished).toBeDefined();
    expect(unfinished).toMatch(DISABLED);
  });

  it("leaves a row that can go in open to tick", () => {
    const open = boxes.find((box) => box.includes(`aria-label="${words.selectRow}"`));
    expect(open).toBeDefined();
    expect(open).not.toMatch(DISABLED);
  });

  it("puts 「加入当前资料包」 above the rows, waiting for a tick", () => {
    expect(html).toContain('data-slot="pack-action-bar"');
    expect(html).toContain(words.barTitle.replace("{name}", "三月进度 Claim"));
    expect(html).toContain(words.ticked.replace("{count}", "0"));
    expect(html).toContain(words.addTicked);
    expect(html).toContain(words.tickFirst);
  });
});

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("「加入当前资料包」", () => {
  it("is ready once rows are ticked, and counts them", () => {
    const html = render(
      <PackActionBar name="三月进度 Claim" ticked={3} pending={false} onAdd={() => {}} onClear={() => {}} />,
    );
    expect(html).toContain(words.ticked.replace("{count}", "3"));
    expect(html).toContain(words.clear);
    const add = html.match(/<button[^>]*>(?:(?!<\/button>).)*加入当前资料包/)?.[0] ?? "";
    expect(add).toContain(words.addTicked);
    expect(add).not.toMatch(DISABLED);
  });
});

const sent: RecordPackageRow = {
  package: "pkg-a",
  package_no: "PKG-P1-261010-001",
  name: "三月进度 Claim",
  project_name: "Tower",
  state: "CONFIRMED",
  review_state: "SENT",
  sent_to_name: "Tan Engineer",
  sent_at: "2026-10-10T03:00:00Z",
  confirmed_at: "2026-10-10T02:00:00Z",
  added_at: "2026-10-10T01:00:00Z",
  added_by_name: "Ong",
  item_review_state: "PENDING",
  returned_reason: "",
};

describe("where a record was packed (三 5, 三 7)", () => {
  it("names each package by number, name, recipient, time and state", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["evidence-packages", "record-packages", "MATERIAL_RECEIPT", "r2"], [
      sent,
      { ...sent, package: "pkg-b", package_no: "PKG-P1-261010-002", name: "四月", state: "DRAFT", review_state: "NOT_SENT", sent_to_name: "" },
    ]);
    const html = render(<PackageList kind="MATERIAL_RECEIPT" recordId="r2" onOpen={() => {}} />, client);
    expect(html).toContain("PKG-P1-261010-001");
    expect(html).toContain("PKG-P1-261010-002");
    expect(html).toContain("三月进度 Claim");
    expect(html).toContain(words.sentTo.replace("{name}", "Tan Engineer"));
    expect(html).toContain(words.notSent);
    expect(html).toContain(zh.multiEngine.review.SENT);
    expect(html).toContain(zh.multiEngine.state.DRAFT);
    // 「勾选只代表已加入资料包，不代表已 Claim 或顾问已批准」.
    expect(html).toContain(words.packedHint);
    expect(words.packedHint).toContain("Claim");
  });

  it("says this record's own verdict once the consultant gave one", () => {
    const t = (key: string, values?: Record<string, string | number>) => {
      const found = key.split(".").reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        zh.multiEngine,
      );
      return String(found ?? key).replace("{reason}", String(values?.reason ?? ""));
    };
    expect(packageStateLine({ ...sent, state: "DRAFT", review_state: "NOT_SENT" }, t)).toBe(zh.multiEngine.state.DRAFT);
    expect(packageStateLine({ ...sent, review_state: "NOT_SENT" }, t)).toBe(zh.multiEngine.state.CONFIRMED);
    expect(
      packageStateLine({ ...sent, review_state: "REVIEWED", item_review_state: "RETURNED", returned_reason: "DO 不清楚" }, t),
    ).toBe(`${zh.multiEngine.review.REVIEWED} · ${zh.multiEngine.returnedWithReason.replace("{reason}", "DO 不清楚")}`);
  });
});
