/**
 * JB206-8 (Lucas 11-16 audit) on 设备操作员工时:
 *
 * - a driver link's 重新发送 / 停用 ask once, in the row, before they act -
 *   one tap stopped the link the driver had;
 * - 每日正常工时 shows greyed out, saying a project must be picked, instead
 *   of vanishing.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DriverLinkActions } from "@/components/equipment-hours/driver-clock-links";
import { EquipmentNormalHoursButton } from "@/components/equipment-hours/equipment-normal-hours";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const noop = () => {};
const office = messages.driverClock.office;

describe("driver link 重新发送 / 停用 ask first (JB206-8)", () => {
  it("shows the two buttons, nothing asked yet", () => {
    const html = render(
      <DriverLinkActions active asking={null} pending={false} onAsk={noop} onCancel={noop} onConfirm={noop} />,
    );
    expect(html).toContain(office.sendAgain);
    expect(html).toContain(office.stop);
    expect(html).not.toContain("data-driver-link-ask");
  });

  it("says what 重新发送 will do, with 确定 and 取消", () => {
    const html = render(
      <DriverLinkActions active asking="reissue" pending={false} onAsk={noop} onCancel={noop} onConfirm={noop} />,
    );
    expect(html).toContain('data-driver-link-ask="reissue"');
    expect(html).toContain(office.askReissue);
    expect(html).toContain(office.confirmReissue);
    expect(html).toContain(office.cancel);
  });

  it("says what 停用 will do", () => {
    const html = render(
      <DriverLinkActions active asking="stop" pending={false} onAsk={noop} onCancel={noop} onConfirm={noop} />,
    );
    expect(html).toContain(office.askStop);
    expect(html).toContain(office.confirmStop);
  });
});

describe("每日正常工时 before a project is picked (JB206-8)", () => {
  it("is shown greyed out with the reason", () => {
    const html = render(<EquipmentNormalHoursButton project="" />);
    expect(html).toContain(messages.equipmentHours.normal.title);
    expect(html).toContain(messages.equipmentHours.normal.chooseProject);
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
