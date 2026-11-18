/**
 * 「MSE 查看权限」 on the customer's own 公司设置 (JB220-1 / -3 / -4 / -5, 客户
 * 11-18): 「当客户使用自己的 Email 和密码登录后，MSE 管理人员及开发团队是否必须
 * 经过客户授权，才能进入客户后台查看其内部业务资料？」.
 *
 * The section answers an older boss's three questions at a glance: can MSE see
 * my records now (one sentence; an open door is amber and says when it closes
 * by itself), how do I open and close it (only the 公司管理员 presses; everyone
 * else is told whom to ask), and who looked (「MSE 查看记录」).
 *
 * Rendered to static markup (the runner has no DOM); dialogs drawn in place.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PlatformAccessRecord, PlatformAccessStatus } from "@/interfaces/platform-access";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H", timezone: "Asia/Kuala_Lumpur" } },
    can: () => true,
  }),
}));
vi.mock("@/components/ui/dialog", async () => (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule());

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { MseAccessBody, MseAccessSection, OpenAccessForm, OWN_STATUS_KEY, hoursFor } = await import(
  "@/components/platform-access/mse-access-section"
);
const { PlatformAccessRecords, recordWhere } = await import("@/components/platform-access/access-records");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const CLOSED_WINDOW = { open: false, until: null, opened_at: null, opened_by_name: null, reason: "" };

function status(overrides: Partial<PlatformAccessStatus> = {}): PlatformAccessStatus {
  return {
    company: "c-1",
    company_name: "示范建筑有限公司",
    view: { ...CLOSED_WINDOW },
    accounts: { ...CLOSED_WINDOW, onboarding: false },
    durations: { VIEW_RECORDS: [24, 168, 720], MANAGE_ACCOUNTS: [24, 168] },
    can_change: true,
    always_visible: ["company_profile", "package_billing", "users_logins", "weighing_figures", "devices", "project_directory"],
    hidden_unless_open: ["receipts", "documents", "photos", "approvals", "settlements", "workers_visitors", "plates", "chat"],
    external_links: [],
    ...overrides,
  };
}

const OPEN_VIEW = {
  open: true,
  until: "2026-11-19T15:00:00+08:00",
  opened_at: "2026-11-18T15:00:00+08:00",
  opened_by_name: "陈经理",
  reason: "客户报称重异常",
};

const body = (value: PlatformAccessStatus) =>
  renderDetail(<MseAccessBody status={value} onOpen={() => {}} onClose={() => {}} />, () => {});

const card = (html: string, kind: string) => {
  const start = html.indexOf(`data-access-card="${kind}"`);
  const end = html.indexOf("</article>", start);
  return html.slice(start, end);
};

describe("can MSE see my records right now?", () => {
  it("says so in one sentence while both doors are shut", () => {
    const html = body(status());
    expect(html).toContain("MSE（系统方）现在看不到贵公司的业务资料。");
    expect(html).toContain("MSE 现在不能帮您加账号、改账号。");
    expect(html).toContain('data-access-card="VIEW_RECORDS" data-open="false"');
    expect(html).toContain(zh.mseAccess.view.name);
    expect(html).toContain(zh.mseAccess.accounts.name);
    // The one-line explanations under each door.
    expect(html).toContain(zh.mseAccess.view.help);
    expect(html).toContain("MSE 帮您加账号、改账号之前，要您先在这里开放。");
  });

  it("an open door is amber, says until when it closes by itself, who opened it and why", () => {
    const html = body(status({ view: OPEN_VIEW }));
    const view = card(html, "VIEW_RECORDS");
    expect(view).toContain('data-open="true"');
    expect(view).toContain("bg-warning/10");
    expect(view).toMatch(/MSE 现在可以查看贵公司的业务资料（只能看，不能改），到 2026-11-19 15:00 自动关闭。/);
    expect(view).toContain("由 陈经理 在 2026-11-18 15:00 开放，原因：客户报称重异常");
    // Open: 「马上关闭」 and 「改开放时间」, not 「允许 MSE 查看」 again.
    expect(view).toContain(zh.mseAccess.action.closeNow);
    expect(view).toContain(zh.mseAccess.action.change);
    expect(view).not.toContain(`</svg>${zh.mseAccess.view.name}</button>`);
    // The other door is still shut.
    expect(card(html, "MANAGE_ACCOUNTS")).toContain('data-open="false"');
  });

  it("an open door the server says has run out reads as shut (lapsed by time)", () => {
    const html = body(status({ view: { ...OPEN_VIEW, open: false } }));
    expect(card(html, "VIEW_RECORDS")).toContain("MSE（系统方）现在看不到贵公司的业务资料。");
  });
});

describe("who may press", () => {
  it("the 公司管理员 presses", () => {
    const html = body(status());
    expect(html).not.toContain("data-mse-access-admin-only");
    expect(html).not.toContain(`title="${zh.mseAccess.adminOnly}"`);
  });

  it("anyone else sees the status, the buttons greyed with whom to ask, and the same sentence on the page", () => {
    const html = body(status({ can_change: false, view: OPEN_VIEW }));
    expect(html).toContain("data-mse-access-admin-only");
    expect(html).toContain(zh.mseAccess.adminOnly);
    // 「改开放时间」, 「马上关闭」 and 「允许 MSE 管理账号」 each carry the reason.
    expect(html.match(new RegExp(`title="${zh.mseAccess.adminOnly}"`, "g"))?.length).toBe(3);
    expect(zh.mseAccess.adminOnly).toBe("只有公司管理员可以开放或关闭，请找贵公司的管理员。");
  });
});

describe("opening", () => {
  it("offers 24 小时 / 7 天 / 30 天 to look, and 24 小时 / 7 天 to manage accounts", () => {
    const view = renderDetail(<OpenAccessForm kind="VIEW_RECORDS" status={status()} onDone={() => {}} onCancel={() => {}} />, () => {});
    expect([...view.matchAll(/data-hours="(\d+)"/g)].map((match) => match[1])).toEqual(["24", "168", "720"]);
    expect(view).toContain("24 小时");
    expect(view).toContain("30 天");
    expect(view).toContain(zh.mseAccess.openDialog.reason);
    // The PIN is asked after 「开放」, and a first-timer is told he will set one.
    expect(view).toContain(zh.mseAccess.openDialog.pin);
    expect(view).toContain(zh.mseAccess.openDialog.autoClose);

    const accounts = renderDetail(<OpenAccessForm kind="MANAGE_ACCOUNTS" status={status()} onDone={() => {}} onCancel={() => {}} />, () => {});
    expect([...accounts.matchAll(/data-hours="(\d+)"/g)].map((match) => match[1])).toEqual(["24", "168"]);
    expect(accounts).not.toContain("30 天");
  });

  it("starts on the shortest time", () => {
    const view = renderDetail(<OpenAccessForm kind="VIEW_RECORDS" status={status()} onDone={() => {}} onCancel={() => {}} />, () => {});
    expect(view).toMatch(/aria-pressed="true"[^>]*data-hours="24"/);
  });

  it("opening again while open says until when, and that the time starts again from now", () => {
    const html = renderDetail(
      <OpenAccessForm kind="VIEW_RECORDS" status={status({ view: OPEN_VIEW })} onDone={() => {}} onCancel={() => {}} />,
      () => {},
    );
    expect(html).toContain("现在已经开放到 2026-11-19 15:00。重新选择以后，从现在起重新计时。");
  });

  it("keeps to the server's durations, and the contract's when an older server names none", () => {
    expect(hoursFor(status(), "MANAGE_ACCOUNTS")).toEqual([24, 168]);
    expect(hoursFor({ durations: {} }, "VIEW_RECORDS")).toEqual([24, 168, 720]);
  });
});

describe("the two plain lists (JB220-5)", () => {
  it("say what MSE always sees and what it does not unless opened, in words", () => {
    const html = body(status());
    expect(html).toContain("MSE 一直看得到");
    expect(html).toContain("称重数量和金额（抽佣要用）");
    expect(html).toContain("项目名称和编号（用来锁档案、接设备）");
    expect(html).toContain("MSE 看不到，除非您开放");
    for (const words of ["收货记录", "文件", "照片", "审批", "结算", "工人和访客资料", "车牌", "聊天"]) expect(html).toContain(words);
    // No jargon, no raw keys.
    for (const word of ["授权范围", "租户", "审计", "workers_visitors", "project_directory"]) expect(html).not.toContain(word);
  });

  it("an unknown key from a newer server still reads as words", () => {
    expect(body(status({ hidden_unless_open: ["something_new"] }))).toContain("其他业务资料");
  });

  it("lists the external links MSE opened for the company, read-only", () => {
    const html = body(
      status({
        external_links: [
          { id: "l1", name: "业主查看", project_name: "示范商业大厦一期", expires_at: "2099-12-01T00:00:00+08:00", revoked_at: null, created_by_name: "MSE 张三", created_at: "2026-11-01T10:00:00+08:00" },
          { id: "l2", name: "旧链接", project_name: null, expires_at: "2026-01-01T00:00:00+08:00", revoked_at: "2026-02-01T00:00:00+08:00", created_by_name: "MSE 张三", created_at: "2025-12-01T10:00:00+08:00" },
        ],
      }),
    );
    expect(html).toContain(zh.mseAccess.links.title);
    expect(html).toContain("业主查看 · 示范商业大厦一期");
    expect(html).toContain("旧链接 · 整个公司");
    expect(html).toContain("已经撤销");
    expect(html).not.toContain(">撤销</button>");
  });
});

const RECORDS: PlatformAccessRecord[] = [
  { id: "r1", occurred_at: "2026-11-18T16:05:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "OPENED", kind: "RECORD", module: "weighing", record_id: "s1", record_label: "WS-000123", detail: "" },
  { id: "r2", occurred_at: "2026-11-18T15:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "陈经理", actor_email: "chen@shifan.invalid", actor_is_mse: false, outcome: "GRANT_OPENED", kind: "GRANT", module: "platform_access", record_id: "", record_label: "", detail: "VIEW_RECORDS" },
  { id: "r3", occurred_at: "2026-11-18T14:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "REFUSED", kind: "FILE", module: "weighing_photos", record_id: "s1", record_label: "WS-000123", detail: "closed" },
  { id: "r4", occurred_at: "2026-11-18T13:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "REQUESTED", kind: "REQUEST", module: "platform_access", record_id: "", record_label: "", detail: "VIEW_RECORDS" },
  { id: "r5", occurred_at: "2026-11-18T12:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "ACCOUNT_CHANGED", kind: "ACCOUNT", module: "accounts", record_id: "u9", record_label: "new.user@shifan.invalid", detail: "create_user" },
];

const page = (results: PlatformAccessRecord[], count = results.length) => ({ count, page: 1, page_size: 20, total_pages: Math.max(1, Math.ceil(count / 20)), results });

describe("「MSE 查看记录」 (JB220-3)", () => {
  const records = (rows: PlatformAccessRecord[], count?: number) =>
    renderDetail(<PlatformAccessRecords audience="customer" />, (client) => {
      client.setQueryData(["platform-access", "records", { page: 1, page_size: 20 }], page(rows, count));
    });

  it("has 时间 · MSE 人员 · 做了什么 · 看了哪里, each row in words", () => {
    const html = records(RECORDS);
    for (const column of ["时间", "MSE 人员", "做了什么", "看了哪里"]) expect(html).toContain(`>${column}<`);
    expect(html).toContain("称重记录 · WS-000123");
    expect(html).toContain("看了一笔资料");
    expect(html).toContain("被挡住（没有开放）");
    expect(html).toContain("称重照片 · WS-000123");
    expect(html).toContain("没有开放查看");
    expect(html).toContain("请求开放");
    expect(html).toContain("改了账号");
    expect(html).toContain("新增账号 · new.user@shifan.invalid");
    // The customer's own opening is in the same list, named as his.
    expect(html).toContain("陈经理（贵公司）");
    expect(html).toContain(">开放<");
    expect(html).toContain("2026-11-18 16:05");
  });

  it("an empty record is a sentence, not a blank table", () => {
    const html = records([]);
    expect(html).toContain("MSE 还没有看过贵公司的资料，也没有被挡住过。");
    expect(html).not.toContain("<table");
  });

  it("a long record pages, and says where the reader is", () => {
    const html = records(RECORDS, 45);
    expect(html).toContain("第 1 / 3 页 · 共 45 条");
    expect(html).toContain(`title="${zh.common.alreadyFirstPage}"`);
    expect(html).toContain(zh.mseAccess.records.next);
  });

  it("narrows by date and by what happened", () => {
    const html = records(RECORDS);
    expect(html).toContain('type="date"');
    expect(html).toContain(zh.mseAccess.records.filter.outcome);
    expect(html).toContain(`title="${zh.mseAccess.records.filter.nothingToClear}"`);
  });

  it("a record that did not load says so, with 重试", () => {
    const html = renderDetail(<PlatformAccessRecords audience="customer" />, (client) => {
      const query = client.getQueryCache().build(client, { queryKey: ["platform-access", "records", { page: 1, page_size: 20 }] });
      query.setState({ status: "error", error: new Error("boom"), fetchStatus: "idle" });
    });
    expect(html).toContain("无法载入MSE 查看记录");
    expect(html).toContain(zh.common.retry);
  });

  it("is cards on a phone, a table from 640 px", () => {
    const html = records(RECORDS);
    expect(html).toContain('class="divide-y sm:hidden"');
    expect(html).toContain("data-access-record-card");
    expect(html).toContain('class="hidden overflow-x-auto sm:block"');
  });

  it("words an operation or module a newer server adds", () => {
    const t = ((key: string) => key) as unknown as Parameters<typeof recordWhere>[1];
    Object.assign(t, { has: () => false });
    expect(recordWhere({ ...RECORDS[0], module: "new_thing" }, t)).toBe("module.other · WS-000123");
  });
});

describe("the section on 公司设置", () => {
  const section = (value: PlatformAccessStatus) =>
    renderDetail(<MseAccessSection />, (client) => {
      client.setQueryData(OWN_STATUS_KEY, value);
      client.setQueryData(["platform-access", "records", { page: 1, page_size: 20 }], page([]));
    });

  it("is anchored at #mse-access, where MSE's request notice lands", () => {
    const html = section(status());
    expect(html).toContain('id="mse-access"');
    expect(html).toContain(zh.mseAccess.section.title);
    expect(html).toContain(zh.mseAccess.records.title);
  });

  it("is on the builder's and the recycler's 公司设置", () => {
    for (const file of [
      "src/components/site-access/company-site-settings.tsx",
      "src/components/recycler-business/recycler-company-settings-workspace.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain('import { MseAccessSection } from "@/components/platform-access/mse-access-section";');
      expect(source).toContain("<MseAccessSection />");
    }
  });

  it("a status that did not load says so, never a shut door it did not see", () => {
    const html = renderDetail(<MseAccessSection />, (client) => {
      const query = client.getQueryCache().build(client, { queryKey: [...OWN_STATUS_KEY] });
      query.setState({ status: "error", error: new Error("boom"), fetchStatus: "idle" });
      client.setQueryData(["platform-access", "records", { page: 1, page_size: 20 }], page([]));
    });
    expect(html).toContain("无法载入MSE 查看权限");
    expect(html).not.toContain(zh.mseAccess.view.closed);
  });
});
