/**
 * The hazard / safety-incident detail opens in the record-detail popup (E8,
 * Q31): the canvas's header with its 单独导出, 记录人 with a number to tap
 * and call, the 整改前 / 中 / 后 photographs, the confirm and assign buttons,
 * and the hazard's own room in the 事项沟通 place.
 */
import { describe, expect, it, vi } from "vitest";

import type { SafetyIncident } from "@/interfaces/site-operations";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/safety",
  useSearchParams: () => new URLSearchParams(),
}));
// Every permission but the one 【改正】 needs, unless a test grants it (I30).
const granted = vi.hoisted(() => ({ correct: false, user: null as { id: string } | null }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: granted.user,
    can: (code: string) => code !== "safety.manage" || granted.correct,
  }),
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
vi.mock("@/components/site-operations/hazard-conversation", () => ({
  HazardConversationPanel: ({ incidentId }: { incidentId: string }) => (
    <div data-stub="hazard-room" data-incident={incidentId} />
  ),
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { HazardRecordDetail } = await import("@/components/site-operations/safety");

const incident = {
  id: "h1",
  incident_no: "HZ-P1-261008-001",
  project: "p1",
  project_name: "Tower A",
  category: null,
  category_code: null,
  category_name: null,
  title: "Open edge on level 3",
  description: "",
  status: "RECTIFICATION_SUBMITTED",
  occurred_at: "2026-10-08T02:00:00Z",
  latitude: null,
  longitude: null,
  initial_evidence: [],
  rectification_evidence: [],
  responsible_person: "u2",
  responsible_person_name: "Muthu",
  photographer_name: "Ah Seng",
  created_by_title: "Safety officer",
  origin: "SITE",
  confirmer_name: "Lim",
  can_confirm: true,
  photo_groups: {
    before: [{ id: "p1", image: "https://cdn.example/before.jpg", watermarked: null, captured_at: null }],
    during: [],
    after: [{ id: "p2", image: "https://cdn.example/after.jpg", watermarked: null, captured_at: null }],
  },
  ...RECORDER,
} as unknown as SafetyIncident;

const noop = () => {};

function render(overrides: Partial<SafetyIncident> = {}, mayAssign = false) {
  return renderDetail(
    <HazardRecordDetail
      incident={{ ...incident, ...overrides }}
      mayAssign={mayAssign}
      onClose={noop}
      onReview={noop}
      onAssign={noop}
    />,
  );
}

describe("the hazard detail (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = render();
    expectRecordPopup(html, expect);
    expect(html).toContain("HZ-P1-261008-001");
    expect(html).toContain("Open edge on level 3");
    // 单独导出 stays a HAZARD export (T-386).
    expect(html).toContain('data-kind="HAZARD"');
  });

  it("keeps its facts, its photo rows and its own room", () => {
    const html = render();
    expect(html).toContain("Muthu");
    expect(html).toContain("Tower A");
    expect(html).toContain("Lim");
    expect(html).toContain("Ah Seng · Safety officer");
    for (const group of ["before", "during", "after"]) {
      expect(html).toContain(`data-photo-group="${group}"`);
    }
    expect(html).toContain("https://cdn.example/before.jpg");
    // The hazard's room, not the shared record conversation.
    expect(html).toContain('data-stub="hazard-room" data-incident="h1"');
    expect(html).not.toContain('data-stub="conversation"');
    expect(html).not.toContain('data-stub="attachments"');
  });

  it("offers 验收整改 to the confirmer and 指派 only when assignment is allowed", () => {
    const confirmer = render();
    expect(confirmer).toContain("data-shell-actions");
    expect(confirmer).toContain("验收整改");
    expect(confirmer).not.toContain("指派整改");

    const assigner = render({ can_confirm: false, status: "OPEN", responsible_person: null }, true);
    expect(assigner).toContain("指派整改");

    // A reader gets no button; the box beside them is the 【确认归档】 one
    // every record has (JB90), which says whether it is archived.
    const reader = render({ can_confirm: false });
    expect(reader).not.toContain("验收整改");
    expect(reader).not.toContain("指派整改");
    expect(reader).not.toContain("提交整改");
  });

  // JB90 (客户 10-30): a phone named an office account to fix it, and that
  // person had only the conversation in the office's window.
  it("offers 提交整改 to whoever was named to fix it, in the office too", () => {
    granted.user = { id: "u-fixer" };
    try {
      const fixer = (status: SafetyIncident["status"]) =>
        renderDetail(
          <HazardRecordDetail
            incident={{ ...incident, can_confirm: false, status, responsible_person: "u-fixer" }}
            mayAssign={false}
            onClose={noop}
            onReview={noop}
            onAssign={noop}
            onSubmit={noop}
          />,
        );
      expect(fixer("ASSIGNED")).toContain("提交整改");
      expect(fixer("RETURNED")).toContain("提交整改");
      expect(fixer("RECTIFICATION_SUBMITTED")).not.toContain("提交整改");
      granted.user = { id: "someone-else" };
      expect(fixer("ASSIGNED")).not.toContain("提交整改");
    } finally {
      granted.user = null;
    }
  });

  it("offers 【改正】 on a hazard to whoever manages safety, never on a permit (I30)", () => {
    granted.correct = true;
    try {
      expect(render({ can_confirm: false })).toContain('data-record-correct="HAZARD"');
      expect(render({ can_confirm: false, record_type: "PERMIT" })).not.toContain(
        "data-record-correct",
      );
    } finally {
      granted.correct = false;
    }
  });

  it("a permit's after rows are left out while they are empty", () => {
    const html = render({
      record_type: "PERMIT",
      photo_groups: { before: [], during: [], after: [] },
    });
    expect(html).toContain('data-photo-group="before"');
    expect(html).not.toContain('data-photo-group="after"');
  });
});
