/**
 * 「MSE 查看权限」 on the customer's own 公司设置 (JB220-1 / -3 / -4 / -5, 客户
 * 11-18): 「当客户使用自己的 Email 和密码登录后，MSE 管理人员及开发团队是否必须
 * 经过客户授权，才能进入客户后台查看其内部业务资料？」.
 *
 * The section answers an older boss's three questions at a glance: can MSE see
 * my records now (one sentence; an open door is amber and says when it closes
 * by itself), how do I open and close it (only the 公司管理员 presses; everyone
 * else is told whom to ask), and who looked (「MSE 查看记录」) - plus the three
 * plain lists and the accounts MSE made (contract §8.1, §8.1a, §8.1b).
 *
 * Rendered to static markup (the runner has no DOM); dialogs drawn in place.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PlatformAccessRecord, PlatformAccessStatus } from "@/interfaces/platform-access";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ auditView: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H", timezone: "Asia/Kuala_Lumpur" } },
    can: (code: string) => code !== "audit.view" || reader.auditView,
  }),
}));
vi.mock("@/components/ui/dialog", async () => (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule());

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { LIST_KEYS, MseAccessBody, MseAccessSection, MseAddedBadge, OpenAccessForm, OWN_STATUS_KEY, hoursFor } = await import(
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
    always_visible: LIST_KEYS.always,
    visible_when_open: LIST_KEYS.open,
    never_visible: LIST_KEYS.never,
    mse_added_accounts: [],
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

const slice = (html: string, marker: string, end: string) => {
  const start = html.indexOf(marker);
  return html.slice(start, html.indexOf(end, start));
};
const card = (html: string, kind: string) => slice(html, `data-access-card="${kind}"`, "</article>");

describe("can MSE see my records right now?", () => {
  it("says so in one sentence per door while both are shut, pointing at list 2", () => {
    const html = body(status());
    expect(html).toContain("MSE（系统方）现在看不到下面第 2 栏的资料；需要 MSE 帮忙查看时，点「允许 MSE 查看」。");
    expect(html).toContain("MSE 现在不能加或改贵公司的账号；需要 MSE 帮忙开账号时，点「允许 MSE 管理账号」。");
    expect(html).toContain('data-access-card="VIEW_RECORDS" data-open="false"');
    expect(card(html, "VIEW_RECORDS")).toContain(">没有开放<");
    expect(html).toContain("MSE 帮您加账号、改账号之前，要您先在这里开放。");
  });

  it("an open door is amber, says until when it closes by itself, who opened it and why", () => {
    const html = body(status({ view: OPEN_VIEW }));
    const view = card(html, "VIEW_RECORDS");
    expect(view).toContain('data-open="true"');
    expect(view).toContain("bg-warning/10");
    expect(view).toContain(">开放中<");
    expect(view).toContain("MSE 现在可以看到下面第 2 栏的资料（只能看，不能改，不能下载），到 2026-11-19 15:00 自动关闭；不想等可以点「马上关闭」。");
    expect(view).toContain("由 陈经理 在 2026-11-18 15:00 开放，原因：客户报称重异常");
    expect(view).toContain(zh.mseAccess.action.closeNow);
    expect(view).toContain(zh.mseAccess.action.change);
    expect(card(html, "MANAGE_ACCOUNTS")).toContain('data-open="false"');
  });

  it("an open 管理账号 says each change is told", () => {
    const html = body(status({ accounts: { ...OPEN_VIEW, onboarding: false } }));
    expect(card(html, "MANAGE_ACCOUNTS")).toContain("MSE 现在可以帮贵公司加账号、改账号，每一次都会通知您，到 2026-11-19 15:00 自动关闭。");
  });

  it("a door the server says has run out reads as shut (lapsed by time)", () => {
    const html = body(status({ view: { ...OPEN_VIEW, open: false } }));
    expect(card(html, "VIEW_RECORDS")).toContain("MSE（系统方）现在看不到下面第 2 栏的资料");
  });
});

describe("who may press", () => {
  it("the 公司管理员 presses", () => {
    const html = body(status());
    expect(html).not.toContain("data-mse-access-admin-only");
    expect(html).not.toContain(`title="${zh.mseAccess.adminOnly}"`);
  });

  it("anyone else sees everything, the buttons greyed with whom to ask, and the same sentence on the page", () => {
    const html = body(status({ can_change: false, view: OPEN_VIEW }));
    expect(html).toContain("data-mse-access-admin-only");
    expect(zh.mseAccess.adminOnly).toBe("只有公司管理员可以开放或关闭，请找贵公司的管理员。");
    // 「改开放时间」, 「马上关闭」 and 「允许 MSE 管理账号」 each carry the reason.
    expect(html.match(new RegExp(`title="${zh.mseAccess.adminOnly}"`, "g"))?.length).toBe(3);
  });
});

describe("opening", () => {
  const form = (kind: "VIEW_RECORDS" | "MANAGE_ACCOUNTS", value = status()) =>
    renderDetail(<OpenAccessForm kind={kind} status={value} onDone={() => {}} onCancel={() => {}} />, () => {});

  it("offers 24 小时 / 7 天 / 30 天 to look, and 24 小时 / 7 天 to manage accounts", () => {
    const view = form("VIEW_RECORDS");
    expect([...view.matchAll(/data-hours="(\d+)"/g)].map((match) => match[1])).toEqual(["24", "168", "720"]);
    expect(view).toContain("开放多久？时间到了会自动关闭。");
    expect(view).toContain(zh.mseAccess.openDialog.reason);
    // The PIN is asked after 「开放」; a first-timer is told he will set one.
    expect(view).toContain(zh.mseAccess.openDialog.pin);
    expect(zh.mseAccess.openDialog.pin).toContain("还没设定过的，会先请您设定一个");

    const accounts = form("MANAGE_ACCOUNTS");
    expect([...accounts.matchAll(/data-hours="(\d+)"/g)].map((match) => match[1])).toEqual(["24", "168"]);
    expect(accounts).not.toContain("30 天");
  });

  it("starts on the shortest time", () => {
    expect(form("VIEW_RECORDS")).toMatch(/aria-pressed="true"[^>]*data-hours="24"/);
  });

  it("opening again while open says until when, and that the time starts again from now", () => {
    expect(form("VIEW_RECORDS", status({ view: OPEN_VIEW }))).toContain(
      "现在已经开放到 2026-11-19 15:00。重新选择以后，从现在起重新计时。",
    );
  });

  it("keeps to the server's durations, and the contract's when an older server names none", () => {
    expect(hoursFor(status(), "MANAGE_ACCOUNTS")).toEqual([24, 168]);
    expect(hoursFor({ durations: {} }, "VIEW_RECORDS")).toEqual([24, 168, 720]);
  });
});

describe("the three plain lists (JB220-5, contract §8.1a)", () => {
  it("are numbered, titled as the contract writes them, in this order", () => {
    const html = body(status());
    const lists = [...html.matchAll(/data-mse-list="(\w+)"/g)].map((match) => match[1]);
    expect(lists).toEqual(["always", "open", "never"]);
    expect(html).toContain("MSE 一直看得到（开户、收费、管设备要用）");
    expect(html).toContain("您按「允许 MSE 查看」后，MSE 才看得到");
    expect(html).toContain("MSE 一直看不到（就算您开放了查看）");
    for (const number of ["1", "2", "3"]) expect(html).toMatch(new RegExp(`aria-hidden="true">${number}</span>`));
  });

  it("word every key, and say how to let MSE in for hands-on help under list 3", () => {
    const html = body(status());
    expect(html).toContain("每一笔称重的单号、时间、地磅、重量和检测结果");
    expect(html).toContain("称重单的照片、附件、更正记录和磅单 PDF（只能在页面上看，不能下载）");
    expect(html).toContain("收货单、材料申请、领用和退货");
    expect(html).toContain("项目里面的详细资料（地址、预算、团队）");
    const never = slice(html, 'data-mse-list="never"', "</section>");
    expect(never).toContain("开放查看时，通知内容和操作记录里写到的单号和数量，MSE 会看得到。");
    expect(never).toContain("需要 MSE 进来帮忙看这些时，请按「允许 MSE 管理账号」。MSE 会在贵公司加一个协助账号；它会列在下面「MSE 加的账号」里，您随时可以停用。");
    expect(never).toContain("MSE 用协助账号做的事，记在贵公司自己的登录记录和操作记录里。");
    // No jargon, no raw keys.
    for (const word of ["授权范围", "租户", "审计", "receipts_materials", "weighing_details"]) expect(html).not.toContain(word);
  });

  it("an unknown key from a newer server still reads as words", () => {
    expect(body(status({ never_visible: ["something_new"] }))).toContain("其他业务资料");
  });

  it("stack on a phone, side by side on a desk", () => {
    expect(body(status())).toContain('class="grid gap-4 lg:grid-cols-3" data-mse-lists');
  });
});

describe("「MSE 加的账号」 (contract §8.1b)", () => {
  it("lists each account MSE made, labelled, with the way to stop it in 用户管理", () => {
    const html = body(
      status({
        mse_added_accounts: [
          { id: "u-own", full_name: "陈经理", email: "boss@shifan.invalid", role_name: "公司管理员", status: "ACTIVE", kind: "owner", added_at: "2026-10-01T09:00:00+08:00", added_by_name: "MSE 张三", last_login_at: "2026-11-17T08:00:00+08:00" },
          { id: "u-sup", full_name: "MSE 协助", email: "support@shifan.invalid", role_name: "项目经理", status: "INVITED", kind: "added", added_at: "2026-11-18T10:00:00+08:00", added_by_name: "MSE 张三", last_login_at: null },
        ],
      }),
    );
    const added = slice(html, "data-mse-added", "</section>");
    expect(added).toContain("MSE 加的账号");
    expect(added).toContain("开户时由 MSE 建立的负责人账号");
    expect(added).toContain(">MSE 加的<");
    expect(added).toContain("boss@shifan.invalid · 公司管理员");
    expect(added).toContain("MSE 张三 在 2026-11-18 10:00 加的");
    expect(added).toContain("最近登录 2026-11-17 08:00");
    expect(added).toContain("还没登录过");
    expect(added).toContain(zh.users.status.INVITED);
    expect(added).toContain('href="/users/u-sup"');
    expect(added).toContain("到「用户管理」查看或停用");
    expect(added).toContain("不需要的账号，请到「用户管理」把它停用；停用后 MSE 就不能再用它登录。");
    // A link, not a new way to write.
    expect(added).not.toContain("<button");
  });

  it("an empty list is a sentence", () => {
    expect(body(status())).toContain("MSE 没有在贵公司加过账号。");
  });

  it("the badge says which kind, and nothing for an account the customer made", () => {
    expect(renderDetail(<MseAddedBadge kind="added" />, () => {})).toContain("MSE 加的");
    expect(renderDetail(<MseAddedBadge kind="owner" />, () => {})).toContain("开户时由 MSE 建立的负责人账号");
    expect(renderDetail(<MseAddedBadge kind={null} />, () => {})).toBe("");
  });

  it("the customer's 用户管理 and user page carry the badge", () => {
    expect(read("src/components/users/users.tsx")).toContain("<MseAddedBadge kind={row.original.mse_added} />");
    expect(read("src/components/users/view-user.tsx")).toContain("<MseAddedBadge kind={data.mse_added} />");
  });
});

describe("the external links MSE opened", () => {
  it("are listed read-only, revoked ones said so", () => {
    const html = body(
      status({
        external_links: [
          { id: "l1", name: "业主查看", project_name: "示范商业大厦一期", expires_at: "2099-12-01T00:00:00+08:00", revoked_at: null, created_by_name: "MSE 张三", created_at: "2026-11-01T10:00:00+08:00" },
          { id: "l2", name: "旧链接", project_name: null, expires_at: "2026-01-01T00:00:00+08:00", revoked_at: "2026-02-01T00:00:00+08:00", created_by_name: "MSE 张三", created_at: "2025-12-01T10:00:00+08:00" },
        ],
      }),
    );
    expect(html).toContain("MSE 帮您开的外部访问链接");
    expect(html).toContain("业主查看 · 示范商业大厦一期");
    expect(html).toContain("旧链接 · 整个公司");
    expect(html).toContain("已经撤销");
    expect(html).not.toContain(">撤销</button>");
  });

  it("none is a sentence", () => {
    expect(body(status())).toContain("MSE 没有帮您开过外部访问链接。");
  });
});

const RECORDS: PlatformAccessRecord[] = [
  { id: "r1", occurred_at: "2026-11-18T16:05:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "OPENED", kind: "RECORD", module: "weighing", record_id: "s1", record_label: "WS-000123", detail: "" },
  { id: "r2", occurred_at: "2026-11-18T15:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "陈经理", actor_email: "chen@shifan.invalid", actor_is_mse: false, outcome: "GRANT_OPENED", kind: "GRANT", module: "platform_access", record_id: "", record_label: "", detail: "VIEW_RECORDS" },
  { id: "r3", occurred_at: "2026-11-18T14:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "REFUSED", kind: "FILE", module: "weighing_photos", record_id: "s1", record_label: "WS-000123", detail: "closed" },
  { id: "r4", occurred_at: "2026-11-18T13:00:00+08:00", company: "c-1", company_name: "示范建筑有限公司", actor_name: "MSE 张三", actor_email: "zhang@mse.invalid", actor_is_mse: true, outcome: "REQUESTED", kind: "REQUEST", module: "platform_access", record_id: "", record_label: "客户报称重异常，需要看照片", detail: "VIEW_RECORDS" },
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
    expect(html).toContain(zh.mseAccess.records.help);
    expect(html).toContain("称重记录 · WS-000123");
    expect(html).toContain("看了一笔资料");
    expect(html).toContain("被挡住（没有开放）");
    expect(html).toContain("称重照片 · WS-000123");
    expect(html).toContain("没有开放查看");
    expect(html).toContain("请求开放");
    // MSE's reason for asking is shown with the request (contract (c)).
    expect(html).toContain("允许 MSE 查看 · 客户报称重异常，需要看照片");
    expect(html).toContain("改了账号");
    expect(html).toContain("新增账号 · new.user@shifan.invalid");
    // The customer's own opening is in the same list, named as his.
    expect(html).toContain("陈经理（贵公司）");
    expect(html).toContain(">开放<");
    expect(html).toContain("2026-11-18 16:05");
  });

  it("an empty record is a sentence, not a blank table", () => {
    const html = records([]);
    expect(html).toContain("还没有记录：MSE 没有看过贵公司的资料，也没有被挡住过。");
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

  it("words a module a newer server adds", () => {
    const t = ((key: string) => key) as unknown as Parameters<typeof recordWhere>[1];
    Object.assign(t, { has: () => false });
    expect(recordWhere({ ...RECORDS[0], module: "new_thing" }, t)).toBe("module.other · WS-000123");
  });
});

describe("the section on 公司设置", () => {
  it("is anchored at #mse-access, where MSE's request notice lands", () => {
    const html = renderDetail(<MseAccessSection />, (client) => {
      client.setQueryData(OWN_STATUS_KEY, status());
      client.setQueryData(["platform-access", "records", { page: 1, page_size: 20 }], page([]));
    });
    expect(html).toContain('id="mse-access"');
    expect(html).toContain(zh.mseAccess.section.title);
    expect(html).toContain(zh.mseAccess.records.title);
  });

  it("a colleague who may not read the record is told who can, instead of a failed list", () => {
    reader.auditView = false;
    const html = renderDetail(<MseAccessSection />, (client) => {
      client.setQueryData(OWN_STATUS_KEY, status({ can_change: false }));
    });
    reader.auditView = true;
    expect(html).toContain(zh.mseAccess.records.notAllowed);
    expect(html).not.toContain("无法载入");
    // The doors and the lists are still there for him to read.
    expect(html).toContain(zh.mseAccess.lists.openTitle);
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
