/**
 * 2026-11-14: with no network the phone says so once, at the top - not in red
 * under every list (Lucas 2026-10-23: 没有网络不是失败).
 *
 * The office's `QueryFailedNote` already did this. The phone's own notes and
 * the project box did not: offline, the header said 「你的项目读取失败」 in red
 * and the project box said 「无法加载项目，请检查此账号的项目权限后重试」 - a
 * permission problem that did not exist.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";

const phone = vi.hoisted(() => ({ offline: false }));
vi.mock("@/hooks/use-phone-offline", () => ({ usePhoneOffline: () => phone.offline }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-phone", is_field_staff: true, active_project: null }, can: () => true }),
}));

const { FieldLoadFailed, FieldLoadNote } = await import("@/components/field-staff/field-load-note");
const { ProjectPicker } = await import("@/components/site-operations/project-picker");

function draw(node: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const failed = { isError: true, refetch: () => undefined };

describe("a list that did not load on the phone", () => {
  beforeEach(() => {
    phone.offline = false;
  });

  it("says so in red, with a retry, when the phone has a network", () => {
    const html = draw(<FieldLoadNote query={failed} what="你的项目" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("你的项目读取失败。");
    expect(html).toContain("text-destructive");
    expect(html).toContain("<button");
  });

  it("is one grey line without a network - no alert, no red, nothing to press", () => {
    phone.offline = true;
    const html = draw(<FieldLoadNote query={failed} what="你的项目" />);
    expect(html).toContain("data-field-load-offline");
    expect(html).toContain("没有网络，你的项目等有网络时再载入。");
    expect(html).not.toContain("读取失败");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("text-destructive");
    expect(html).not.toContain("<button");
  });

  it("is nothing at all when the list loaded", () => {
    phone.offline = true;
    expect(draw(<FieldLoadNote query={{ isError: false }} what="你的项目" />)).toBe("");
  });

  it("is as quiet in place of a whole list", () => {
    const online = draw(<FieldLoadFailed what="提交记录" onRetry={() => undefined} />);
    expect(online).toContain('role="alert"');
    expect(online).toContain("提交记录读取失败。");
    phone.offline = true;
    const offline = draw(<FieldLoadFailed what="提交记录" onRetry={() => undefined} />);
    expect(offline).toContain("没有网络，提交记录等有网络时再载入。");
    expect(offline).not.toContain('role="alert"');
    expect(offline).not.toContain("text-destructive");
    expect(offline).not.toContain("<button");
  });
});

describe("the project box when its list did not load", () => {
  beforeEach(() => {
    phone.offline = false;
  });

  const box = () =>
    draw(
      <ProjectPicker value="" onValueChange={() => {}} placeholder="选择项目" projects={[]} projectsError />,
    );

  it("keeps its red sentence for a real failure", () => {
    const html = box();
    expect(html).toContain("无法加载项目，请检查此账号的项目权限后重试。");
    expect(html).toContain('role="alert"');
  });

  it("does not blame the account's permissions for a missing network", () => {
    phone.offline = true;
    const html = box();
    expect(html).toContain("data-project-offline");
    expect(html).toContain("没有网络，项目列表等有网络时再载入。");
    expect(html).not.toContain("项目权限");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("text-destructive");
  });

  it("is said in all four languages", () => {
    for (const catalogue of [messages, zhTW, en, ms]) {
      expect(catalogue.siteControl.state.projectLoadOffline.length).toBeGreaterThan(10);
    }
    expect(en.siteControl.state.projectLoadOffline).toContain("No network");
  });
});
