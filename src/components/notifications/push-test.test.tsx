/**
 * 「发一条测试通知」 (JB156, 客户 11-10 第四批): the button and what it says
 * back. Rendered to static markup - the runner has no DOM.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

vi.mock("@/services/push-notification.service", () => ({ sendTestPush: vi.fn() }));

const { PushTestButton, PushTestResult, pushAdvicePlatform } = await import(
  "@/components/notifications/push-test"
);

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

const TURN_ON = "打开通知";

describe("the test-push button", () => {
  it("can be pressed until a test is on its way", () => {
    const html = render(<PushTestButton state="idle" onSend={() => undefined} />);
    expect(html).toContain("发一条测试通知");
    expect(html).not.toContain('disabled=""');
  });

  it("is greyed while the test is sent, and says so", () => {
    const html = render(<PushTestButton state="pending" onSend={() => undefined} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="正在发送测试通知…"');
    expect(html).toContain("animate-spin");
  });

  it("can be pressed again once the answer is in", () => {
    for (const state of [{ sent: true as const }, { sent: false as const, code: "push_endpoint_gone" }]) {
      expect(render(<PushTestButton state={state} onSend={() => undefined} />)).not.toContain('disabled=""');
    }
  });
});

describe("what the test came to", () => {
  it("says nothing before the test or while it is sent", () => {
    expect(render(<PushTestResult state="idle" button={TURN_ON} />)).toBe("");
    expect(render(<PushTestResult state="pending" button={TURN_ON} />)).toBe("");
  });

  it("sent: the phone should ring within seconds", () => {
    expect(render(<PushTestResult state={{ sent: true }} button={TURN_ON} />)).toContain(
      "已发出。几秒内这支手机应该响一声，屏幕上出现通知。",
    );
  });

  it("not sent on an iPhone: why, then 「打开通知」, then add the icon again from Safari", () => {
    const html = render(
      <PushTestResult state={{ sent: false, code: "push_endpoint_gone" }} button={TURN_ON} platform="ios" />,
    );
    expect(html).toContain("role=\"alert\"");
    expect(html).toContain("没有发出：苹果 / 谷歌说这支手机的通知登记已经失效。");
    expect(html).toContain(
      "请按「打开通知」再试一次；还是不行，删掉手机上的 MSE Trace 图标，从 Safari 重新加到主屏幕。",
    );
  });

  it("not sent on Android: install from Chrome again; the bell names its own button", () => {
    const html = render(
      <PushTestResult
        state={{ sent: false, code: "push_provider_unreachable" }}
        button="开启浏览器通知"
        platform="android"
      />,
    );
    expect(html).toContain("没有发出：苹果 / 谷歌没有回应，可能是网络问题。");
    expect(html).toContain("请按「开启浏览器通知」再试一次；还是不行，删掉手机上的 MSE Trace 图标，用 Chrome 打开网站");
  });

  it("a refusal the server already worded is shown as it is", () => {
    const html = render(
      <PushTestResult
        state={{ sent: false, code: "push_test_too_soon", message: "测试通知刚发过，请等 9 秒再发。" }}
        button={TURN_ON}
        platform="other"
      />,
    );
    expect(html).toContain("没有发出：测试通知刚发过，请等 9 秒再发。");
    expect(html).toContain("请在浏览器设置里允许本网站的通知");
  });

  it("an answer with no words of its own still reads as a sentence", () => {
    const html = render(<PushTestResult state={{ sent: false, code: "" }} button={TURN_ON} platform="ios" />);
    expect(html).toContain("没有发出：");
    expect(html).not.toContain("errors.api");
  });
});

describe("which way back the advice names", () => {
  it("iPhone, Android, and everything else", () => {
    expect(pushAdvicePlatform("ios-safari")).toBe("ios");
    expect(pushAdvicePlatform("ios-chrome")).toBe("ios");
    expect(pushAdvicePlatform("android")).toBe("android");
    expect(pushAdvicePlatform("desktop-chromium")).toBe("other");
  });
});
