/**
 * What `?notice=<id>` opens (JB97, Lucas 11-03: 「铃铛那里按进去确保是可以看到
 * 事项的详情，不是首页，手机端和后台都一样」).
 *
 * A push names the notice when the server cannot name a screen for it. The
 * opener goes on to the item with the bell's own rule, or - with nowhere to
 * go - shows the notice whole. Never the home page.
 */
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { NoticeOpener } = await import("@/components/notifications/notice-opener");
const { fieldNoticeHref } = await import("@/lib/field-notification");
const { officeNoticeHref } = await import("@/lib/office-notification");

const pass = {
  id: "n-1",
  kind: "site_access.pass_expired",
  kind_label: "通行证",
  title: "通行证已过期",
  message: "PS-0001 · Ali 的通行证已于 2026-11-01 过期",
  data: { href: "" },
  event: null,
  subject_kind: "",
  subject_id: null,
  card: "NOTICE" as const,
  state: "PENDING" as const,
  resolved_at: null,
  is_outstanding: true,
  created_at: "2026-11-03T01:00:00Z",
};

function seed(row: typeof pass | null) {
  return (client: import("@tanstack/react-query").QueryClient) =>
    client.setQueryData(["notifications", "one", "n-1"], row);
}

describe("NoticeOpener (JB97)", () => {
  it("shows a notice with nowhere to go whole, with 确认完成", () => {
    const html = renderDetail(
      <NoticeOpener id="n-1" resolve={fieldNoticeHref} navigate={() => {}} onClose={() => {}} />,
      seed(pass),
    );
    expect(html).toContain("通行证已过期");
    expect(html).toContain("PS-0001 · Ali 的通行证已于 2026-11-01 过期");
    expect(html).toContain(messages.notifications.confirmDone);
  });

  it("shows nothing of its own when the notice has an item to open", () => {
    // The effect navigates; the markup is empty rather than a flash of the notice.
    const corrected = {
      ...pass,
      title: "你的记录 PG-builder-001-004 被后台改正了",
      data: { href: "/field-staff?tab=submissions", record_kind: "PROGRESS", record_id: "pg-4" },
    };
    const html = renderDetail(
      <NoticeOpener id="n-1" resolve={fieldNoticeHref} navigate={() => {}} onClose={() => {}} />,
      seed(corrected),
    );
    expect(html).not.toContain(corrected.title);
    expect(fieldNoticeHref(corrected)).toBe("/field-staff?tab=home&submission=PROGRESS%3Apg-4");
  });

  it("says so when the notice is not there", () => {
    const html = renderDetail(
      <NoticeOpener id="n-1" resolve={officeNoticeHref} navigate={() => {}} onClose={() => {}} />,
      seed(null),
    );
    expect(html).toContain(messages.notifications.notice.missing);
  });
});
