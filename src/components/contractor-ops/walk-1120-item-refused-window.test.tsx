/**
 * Walk 11-20 (E225, 客户 11-19 事项 5): a consultant presses 「提交的记录：MO-…」 on a
 * 现场任务 whose record is of an item head office did not tick for him. The
 * server refuses it in the item's words (`consultant_sub_module_not_granted`);
 * the record's window says that sentence with nothing to retry - not
 * 「无法载入…所以这里显示的不是实际情况。请重试。」. Every other failure of the
 * window is as before, with 【重试】.
 */
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { OutgoingDetailDialog } = await import("@/components/contractor-ops/operations-workspaces");
const { ProgressInPlace } = await import("@/components/contractor-ops/office-module-lists");

const SENTENCE = "总部没有为您在这个项目开通这一项。如需查看，请联系总部。";
const refused = () =>
  new ApiError("Head office has not opened this item to you on this project.", 403, {}, "consultant_sub_module_not_granted");

/** The record's read has already failed with `error` (no second try on render). */
function failed(queryKey: string[], error: Error) {
  return (client: QueryClient) => {
    client.setQueryDefaults(queryKey, { retryOnMount: false });
    const query = client.getQueryCache().build(client, { queryKey });
    query.setState({ ...query.state, status: "error", error, fetchStatus: "idle" });
  };
}

describe("材料出场's window when the item is not his (walk 11-20 E225)", () => {
  const key = ["material-outgoing", "detail", "o1"];
  const render = (error: Error) =>
    renderDetail(<OutgoingDetailDialog id="o1" onClose={() => {}} />, failed(key, error));

  it("says head office has not opened it, with nothing to retry", () => {
    const html = render(refused());
    expect(html).toContain(SENTENCE);
    expect(html).toContain('data-slot="item-refused"');
    expect(html).not.toContain("重试");
    expect(html).not.toContain("显示的不是实际情况");
    // Still the window it was: its title, so 【关闭】 closes it back onto the task.
    expect(html).toContain("材料出场");
  });

  it("keeps 「无法载入…」 and 【重试】 for any other failure", () => {
    for (const error of [
      new ApiError("Server error", 500),
      new ApiError("This module is not open to you on this project.", 403, {}, "consultant_module_not_granted"),
      new Error("Network down"),
    ]) {
      const html = render(error);
      expect(html).toContain("无法载入这条材料出场记录，所以这里显示的不是实际情况。请重试。");
      expect(html).toContain("重试");
      expect(html).not.toContain(SENTENCE);
    }
  });
});

describe("施工进度's window when the item is not his (same line, a progress record)", () => {
  const key = ["site-progress", "one", "s1"];
  const render = (error: Error) =>
    renderDetail(<ProgressInPlace id="s1" onClose={() => {}} />, failed(key, error));

  it("says head office has not opened it, not a network fault", () => {
    const html = render(refused());
    expect(html).toContain(SENTENCE);
    expect(html).not.toContain("请检查网络");
  });

  it("keeps its own words for any other failure", () => {
    const html = render(new ApiError("Server error", 500));
    expect(html).toContain("无法读取记录，请检查网络后重试。");
    expect(html).not.toContain(SENTENCE);
  });
});
