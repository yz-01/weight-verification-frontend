/**
 * MSE 查看权限's calls (JB220, contract §1): opening is signed with the
 * customer administrator's sign-off PIN through the shared dialog (step-up
 * action `platform_access.open`), closing is not, MSE's request keeps its
 * once-an-hour refusal for the dialog, and the record is read with its filters.
 *
 * The real API client, with `fetch` answering in turn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishTranslator } from "@/lib/i18n-runtime";
import { registerSignOff, resetSignOffForTests, type SignOffAsk } from "@/lib/sign-off";
import zh from "@/messages/zh.json";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const service = await import("./platform-access.service");

const STATUS = {
  company: "c-1",
  company_name: "示范建筑有限公司",
  view: { open: true, until: "2026-11-19T15:00:00+08:00", opened_at: "2026-11-18T15:00:00+08:00", opened_by_name: "陈经理", reason: "" },
  accounts: { open: false, until: null, opened_at: null, opened_by_name: null, reason: "", onboarding: false },
  durations: { VIEW_RECORDS: [24, 168, 720], MANAGE_ACCOUNTS: [24, 168] },
  can_change: true,
  always_visible: [],
  hidden_unless_open: [],
  external_links: [],
};

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };

function serverSays(...answers: Array<[unknown, number]>) {
  const sent: Sent[] = [];
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    sent.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const [body, status] = answers[Math.min(sent.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return sent;
}

describe("MSE 查看权限 calls (JB220)", () => {
  beforeEach(() => publishTranslator("zh", zh as unknown as Record<string, unknown>));
  afterEach(() => {
    resetSignOffForTests();
    vi.restoreAllMocks();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("opens with the PIN the shared dialog asks for, naming what it is for", async () => {
    const sent = serverSays(
      [{ success: false, message: "PIN", code: "sign_off_pin_required", errors: {}, values: { action: "platform_access.open" } }, 403],
      [{ success: true, message: "", data: STATUS }, 201],
    );
    const asks: SignOffAsk[] = [];
    registerSignOff(async (ask) => {
      asks.push(ask);
      return "135790";
    }, () => undefined);

    const result = await service.openPlatformAccess({ kind: "VIEW_RECORDS", hours: 24, reason: "  客户报称重异常 " }, () => "2026-11-19 15:00");

    expect(result.view.open).toBe(true);
    expect(sent.map((call) => call.url)).toEqual([
      expect.stringContaining("/api/platform-access/open_access/"),
      expect.stringContaining("/api/platform-access/open_access/"),
    ]);
    expect(sent[0].body).toEqual({ kind: "VIEW_RECORDS", hours: 24, reason: "客户报称重异常" });
    expect(sent[1].headers["X-Sign-Off-PIN"]).toBe("135790");
    expect(asks[0].action).toBe("platform_access.open");
    // The dialog names the operation in the reader's words.
    expect(zh.signOff.action.platform_access_open).toBe("开放 MSE 查看权限");
    expect(toast.success).toHaveBeenCalledWith("已开放，MSE 可以查看到 2026-11-19 15:00。", expect.anything());
  });

  it("a customer with no PIN yet is taken to set one (the existing step)", async () => {
    serverSays(
      [{ success: false, message: "PIN", code: "sign_off_pin_required", errors: {}, values: { action: "platform_access.open" } }, 403],
      [{ success: false, message: "Not set", code: "sign_off_pin_not_set", errors: {}, values: {} }, 403],
      [{ success: true, message: "", data: STATUS }, 201],
    );
    const asks: SignOffAsk[] = [];
    registerSignOff(async (ask) => {
      asks.push(ask);
      return "135790";
    }, () => undefined);
    await service.openPlatformAccess({ kind: "MANAGE_ACCOUNTS", hours: 168, reason: "" }, () => "x");
    expect(asks.map((ask) => ask.code)).toEqual(["sign_off_pin_required", "sign_off_pin_not_set"]);
    expect(asks[1].action).toBe("platform_access.open");
  });

  it("closes without a PIN and says it is closed", async () => {
    const sent = serverSays([{ success: true, message: "", data: { ...STATUS, view: { ...STATUS.view, open: false, until: null } } }, 200]);
    const ask = vi.fn();
    registerSignOff(ask, () => undefined);
    await service.closePlatformAccess("VIEW_RECORDS");
    expect(sent[0].body).toEqual({ kind: "VIEW_RECORDS" });
    expect(ask).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("已关闭，MSE 现在看不到了。", expect.anything());
  });

  it("asks for access in the customer's name, and leaves the once-an-hour refusal to the dialog", async () => {
    serverSays([{ success: false, message: "Sent.", code: "platform_access_request_sent", errors: {}, values: { minutes: 42 } }, 409]);
    const failure = await service
      .requestPlatformAccess({ company: "c-1", kind: "VIEW_RECORDS", reason: "需要看照片" }, { silent: true })
      .catch((error) => error);
    expect(failure.message).toBe("一小时内已经通知过这家客户，请 42 分钟后再发。");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says when the customer has nobody to tell", async () => {
    serverSays([{ success: true, message: "", data: { notified: 0 } }, 201]);
    await service.requestPlatformAccess({ company: "c-1", kind: "MANAGE_ACCOUNTS", reason: "开账号" });
    expect(toast.error).toHaveBeenCalledWith(zh.mseAccess.toast.requestedNone);
    serverSays([{ success: true, message: "", data: { notified: 2 } }, 201]);
    await service.requestPlatformAccess({ company: "c-1", kind: "MANAGE_ACCOUNTS", reason: "开账号" });
    expect(toast.success).toHaveBeenCalledWith(zh.mseAccess.toast.requested, expect.anything());
  });

  it("reads the record with its filters, and the status of a named company", async () => {
    const sent = serverSays([{ success: true, message: "", data: { count: 0, page: 1, page_size: 20, total_pages: 1, results: [] } }, 200]);
    await service.getPlatformAccessRecords({ company: "c-1", outcome: "REFUSED", date_from: "2026-11-01", page: 2, page_size: 20 });
    const url = new URL(sent[0].url);
    expect(url.pathname).toBe("/api/platform-access/get_records/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ company: "c-1", outcome: "REFUSED", date_from: "2026-11-01", page: "2", page_size: "20" });

    const status = serverSays([{ success: true, message: "", data: STATUS }, 200]);
    await service.getPlatformAccessStatus("c-1");
    expect(new URL(status[0].url).searchParams.get("company")).toBe("c-1");
    await service.getPlatformAccessStatus();
    expect(new URL(status[1].url).searchParams.has("company")).toBe(false);
  });
});
