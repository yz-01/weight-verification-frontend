/**
 * 2026-10 C4 (X10): 【确认归档】 lives on each module's own detail page, and
 * 现场记录中心 only reads.
 *
 * The client's complaint: 「等你处理」 sent them to a page where nothing could
 * be confirmed. So, rendered to static markup (the runner has no DOM) with the
 * closure's answer seeded into the query cache:
 *
 * * the panel offers the confirm only when the server says the record is
 *   `ready` (its own steps done - a delivery accepted), says who confirmed it
 *   once it is, and shows nothing before then;
 * * every business detail hands its record to that panel, with its own kind;
 * * the record sheet has no button that changes a record, unless a 「等你处理」
 *   row whose module has no detail page yet asked it to `confirm`;
 * * a hazard says 已闭环 / 未闭环 and offers nothing.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
// The sheet's neighbours are not what is under test, and both would fetch.
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));

const { RecordClosurePanel, recordClosureKey } = await import(
  "@/components/shared/record-closure"
);
const { RecordDetailShell } = await import("@/components/shared/record-detail-shell");
const { RecordSheet } = await import("@/components/contractor-ops/archive-queue");
const { receiptAwaitsConfirmation } = await import("@/components/receipts/view-receipt");

type Kind = Parameters<typeof RecordClosurePanel>[0]["kind"];

function closureState(kind: Kind, id: string, ready: boolean, closed = false) {
  return {
    kind,
    record: id,
    ready,
    closed,
    closure: closed
      ? { confirmed_by: "u1", confirmed_by_name: "Ong", confirmed_at: "2026-10-07T03:00:00Z", note: "" }
      : null,
  };
}

function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const CONFIRM = messages.recordClosure.action;

describe("the confirm on a business page offers itself only when the record is ready", () => {
  const kinds: Kind[] = [
    "MATERIAL_RECEIPT",
    "MATERIAL_OUTGOING",
    "EQUIPMENT_MOVEMENT",
    "WASTE_OUTGOING",
    "DISPOSAL_REQUEST",
    "PROGRESS",
    "CONSULTANT_APPLICATION",
    "SUNDRY_CLAIM",
  ];

  it.each(kinds)("%s: ready and open -> the 确认归档 button", (kind) => {
    const html = render(<RecordClosurePanel kind={kind} recordId="r1" />, (client) =>
      client.setQueryData(recordClosureKey(kind, "r1"), closureState(kind, "r1", true)),
    );
    expect(html).toContain('data-record-closure="open"');
    expect(html).toMatch(new RegExp(`<button[^>]*>[\\s\\S]*?${CONFIRM}</button>`));
  });

  it.each(kinds)("%s: already confirmed -> who and when, no button", (kind) => {
    const html = render(<RecordClosurePanel kind={kind} recordId="r1" />, (client) =>
      client.setQueryData(recordClosureKey(kind, "r1"), closureState(kind, "r1", true, true)),
    );
    expect(html).toContain('data-record-closure="closed"');
    expect(html).toContain("Ong");
    expect(html).not.toContain("<button");
  });

  it.each(kinds)("%s: its own steps not done -> nothing at all", (kind) => {
    const html = render(<RecordClosurePanel kind={kind} recordId="r1" />, (client) =>
      client.setQueryData(recordClosureKey(kind, "r1"), closureState(kind, "r1", false)),
    );
    expect(html).toBe("");
  });

  it("is drawn by the shared detail layout when a module hands it a record", () => {
    const seeded = (client: QueryClient) =>
      client.setQueryData(
        recordClosureKey("MATERIAL_OUTGOING", "m1"),
        closureState("MATERIAL_OUTGOING", "m1", true),
      );
    const withIt = render(
      <RecordDetailShell
        reference="MO-001"
        facts={[]}
        closure={{ kind: "MATERIAL_OUTGOING", recordId: "m1" }}
      />,
      seeded,
    );
    expect(withIt).toContain('data-record-closure="open"');
    const without = render(<RecordDetailShell reference="MO-001" facts={[]} />, seeded);
    expect(without).not.toContain("data-record-closure");
  });

  it("takes the record off 「等你处理」 and the 待确认 badge once confirmed", () => {
    // Both read the `contractor-dashboard` queries; refetched on success
    // rather than left showing a record that is no longer waiting.
    const panel = readFileSync(path.join(process.cwd(), "src/components/shared/record-closure.tsx"), "utf8");
    const success = panel.slice(panel.indexOf("onSuccess: () => {"), panel.indexOf("if (state.isLoading)"));
    expect(success).toMatch(/invalidateQueries\(\{ queryKey: \["contractor-dashboard"\] \}\)/);
  });
});

describe("every business detail hands its record to the confirm panel - C4", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");
  // The eight X10 names, each in the file that draws that module's detail.
  const DETAILS: [string, string, RegExp][] = [
    ["MATERIAL_RECEIPT", "components/receipts/view-receipt.tsx", /\{ kind: "MATERIAL_RECEIPT", recordId: data\.id \}/],
    ["MATERIAL_OUTGOING", "components/contractor-ops/operations-workspaces.tsx", /closure=\{\{ kind: "MATERIAL_OUTGOING", recordId: row\.id \}\}/],
    ["EQUIPMENT_MOVEMENT", "components/contractor-ops/office-module-lists.tsx", /closure=\{\{ kind: "EQUIPMENT_MOVEMENT", recordId: shownMovement\.id \}\}/],
    ["PROGRESS", "components/contractor-ops/office-module-lists.tsx", /closure=\{\{ kind: "PROGRESS", recordId: shown\.id \}\}/],
    ["WASTE_OUTGOING", "components/contractor-ops/waste-outgoing-workspace.tsx", /closure=\{\{ kind: "WASTE_OUTGOING", recordId: shown\.id \}\}/],
    ["DISPOSAL_REQUEST", "components/contractor-ops/site-disposal-workspaces.tsx", /closure=\{\{ kind: "DISPOSAL_REQUEST", recordId: row\.id \}\}/],
    ["SUNDRY_CLAIM", "components/sundry-claims/sundry-claims-office.tsx", /closure=\{\{ kind: "SUNDRY_CLAIM", recordId: claim\.id \}\}/],
    ["CONSULTANT_APPLICATION", "components/consultant-workflow/application-detail.tsx", /<RecordClosurePanel kind="CONSULTANT_APPLICATION" recordId=\{application\.id\} \/>/],
  ];

  it.each(DETAILS)("%s", (_kind, file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it("a delivery waits for its confirm only once accepted, and only the current copy", () => {
    expect(receiptAwaitsConfirmation({ acceptance_status: "ACCEPTED", superseded_by: null })).toBe(true);
    expect(receiptAwaitsConfirmation({ acceptance_status: "PENDING", superseded_by: null })).toBe(false);
    expect(receiptAwaitsConfirmation({ acceptance_status: "REJECTED", superseded_by: null })).toBe(false);
    expect(
      receiptAwaitsConfirmation({
        acceptance_status: "ACCEPTED",
        superseded_by: { id: "r2", receipt_no: "RC-2" } as never,
      }),
    ).toBe(false);
  });
});

describe("the record sheet only reads", () => {
  type Row = Parameters<typeof RecordSheet>[0]["row"];
  const row = (kind: Row["kind"], overrides: Partial<Row> = {}): Row => ({
    id: "r1",
    kind,
    reference: "REF-1",
    detail: "",
    project_id: "p1",
    project_name: "Tower",
    submitted_at: "2026-10-07T03:00:00Z",
    status: "COMPLETED",
    status_label: "",
    photo: null,
    seen_at: null,
    archivable: true,
    archived: null,
    ...overrides,
  });
  const seed = (r: Row, ready = true) => (client: QueryClient) => {
    client.setQueryData(["archive-queue", "detail", "queue", r.kind, r.id], {
      ...r,
      fields: [],
      photos: [],
      is_seen: false,
    });
    client.setQueryData(recordClosureKey(r.kind as Kind, r.id), closureState(r.kind as Kind, r.id, ready));
  };
  const buttons = (html: string) => html.match(/<button[\s\S]*?<\/button>/g) ?? [];

  const QUEUE_KINDS: Row["kind"][] = [
    "MATERIAL_RECEIPT",
    "MATERIAL_OUTGOING",
    "EQUIPMENT_MOVEMENT",
    "WASTE_OUTGOING",
    "DISPOSAL_REQUEST",
    "PROGRESS",
    "CONSULTANT_APPLICATION",
    "SUNDRY_CLAIM",
    "HAZARD",
  ];

  it.each(QUEUE_KINDS)("%s in 现场记录中心: no button changes the record", (kind) => {
    const r = row(kind);
    const html = render(<RecordSheet row={r} onClose={() => {}} />, seed(r));
    expect(html).not.toContain("data-record-closure");
    expect(html).not.toContain(CONFIRM);
    expect(html).not.toContain("我看过了");
    // What is left to press: the close in the header and the one in the footer.
    for (const button of buttons(html)) {
      expect(button, button).toMatch(new RegExp(`aria-label="${messages.common.close}"|>${messages.common.close}<`));
    }
  });

  it("offers the confirm when a 「等你处理」 row with no detail page asks for it", () => {
    for (const kind of ["PROGRESS", "EQUIPMENT_MOVEMENT"] as const) {
      const r = row(kind);
      const html = render(<RecordSheet row={r} confirm onClose={() => {}} />, seed(r));
      expect(html, kind).toContain('data-record-closure="open"');
      expect(html, kind).toContain(CONFIRM);
    }
  });

  it("still offers nothing for a record that is not ready, even when asked", () => {
    const r = row("PROGRESS");
    const html = render(<RecordSheet row={r} confirm onClose={() => {}} />, seed(r, false));
    expect(html).not.toContain(CONFIRM);
  });

  it("says 已闭环 / 未闭环 for a hazard and offers no button", () => {
    const closed = row("HAZARD", { archived: { by: "Lim", at: "2026-10-07T03:00:00Z" } });
    const closedHtml = render(<RecordSheet row={closed} onClose={() => {}} />, seed(closed));
    expect(closedHtml).toContain('data-hazard-closure="closed"');
    expect(closedHtml).toContain("已闭环");
    expect(closedHtml).toContain("Lim");

    const open = row("HAZARD");
    const openHtml = render(<RecordSheet row={open} onClose={() => {}} />, seed(open));
    expect(openHtml).toContain('data-hazard-closure="open"');
    expect(openHtml).toContain("未闭环");
    expect(openHtml).not.toContain(CONFIRM);
  });

  it("is opened read-only by every caller except 「等你处理」", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");
    // 「等你处理」 is the dashboard card's pop-up now (B8, F6) and its full
    // list, the record centre with `?waiting=1`.
    const cards = read("components/dashboard/dashboard-cards.tsx");
    expect(cards).toMatch(/const waitingOpener = useRecordOpener\(\{ confirm: true \}\);/);
    expect(cards).toMatch(/waitingOpener\.open\(row\.kind, row\.id, heading\)/);
    const queue = read("components/contractor-ops/archive-queue.tsx");
    expect(queue).toMatch(/const confirmOpener = useRecordOpener\(\{ confirm: true \}\);/);
    expect(queue).toMatch(/waiting &&\s+confirmOpener\.open\(/);
    // The photo strip, the timeline and the head-office photos keep the reading one.
    expect(read("components/dashboard/headquarters-photos.tsx")).toMatch(/useRecordOpener\(\)/);
    expect(read("components/contractor-ops/archive-queue.tsx")).toMatch(
      /\{open && <RecordSheet row=\{open\} onClose=\{\(\) => setOpen\(null\)\} \/>\}/,
    );
  });
});
