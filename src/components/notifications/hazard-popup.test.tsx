/**
 * C3: what the hazard pop-up draws. Rendered to static markup - the runner has
 * no DOM - so this checks the drawing, not the timers (those are in
 * `lib/hazard-popup.test.ts`).
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HAZARD_POPUP_MS, hazardCardFromEvent } from "@/lib/hazard-popup";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const { HazardPopupStack } = await import("@/components/notifications/hazard-popup");

const NOW = 5_000_000;

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const card = hazardCardFromEvent(
  {
    event_type: "notification.created",
    payload: {
      notification_id: "n1",
      kind: "safety.hazard_message",
      title: "SI-A-0001 有新讯息",
      message: "Ali：栏杆修好了。",
      data: {
        incident_id: "incident-1",
        incident_no: "SI-A-0001",
        incident_title: "安全部整改",
        actor_name: "Ali",
        record_status: "RECTIFICATION_SUBMITTED",
      },
    },
  },
  NOW,
)!;

describe("HazardPopupStack", () => {
  it("draws nothing when nothing has happened", () => {
    expect(render(<HazardPopupStack cards={[]} now={NOW} onDismiss={() => undefined} />)).toBe("");
  });

  it("shows the number, the title, who did what, and 打开", () => {
    const html = render(<HazardPopupStack cards={[card]} now={NOW} onDismiss={() => undefined} />);
    expect(html).toContain('aria-label="隐患整改提醒"');
    expect(html).toContain("SI-A-0001");
    expect(html).toContain("安全部整改");
    expect(html).toContain("Ali · SI-A-0001 有新讯息");
    expect(html).toContain("Ali：栏杆修好了。");
    expect(html).toContain(">打开<");
    expect(html).toContain('aria-label="关闭"');
    // Slides in, and stands still for anyone who asked for less motion.
    expect(html).toContain("slide-in-from-bottom-4");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain("data-leaving");
  });

  it("marks a card sliding out once its eight seconds are up", () => {
    const html = render(
      <HazardPopupStack cards={[card]} now={NOW + HAZARD_POPUP_MS} onDismiss={() => undefined} />,
    );
    expect(html).toContain('data-leaving="true"');
  });
});
