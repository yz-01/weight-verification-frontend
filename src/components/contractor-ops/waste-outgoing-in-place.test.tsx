/**
 * 分类管理 → 查看记录 (Lucas 10-30): a 废料出场 record opens its module's own
 * full window on top of the page, not a summary and not a jump to the list.
 *
 * Rendered to static markup with the record seeded into the cache under the
 * key the list also refreshes (["waste-outgoing", ...]), so a step taken in
 * the window shows on both.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WasteOutgoingRecord } from "@/interfaces/waste-outgoing";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/settings/categories",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);

const { WasteOutgoingInPlace } = await import("@/components/contractor-ops/waste-outgoing-workspace");
const { recordClosureKey } = await import("@/components/shared/record-closure");

function record(overrides: Partial<WasteOutgoingRecord> = {}): WasteOutgoingRecord {
  return {
    id: "w1",
    reference_no: "WO-0042",
    project: "p1",
    project_name: "Jalan Ampang",
    category: "c1",
    category_name: "Scrap metal",
    category_code: "SCRAP",
    raised_by_office: false,
    quantity: "3",
    unit: "TON",
    note: "",
    status: "ORDERED",
    captured_at: "2026-10-29T03:00:00Z",
    pickup_address: "",
    pickup_address_source: "",
    review_note: "",
    delegated_to: null,
    delegated_to_name: null,
    recycler_name: "Green Co",
    dispatch: "d1",
    dispatch_no: "DSP-7",
    dispatch_state: "ACCEPTED",
    proposed_collection_at: null,
    confirmed_collection_at: null,
    recorded_by_name: "Ali",
    photos: [],
    ...overrides,
  } as unknown as WasteOutgoingRecord;
}

function render(seed: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <WasteOutgoingInPlace id="w1" onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("WasteOutgoingInPlace", () => {
  it("opens the list's own window for the record: actions, 确认归档, conversation", () => {
    const html = render((client) => {
      client.setQueryData(["waste-outgoing", "record", "w1"], record());
      client.setQueryData(recordClosureKey("WASTE_OUTGOING", "w1"), {
        kind: "WASTE_OUTGOING",
        record: "w1",
        ready: true,
        closed: false,
        closure: null,
      });
    });
    expect(html).toContain("WO-0042");
    expect(html).toContain("Green Co");
    expect(html).toContain(messages.wasteOutgoing.action.track);
    expect(html).toContain(messages.wasteOutgoing.action.reassign);
    expect(html).toContain('data-record-closure="open"');
    expect(html).toContain('data-stub="conversation"');
  });

  it("waits for the record without falling back to another page", () => {
    const html = render(() => {});
    expect(html).toContain(messages.nav.submodule.wasteOutgoing);
    expect(html).not.toContain("WO-0042");
  });

  it("is the same window the list opens, so the two cannot drift", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/contractor-ops/waste-outgoing-workspace.tsx"),
      "utf8",
    );
    const uses = source.match(/<WasteOutgoingRecordWindow /g) ?? [];
    expect(uses).toHaveLength(2);
    // Nothing in the window takes the reader off the page they came from.
    expect(source).not.toContain("useRouter");
  });
});
