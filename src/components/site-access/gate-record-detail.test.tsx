/**
 * The gate record opens in the record-detail popup (E8, Q31), from the
 * office's 门禁通行 list and from the guard's phone alike: the canvas's
 * header, 记录人 with a number to tap and call, the guard's photographs, the
 * people asked in, and the record's own conversation.
 */
import { describe, expect, it, vi } from "vitest";

import type { GateIncidentDetail } from "@/interfaces/site-access";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
// Opened from a link, the way a notification opens it: ?gate_incident=<id>.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams("tab=records&record=gate&gate_incident=g1"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useProjectBoxShown: () => true,
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind }: { kind: string }) => (
    <div data-stub="conversation" data-kind={kind} />
  ),
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));
vi.mock("@/components/site-access/gate-qr-scanner", () => ({
  GateQrScanner: () => null,
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { GateRecordsPanel } = await import("@/components/site-access/gate-records");

const gateRecord = {
  id: "g1",
  incident_no: "GT-P1-261008-001",
  project: "p1",
  project_name: "Tower A",
  category: "OTHER",
  gate_name: "Gate 2",
  description: "",
  guard: "u1",
  guard_name: "Ah Seng",
  occurred_at: "2026-10-08T02:00:00Z",
  latitude: null,
  longitude: null,
  accuracy_m: null,
  access_pass: "pass-1",
  pass_no: "AP-0042",
  pass_subject_name: "Lorry WXY 1234",
  access_event: null,
  access_event_direction: null,
  access_event_at: null,
  photo_count: 1,
  cover_photo: null,
  is_issue: true,
  issue_status: "OPEN",
  issue_note: "No exit slip on this lorry",
  closed_by_name: null,
  closed_at: null,
  member_names: "Mei Ling",
  may_close: true,
  created_at: "2026-10-08T02:00:00Z",
  photos: [
    {
      id: "ph1",
      image: "https://cdn.example/gate.jpg",
      watermarked_image: "https://cdn.example/gate-stamped.jpg",
      gate_name: "Gate 2",
      guard: "u1",
      guard_name: "Ah Seng",
      captured_at: "2026-10-08T02:00:00Z",
      uploaded_at: "2026-10-08T02:00:05Z",
      latitude: "3.1",
      longitude: "101.6",
      accuracy_m: "8",
      client_event_id: "gate-photo-1",
      created_at: "2026-10-08T02:00:05Z",
    },
  ],
  members: [{ id: "m1", user: "u3", full_name: "Mei Ling", role_name: "Site manager" }],
  ...RECORDER,
} as unknown as GateIncidentDetail;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["gate-incident", "g1"], gateRecord);
}

describe("the gate record detail (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = renderDetail(<GateRecordsPanel />, seeded);
    expectRecordPopup(html, expect);
    expect(html).toContain("GT-P1-261008-001");
    // Its own PDF since H16 (HD13: 「每一个事项都要」).
    expect(html).toContain('data-stub="export" data-kind="GATE_INCIDENT"');
  });

  it("shows one number only, never the old one (J15-1, Q15)", () => {
    const renumbered = renderDetail(<GateRecordsPanel />, (client) =>
      client.setQueryData(["gate-incident", "g1"], { ...gateRecord, legacy_no: "GT-OLD-0007" }),
    );
    expect(renumbered).toContain("GT-P1-261008-001");
    expect(renumbered).not.toContain("旧编号");
    expect(renumbered).not.toContain("GT-OLD-0007");
  });

  it("keeps its facts, its stamped photographs, its people and its conversation", () => {
    const html = renderDetail(<GateRecordsPanel />, seeded);
    expect(html).toContain("AP-0042 · Lorry WXY 1234");
    expect(html).toContain("Gate 2");
    expect(html).toContain("https://cdn.example/gate-stamped.jpg");
    expect(html).toContain("Mei Ling");
    expect(html).toContain('data-stub="conversation" data-kind="GATE_INCIDENT"');
    // The conversation it always had, without an attachments panel it never had.
    expect(html).not.toContain('data-stub="attachments"');
  });

  it("shows a gate issue's note, status and the confirm-finished button (HD6)", () => {
    const html = renderDetail(<GateRecordsPanel />, seeded);
    expect(html).toContain("No exit slip on this lorry");
    expect(html).toContain('data-gate-issue="open"');
  });

  it("files a plain gate photo with no conversation and nothing to finish", () => {
    const html = renderDetail(<GateRecordsPanel />, (client) =>
      client.setQueryData(["gate-incident", "g1"], {
        ...gateRecord,
        is_issue: false,
        issue_status: null,
        issue_note: "",
        members: [],
        member_names: "",
        may_close: false,
      }),
    );
    expect(html).not.toContain('data-stub="conversation"');
    expect(html).not.toContain("data-gate-issue");
  });

  it("shows the record's title while it loads, in the same popup", () => {
    const html = renderDetail(<GateRecordsPanel />);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).not.toContain("data-shell-recorder");
  });
});
