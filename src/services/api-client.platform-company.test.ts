/**
 * JB220 (客户 11-18 「MSE 管理人员……是否必须经过客户授权，才能进入客户后台查看
 * 其内部业务资料？」): an MSE screen that opens a customer's record names that
 * customer in `X-MSE-Company` (`platformCompany`), and every refusal of the
 * door reaches the toast as the sentence that says what to do next - never the
 * server's English, never a code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import { publishTranslator } from "@/lib/i18n-runtime";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn(), dismiss: vi.fn() } }));

const { api, fetchObjectUrl } = await import("./api-client");

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function serverSays(body: unknown, status: number) {
  const headers: Array<Record<string, string>> = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    headers.push({ ...((init?.headers ?? {}) as Record<string, string>) });
    return json(body, status);
  }) as unknown as typeof fetch;
  return headers;
}

const REFUSALS = [
  "platform_access_closed",
  "platform_access_company_required",
  "platform_access_view_only",
  "platform_access_not_available",
  "platform_accounts_closed",
  "platform_owner_locked",
  "platform_access_admin_only",
  "platform_access_request_sent",
] as const;

describe("X-MSE-Company (JB220)", () => {
  beforeEach(() => publishTranslator("zh", zh as unknown as Record<string, unknown>));
  afterEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
  });

  it("names the customer only when the screen says which", async () => {
    const sent = serverSays({ success: true, message: "", data: { results: [], count: 0 } }, 200);
    await api.list("/api/device-media/get_media/", { source_id: "s1" }, { platformCompany: "c-recycler" });
    await api.list("/api/weigh-sessions/get_sessions/");
    expect(sent[0]["X-MSE-Company"]).toBe("c-recycler");
    expect(sent[1]).not.toHaveProperty("X-MSE-Company");
  });

  it("carries it on a file fetched for a preview too", async () => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
    const sent: Array<Record<string, string>> = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent.push({ ...((init?.headers ?? {}) as Record<string, string>) });
      return new Response(new Blob(["%PDF"]), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchObjectUrl("/api/record-exports/download/", { platformCompany: "c-recycler" });
    expect(sent[0]["X-MSE-Company"]).toBe("c-recycler");
  });

  it("toasts a closed door as the sentence that says whom to ask", async () => {
    serverSays(
      { success: false, message: "Closed.", code: "platform_access_closed", errors: {}, values: { company_name: "E2E Recycling" } },
      403,
    );
    const failure = await api.list("/api/device-media/get_media/", {}, { platformCompany: "c1" }).catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("platform_access_closed");
    expect(toastError).toHaveBeenCalledWith(zh.errors.api.platform_access_closed);
    expect(zh.errors.api.platform_access_closed).toContain("允许 MSE 查看");
  });

  it("words the once-an-hour refusal with its minutes", async () => {
    serverSays(
      { success: false, message: "Sent.", code: "platform_access_request_sent", errors: {}, values: { minutes: 42 } },
      409,
    );
    await api.post("/api/platform-access/request_access/", {}).catch(() => undefined);
    expect(toastError).toHaveBeenCalledWith("一小时内已经通知过这家客户，请 42 分钟后再发。");
  });

  it("has every refusal in all four languages, with the contract's Chinese", () => {
    const contractZh: Record<(typeof REFUSALS)[number], string> = {
      platform_access_closed: "这家客户现在没有开放查看，请客户管理员在「公司设置」里点「允许 MSE 查看」后再打开。",
      platform_access_company_required: "没有说明是哪一家客户的资料，请从这家客户的公司页面或称重单重新打开。",
      platform_access_view_only: "客户只开放了查看，MSE 只能在页面上预览，不能修改、下载或导出客户的资料。",
      platform_access_not_available:
        "这是客户自己的业务资料，MSE 后台不能打开；需要帮客户看时，请客户开放「允许 MSE 管理账号」，由 MSE 给客户加一个客户看得到、随时可删的支持账号。",
      platform_accounts_closed: "改这家客户的账号要客户同意，请客户管理员在「公司设置」里点「允许 MSE 管理账号」后再试。",
      platform_owner_locked:
        "客户已经开始用这个管理员账号，MSE 不能改它的登录邮箱；请告诉客户：由客户自己的公司管理员在「用户管理」里修改，或者客户来函，由管服务器的同事处理。",
      platform_access_admin_only: "只有公司管理员可以开放或关闭 MSE 查看权限，请找贵公司的管理员。",
      platform_access_request_sent: "一小时内已经通知过这家客户，请 {minutes} 分钟后再发。",
    };
    for (const code of REFUSALS) {
      expect((zh.errors.api as Record<string, string>)[code]).toBe(contractZh[code]);
      for (const catalogue of [en, zhTW, ms]) {
        const words = (catalogue.errors.api as Record<string, string>)[code];
        expect(words, code).toBeTruthy();
        expect(words).not.toMatch(/platform_/);
      }
    }
    expect(zh.signOff.action.platform_access_open).toBe("开放 MSE 查看权限");
    expect(en.signOff.action.platform_access_open).toBeTruthy();
  });
});
