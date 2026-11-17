/**
 * JB205 (Lucas 11-16 audit) - 通知中心 for MSE staff.
 *
 * - JB205-7: 通知管理's 退回待处理 and 移除 are `platform_settings.manage` on
 *   the server; a read-only role sees the list and 查看 only.
 * - JB205-8: the bell's 「查看全部」 opens the person's own notices
 *   (`/notifications?mine=1`), not 通知管理's list of everybody's. Builders
 *   and recyclers keep `/notifications`, which is always their own list.
 * - JB205-9: 通知管理 and 发送记录 stopped at 100 rows; both page now.
 * - JB205-10: 发送通知 says how many people it reached.
 *
 * Rendered to static markup (the runner has no DOM); the bell's address is
 * read in the source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({
  codes: new Set<string>(),
  portal: "MSE_ADMIN",
  search: "",
  sent: 0,
  toasts: [] as Array<[string, Record<string, unknown> | undefined]>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/notifications",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "MSE", portal: state.portal, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => state.codes.has(code),
  }),
}));
vi.mock("@/components/layout/module-hub-redirect", () => ({
  ModuleHubRedirect: () => <p data-marker="hub-redirect" />,
}));
vi.mock("@/components/notifications/notifications", () => ({
  Notifications: () => <p data-marker="own-notices" />,
}));
vi.mock("@/services/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api-client")>();
  return {
    ...actual,
    api: { ...actual.api, post: vi.fn(async () => ({ sent: state.sent })) },
    toastSuccess: (key: string, values?: Record<string, unknown>) => {
      state.toasts.push([key, values]);
    },
  };
});

const { AdminNotificationWorkspace } = await import("@/components/notifications/admin-notification-workspace");
const { default: NotificationsPage } = await import("@/app/(dashboard)/notifications/page");
const { sendAdminNotification } = await import("@/services/platform-ops.service");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode, seed: (qc: QueryClient) => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const ROW = {
  id: "n-1",
  kind: "SUBSCRIPTION",
  kind_label: "订阅",
  title: "订阅快到期",
  message: "还有 30 天",
  data: {},
  event: null,
  subject_kind: "",
  subject_id: null,
  card: "NOTICE",
  state: "DONE",
  resolved_at: "2026-11-15T00:00:00Z",
  is_outstanding: false,
  created_at: "2026-11-14T00:00:00Z",
  recipient: "u-2",
  recipient_name: "Ah Seng",
  recipient_email: "ahseng@example.com",
  company: null,
  company_name: null,
  latest_delivery_status: {},
  is_deleted: false,
};

const page = (results: unknown[], total_pages: number, count: number) => ({
  count,
  page: 1,
  page_size: 100,
  total_pages,
  results,
});

const seedManage = (total_pages = 1, count = 1) => (qc: QueryClient) =>
  qc.setQueryData(["admin-notifications", { page: 1, page_size: 100 }], page([ROW], total_pages, count));

beforeEach(() => {
  state.codes = new Set(["platform.monitor", "notification.view"]);
  state.portal = "MSE_ADMIN";
  state.search = "";
  state.toasts = [];
});

describe("JB205-7: 通知管理's 退回 and 移除 follow platform_settings.manage", () => {
  it("a read-only role sees the row and 查看, not 退回待处理 or 移除", () => {
    const html = render(<AdminNotificationWorkspace section="manage" />, seedManage());
    expect(html).toContain("订阅快到期");
    expect(html).toContain(`title="${zh.adminNotifications.action.view}"`);
    expect(html).not.toContain(`title="${zh.adminNotifications.action.reopen}"`);
    expect(html).not.toContain(`title="${zh.adminNotifications.action.remove}"`);
  });

  it("whoever may manage keeps both", () => {
    state.codes.add("platform_settings.manage");
    const html = render(<AdminNotificationWorkspace section="manage" />, seedManage());
    expect(html).toContain(`title="${zh.adminNotifications.action.reopen}"`);
    expect(html).toContain(`title="${zh.adminNotifications.action.remove}"`);
  });
});

describe("JB205-9: both lists page past their first 100 rows", () => {
  it("通知管理 offers 下一页 when there is more", () => {
    const html = render(<AdminNotificationWorkspace section="manage" />, seedManage(3, 250));
    expect(html).toContain(zh.table.next);
    expect(html).toContain(zh.table.previous);
    expect(html).toContain("共 250 条");
  });

  it("a list that fits on one page shows no pager, as before", () => {
    const html = render(<AdminNotificationWorkspace section="manage" />, seedManage(1, 1));
    expect(html).not.toContain(zh.table.next);
  });

  it("发送记录 offers 下一页 when there is more", () => {
    const html = render(<AdminNotificationWorkspace section="records" />, (qc) =>
      qc.setQueryData(
        ["notification-records", "delivery", 1],
        page(
          [
            {
              id: "d-1",
              notification: "n-1",
              notification_title: "订阅快到期",
              recipient_email: "ahseng@example.com",
              channel: "IN_APP",
              mode: "LIVE",
              status: "SENT",
              provider_message_id: "",
              error: "",
              attempted_at: "2026-11-14T00:00:00Z",
              created_at: "2026-11-14T00:00:00Z",
            },
          ],
          2,
          150,
        ),
      ),
    );
    expect(html).toContain("订阅快到期");
    expect(html).toContain(zh.table.next);
  });

  it("asks the server for the page it shows", () => {
    const source = read("src/components/notifications/admin-notification-workspace.tsx");
    expect(source).toMatch(/getNotificationDeliveryRecords\(\{ page, page_size: 100 \}\)/);
    expect(source).toMatch(/getNotificationStatusRecords\(\{ page, page_size: 100 \}\)/);
    expect(source).toMatch(/\(\) => \(\{\n\s+page,\n\s+page_size: 100,/);
  });
});

describe("JB205-8: MSE staff's own notices", () => {
  it("the bell's 查看全部 opens them for MSE staff, /notifications for everyone else", () => {
    const source = read("src/components/notifications/notification-button.tsx");
    expect(source).toContain('? "/notifications?mine=1"');
    expect(source).not.toContain('"/notifications/search"');
    expect(source).toMatch(/: "\/notifications";/);
  });

  it("/notifications?mine=1 is the person's own list", () => {
    state.search = "mine=1";
    expect(render(<NotificationsPage />)).toContain('data-marker="own-notices"');
  });

  it("/notifications alone still opens the module's first page for MSE staff", () => {
    expect(render(<NotificationsPage />)).toContain('data-marker="hub-redirect"');
  });

  it("a builder or recycler gets their own list, with or without it", () => {
    state.portal = "MSE_TRACE";
    expect(render(<NotificationsPage />)).toContain('data-marker="own-notices"');
    state.portal = "MSE_SCRAP";
    state.search = "mine=1";
    expect(render(<NotificationsPage />)).toContain('data-marker="own-notices"');
  });
});

describe("JB205-10: 发送通知 says how many it reached", () => {
  const input = { company_id: "c-1", kind: "SYSTEM", title: "t", message: "m", channels: ["IN_APP" as const] };

  it("names the count", async () => {
    state.sent = 12;
    await expect(sendAdminNotification(input)).resolves.toEqual({ sent: 12 });
    expect(state.toasts).toEqual([["adminNotifications.toast.sent", { count: 12 }]]);
  });

  it("says plainly when it reached nobody", async () => {
    state.sent = 0;
    await sendAdminNotification(input);
    expect(state.toasts).toEqual([["adminNotifications.toast.sentToNobody", { count: 0 }]]);
  });

  it("is worded in all four languages", async () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = (await import(`@/messages/${locale}.json`)).default as typeof zh;
      expect(messages.adminNotifications.toast.sent, locale).toContain("{count");
      expect(messages.adminNotifications.toast.sentToNobody, locale).toBeTruthy();
    }
    expect(zh.adminNotifications.toast.sent).toBe("已发送给 {count} 人。");
  });
});
