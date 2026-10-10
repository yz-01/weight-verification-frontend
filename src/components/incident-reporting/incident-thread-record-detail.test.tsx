/**
 * An incident report opens in the record-detail popup (E8, Q31), over the
 * list, in the office and on the phone.
 *
 * Lucas, 2026-10-08: every record a phone submits opens in the same popup,
 * with 记录人 and a number to tap and call. The report's own message thread
 * is its 事项沟通, with the composer under it; 标记为已解决 is the decision.
 */
import { describe, expect, it, vi } from "vitest";

import type { IncidentReportThreadDetail } from "@/interfaces/incident-report";
import messages from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ pathname: "/incident-reports" }));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-office" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { IncidentThreadDetail } = await import(
  "@/components/incident-reporting/incident-thread-detail"
);

const words = messages.incidentReporting;

function detail(resolved = false): IncidentReportThreadDetail {
  return {
    thread: {
      id: "t1",
      thread_no: "IR-P1-261008-001",
      title: "Scaffold collapsed at block B",
      occurred_at: "2026-10-08T01:00:00Z",
      project: "p1",
      project_name: "Tower A",
      reported_by: "u1",
      reported_by_name: "Ah Seng",
      recipients: [],
      latitude: null,
      longitude: null,
      is_resolved: resolved,
      resolved_at: null,
      message_count: 1,
      last_message_at: "2026-10-08T01:05:00Z",
      created_at: "2026-10-08T01:05:00Z",
      updated_at: "2026-10-08T01:05:00Z",
      ...RECORDER,
    },
    messages: [
      {
        id: "m1",
        thread: "t1",
        author: "u1",
        author_name: "Ah Seng",
        body: "Two workers stepped back in time",
        photo: null,
        watermarked_photo: null,
        latitude: null,
        longitude: null,
        accuracy_m: null,
        sent_at: "2026-10-08T01:05:00Z",
        client_event_id: "e1",
        created_at: "2026-10-08T01:05:00Z",
      },
    ],
    participants: [
      { id: "u1", full_name: "Ah Seng", role_name: "Worker", is_reporter: true },
      { id: "u2", full_name: "Mei Ling", role_name: "Safety Officer", is_supervisor: true },
    ],
  };
}

function open(resolved = false) {
  return renderDetail(<IncidentThreadDetail threadId="t1" onClose={() => {}} />, (client) =>
    client.setQueryData(["incident-thread", "t1"], detail(resolved)),
  );
}

describe("an incident report (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = open();
    expectRecordPopup(html, expect);
    expect(html).toContain("IR-P1-261008-001");
    expect(html).toContain("Scaffold collapsed at block B");
    // No 严重程度: gone from the system (2026-10-10).
    expect(html).not.toContain("severity");
    expect(html).toContain("Tower A");
    expect(html).toContain("Mei Ling");
    // Not an exportable record.
    expect(html).not.toContain('data-stub="export"');
  });

  it("keeps its own thread and composer in the conversation place, and 标记为已解决 as the decision", () => {
    const html = open();
    expect(html).toContain("data-incident-thread");
    expect(html).toContain("Two workers stepped back in time");
    expect(html).toContain(words.field.messagePlaceholder);
    expect(html).toContain("data-shell-actions");
    expect(html).toContain(words.action.resolve);
    // The shared conversation panel is not added: the thread is the chat.
    expect(html).not.toContain('data-stub="conversation"');
  });

  it("drops the composer and the button once resolved", () => {
    const html = open(true);
    expect(html).toContain(words.status.resolved);
    expect(html).not.toContain(words.action.resolve);
    expect(html).not.toContain(words.field.messagePlaceholder);
  });

  it("is the same popup on the phone", () => {
    nav.pathname = "/field-staff/incidents";
    try {
      const html = open();
      expectRecordPopup(html, expect);
      expect(html).toContain(words.field.messagePlaceholder);
    } finally {
      nav.pathname = "/incident-reports";
    }
  });

  it("shows the popup while the report loads", () => {
    const html = renderDetail(<IncidentThreadDetail threadId="t2" onClose={() => {}} />);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain(words.title);
  });
});
