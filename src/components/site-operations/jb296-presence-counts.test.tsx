/**
 * JB296 (客户 11-28 事项 1): ah ong (a phone with the role 项目经理) could not
 * clock in, and read only 「你没有权限做这件事」.
 *
 * - The server now lets such a phone clock in; when a phone is still refused
 *   its own 进场 / 位置 (its role lacks them), the refusal is
 *   `field_presence_not_granted`, worded in the reader's language - what is
 *   missing and who switches it on - not the bare permission sentence.
 * - 「确保人员进出场记录、人员实时位置、紧急在场名单及仪表盘人数正确关联」:
 *   人员名单 workers on site by their location link are part of 当前现场总人数,
 *   the 紧急在场名单 (source 人员名单（定位链接）), 现场人员位置 (tagged 人员名单)
 *   and 公司总部's 在场人数, each line naming App + 人员名单 + 门岗通行.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttendancePresence } from "@/interfaces/site-operations";
import { publishTranslator } from "@/lib/i18n-runtime";
import { api } from "@/services/api-client";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const { PresenceSummary } = await import("@/components/site-operations/presence-summary");

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

function source(file: string) {
  return readFileSync(path.join(process.cwd(), "src", file), "utf8");
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

describe("JB296 words", () => {
  it("every language has the same JB296 keys and the refusal", () => {
    const keys = Object.keys(zh.jb296).sort();
    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      expect(Object.keys(messages.jb296).sort(), locale).toEqual(keys);
      expect(messages.errors.api.field_presence_not_granted, locale).toBeTruthy();
    }
  });

  it("speaks 你 and names the two switches the office ticks", () => {
    expect(zh.errors.api.field_presence_not_granted).toContain("现场打卡进退场");
    expect(zh.errors.api.field_presence_not_granted).toContain("手机分享本人位置");
    expect(zh.errors.api.field_presence_not_granted).toContain("角色与权限");
    for (const value of [...Object.values(zh.jb296), zh.errors.api.field_presence_not_granted]) {
      expect(value).not.toContain("您");
    }
    for (const value of [...Object.values(zhTW.jb296), zhTW.errors.api.field_presence_not_granted]) {
      expect(value).not.toContain("您");
    }
  });
});

describe("a phone refused its own 进场", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is told why, not 「你没有权限做这件事」", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          message: "Your role does not include clocking in on site.",
          code: "field_presence_not_granted",
          errors: {},
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    let message = "";
    try {
      await api.post("/api/attendance/clock/", {}, { silent: true });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toBe(zh.errors.api.field_presence_not_granted);
    expect(message).not.toBe(zh.errors.api.permission_denied);
  });
});

describe("当前现场总人数 names its three parts", () => {
  it("App 人员 + 人员名单 + 门岗通行, overall and per project", () => {
    const data: AttendancePresence = {
      current_total: 3,
      app_on_site: 1,
      roster_on_site: 1,
      gate_on_site: 1,
      still_on_site: 1,
      entered_today: 1,
      left_today: 0,
      projects: [
        {
          project_id: "p1",
          project_name: "PUTRA_MAS",
          current_total: 3,
          app_on_site: 1,
          roster_on_site: 1,
          gate_on_site: 1,
          still_on_site: 1,
          entered_today: 1,
          left_today: 0,
        },
      ],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["attendance-presence", "all"], data);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
          <PresenceSummary />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(text(html)).toContain("App 人员 1 + 人员名单 1 + 门岗通行 1");
  });
});

describe("the other lists show the roster workers", () => {
  it("紧急在场名单 words the ROSTER source and keys its rows by the roster worker", () => {
    const file = source("components/site-access/emergency-list-workspace.tsx");
    expect(file).toContain('row.source === "ROSTER" ? words("sourceRoster")');
    expect(file).toContain("row.user_id ?? row.roster_worker_id ?? row.event_id");
    expect(file).toContain('words("emergencyComposition"');
    expect(file).toContain('words("emergencySubtitle")');
    expect(zh.jb296.sourceRoster).toBe("人员名单（定位链接）");
  });

  it("现场人员位置 tags a roster worker 人员名单 instead of 实时 / 未更新", () => {
    const file = source("components/site-operations/on-site-map.tsx");
    expect(file).toContain('row.kind === "ROSTER"');
    expect(file).toContain('words("rosterTag")');
    expect(file).toContain('on-site-${row.kind ?? "APP"}-');
  });

  it("公司总部 counts them in 在场人数", () => {
    expect(source("components/dashboard/headquarters-figures.tsx")).toContain('words("hqOnSiteSplit"');
    expect(source("components/dashboard/headquarters-work.tsx")).toContain('words("hqPresenceSplit"');
    expect(source("components/dashboard/headquarters-reference.tsx")).toContain(
      "ROSTER: data.totals.roster_on_site ?? 0",
    );
  });
});
