/**
 * JB205 (Lucas 11-16 audit) - 平台监控 for MSE staff.
 *
 * - JB205-5: 后台任务 is `platform.maintenance` on the server; the card on
 *   平台监控's first page is offered only to whoever holds it (the menu row is
 *   in `src/lib/jb205-admin-menu.test.ts`).
 * - JB205-10: 后台任务 names the seeded jobs in the reader's language with the
 *   handler code small underneath; 异常 shows the message first and the code
 *   underneath; 数据同步's 「最后检查」 is a date, not the raw ISO text.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({ codes: new Set<string>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/monitoring",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "MSE", portal: "MSE_ADMIN", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => state.codes.has(code),
  }),
}));

const { MonitoringWorkspace } = await import("@/components/monitoring/monitoring-workspace");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const OVERVIEW = {
  services: [],
  exceptions: { open: 0 },
  sync: {
    mode: "SIMULATED",
    status: "ok",
    configured: 1,
    attempts_24h: 0,
    sent_24h: 0,
    failed_24h: 0,
    pending_24h: 0,
    success_rate: 100,
    integrations: [
      {
        id: "i-1",
        name: "ERP link",
        kind: "ERP",
        company: "Builder Sdn Bhd",
        mode: "LIVE",
        status: "ACTIVE",
        last_success_at: "2026-11-16T03:04:00Z",
        last_error: "",
      },
    ],
  },
  integration_inventory: { connections: [], devices: [] },
};

function render(section: string, seed: (qc: QueryClient) => void = () => {}, codes: string[] = []) {
  state.codes = new Set(codes);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["monitoring", "overview"], OVERVIEW);
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <MonitoringWorkspace section={section as never} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB205-5: the 后台任务 card follows platform.maintenance", () => {
  it("is not offered to whoever only monitors", () => {
    const html = render("overview", () => {}, ["platform.monitor"]);
    expect(html).toContain('href="/monitoring/exceptions"');
    expect(html).not.toContain('href="/monitoring/jobs"');
  });

  it("is offered to whoever may run jobs", () => {
    const html = render("overview", () => {}, ["platform.monitor", "platform.maintenance"]);
    expect(html).toContain('href="/monitoring/jobs"');
  });
});

describe("JB205-10: 后台任务 names its jobs in Chinese, the code small underneath", () => {
  const job = (overrides: Record<string, unknown>) => ({
    id: "j-1",
    company: null,
    code: "REFRESH_BUSINESS_TARGETS",
    name: "Refresh business target progress and send milestone notifications",
    kind: "SYSTEM_TASK",
    handler: "reports.services.refresh_all_active_targets",
    payload: {},
    interval_minutes: 1440,
    next_run_at: "2026-11-17T00:00:00Z",
    is_active: true,
    max_attempts: 3,
    retry_delay_seconds: 300,
    last_run_at: null,
    last_run_state: "",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  });

  it("shows the seeded job's Chinese name and keeps its handler code", () => {
    const html = render("jobs", (qc) => {
      qc.setQueryData(["scheduled-jobs"], {
        count: 2,
        page: 1,
        page_size: 100,
        total_pages: 1,
        results: [
          job({}),
          job({ id: "j-2", code: "SOMEONES_OWN_JOB", name: "A job somebody added", handler: "platform.notify_user" }),
        ],
      });
    }, ["platform.monitor", "platform.maintenance"]);
    expect(html).toContain(zh.monitoring.jobs.name.REFRESH_BUSINESS_TARGETS);
    expect(html).not.toContain("Refresh business target progress");
    expect(html).toContain("reports.services.refresh_all_active_targets");
    // A job nobody named in the catalogue keeps the name it was given.
    expect(html).toContain("A job somebody added");
  });

  it("names every job the migrations seed, in all four languages", async () => {
    const seeded = [
      "PLATFORM_MONITOR_SNAPSHOT",
      "EXPIRE_CONTRACTOR_SUBSCRIPTIONS",
      "SEND_SUBSCRIPTION_REMINDERS",
      "GENERATE_AUTOMATIC_BILLING",
      "PROCESS_PARTNER_AGREEMENTS",
      "PROCESS_ASSET_LIFECYCLE",
      "NOTIFY_EXPIRED_SITE_ACCESS",
      "REFRESH_BUSINESS_TARGETS",
      "RETRY_NOTIFICATION_DELIVERIES",
      "PUBLISH_ANNOUNCEMENTS",
      "NOTIFY_OFFLINE_GATEWAYS",
      "REMIND_UNREAD_NOTIFICATIONS",
      "REMIND_EQUIPMENT_EXPIRY",
      "CLOSE_SILENT_PRESENCE",
      "PURGE_WORKER_POSITIONS",
      "REMIND_SUNDRY_CLAIMS",
      "REMIND_REMEDIAL_ITEMS",
    ];
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const messages = (await import(`@/messages/${locale}.json`)).default as typeof zh;
      expect(Object.keys(messages.monitoring.jobs.name).sort(), locale).toEqual([...seeded].sort());
    }
  });
});

describe("JB205-10: 异常 says what happened first", () => {
  it("puts the message above the code", () => {
    const html = render("exceptions", (qc) => {
      qc.setQueryData(["monitoring", "events", true, 1, "", "", ""], {
        count: 1,
        page: 1,
        page_size: 25,
        total_pages: 1,
        results: [
          {
            id: "e-1",
            company: null,
            company_name: null,
            project: null,
            project_name: null,
            source: "WEIGHING",
            event_type: "weighing.gateway_offline",
            severity: "WARNING",
            message: "地磅网关 15 分钟没有回报",
            payload: {},
            actor_id: null,
            device_id: "",
            occurred_at: "2026-11-16T03:04:00Z",
            correlation_id: "c-1",
            resolution_status: "OPEN",
            handled_by_name: null,
            resolution_note: "",
            resolved_at: null,
            created_at: "2026-11-16T03:04:00Z",
          },
        ],
      });
    }, ["platform.monitor"]);
    const message = html.indexOf("地磅网关 15 分钟没有回报");
    const code = html.indexOf("weighing.gateway_offline");
    expect(message).toBeGreaterThan(-1);
    expect(code).toBeGreaterThan(message);
  });
});

describe("JB205-10: 数据同步 shows a date, not ISO text", () => {
  it("formats last_success_at", () => {
    const html = render("sync", () => {}, ["platform.monitor"]);
    expect(html).toContain("ERP link");
    expect(html).not.toContain("2026-11-16T03:04:00Z");
    // 03:04 UTC is 11:04 in Kuala Lumpur.
    expect(html).toContain("2026-11-16 11:04");
  });
});
