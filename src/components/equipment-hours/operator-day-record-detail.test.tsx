/**
 * One machine's day of operator hours opens in the record-detail popup (E8, Q31).
 *
 * Lucas, 2026-10-08: every record a phone submits opens in the same popup,
 * with 记录人 - here the operator who took the day's first photo - and a
 * number to tap and call. The day's photos, start, end and hours, the
 * office's end-time form and the correction history keep their place in it.
 */
import { describe, expect, it, vi } from "vitest";

import type { EquipmentHoursDay } from "@/interfaces/equipment-hours";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/equipment-operator-hours",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
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
const { DayDialog } = await import("@/components/equipment-hours/equipment-operator-hours");

const words = messages.equipmentHours;

const day: EquipmentHoursDay = {
  key: "eq-1:2026-10-07",
  equipment: "eq-1",
  equipment_name: "Excavator",
  equipment_code: "EQ-001",
  plate: "WXY 1234",
  project: "p1",
  project_name: "Hours Tower",
  work_date: "2026-10-07",
  start_at: "2026-10-07T00:00:00Z",
  end_at: "2026-10-07T09:00:00Z",
  photo_end_at: "2026-10-07T09:30:00Z",
  hours: "9.00",
  photo_count: 2,
  missing_end: false,
  adjusted: true,
  photos: [
    { id: "a", captured_at: "2026-10-07T00:00:00Z", operator_name: "Ahmad", watermarked_photo: "/media/a.jpg" },
    { id: "b", captured_at: "2026-10-07T09:30:00Z", operator_name: "Ahmad", watermarked_photo: "/media/b.jpg" },
  ],
  adjustments: [
    { id: "1", end_at: "2026-10-07T09:00:00Z", reason: "Checked the log book", created_by_name: "Ong", created_at: "2026-10-08T01:00:00Z" },
  ],
  ...RECORDER,
};

function open(canAdjust: boolean) {
  return renderDetail(
    <DayDialog day={day} canAdjust={canAdjust} onClose={() => {}} onSaved={() => {}} />,
  );
}

describe("an operator's machine-day (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = open(true);
    expectRecordPopup(html, expect);
    expect(html).toContain("Excavator · WXY 1234");
    expect(html).toContain("Hours Tower");
    expect(html).toContain("9.00");
    // No export: a machine-day is not an exportable record.
    expect(html).not.toContain('data-stub="export"');
  });

  it("shows the stamped photos large-first in the shell", () => {
    const html = open(true);
    expect(html).toContain("data-shell-hero");
    expect(html).toContain("/media/a.jpg");
    expect(html).toContain("/media/b.jpg");
  });

  it("keeps the correction history as 更正记录 and the end-time form as the decision", () => {
    const html = open(true);
    expect(html).toContain(words.history.title);
    expect(html).toContain("Checked the log book");
    expect(html).toContain("data-shell-actions");
    expect(html).toContain(words.adjust.edit);
    expect(html).toContain(words.adjust.save);
    expect(html.indexOf("data-shell-actions")).toBeLessThan(html.indexOf(words.adjust.save));
  });

  it("offers the end-time form only to someone who may adjust", () => {
    const html = open(false);
    expect(html).not.toContain("data-shell-actions");
    expect(html).not.toContain(words.adjust.save);
    expect(html).toContain(words.history.title);
  });
});
