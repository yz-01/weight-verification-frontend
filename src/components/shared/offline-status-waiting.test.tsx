/**
 * A record that still goes by itself, but has not (JB106).
 *
 * 客户 11-05 (re-test of 事项 1): 「已暂存1条，等待上传」 stayed with 4G on, the
 * yellow 1 never went, and nothing said why. 「上传失败必须显示原因，并提供重试
 * 功能」 and 「必须保留原来的照片及记录，不可直接删除」. So a waiting record is
 * listed with why its last try did not go and 「立即上传」 - and no delete.
 *
 * The runner has no DOM, so screens are rendered to static markup.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";
import {
  JOB_STALL_MS,
  QUEUE_ERROR_SIGNED_OUT,
  QUEUE_ERROR_STALLED,
  type OfflineQueueEntry,
  waitingReason,
  withinTime,
} from "@/services/offline-sync.service";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/providers/offline-sync-provider", () => ({
  useOfflineSync: () => ({ refreshCount: vi.fn() }),
}));

const { WaitingRecordsView } = await import("@/components/shared/offline-status");

const waiting = (lastError: string, attempts: number): OfflineQueueEntry => ({
  id: `gate-${lastError || "new"}`,
  kind: "GATE_PHOTO",
  reference: "",
  queuedAt: "2026-11-05T00:30:00Z",
  attempts,
  lastError,
  state: attempts > 0 ? "retrying" : "waiting",
  hint: null,
  reason: null,
});

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const translate = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? JSON.stringify(values) : ""}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("a waiting record says why it has not gone", () => {
  it("names a hung upload, a lapsed sign-in and the server's fault with its status", () => {
    expect(waitingReason(QUEUE_ERROR_STALLED, translate)).toBe("offline.reason.stalled");
    expect(waitingReason(QUEUE_ERROR_SIGNED_OUT, translate)).toBe("offline.reason.signedOut");
    expect(waitingReason("server:502", translate)).toBe('offline.reason.server{"status":"502"}');
    expect(waitingReason("network", translate)).toBe("offline.reason.network");
    expect(waitingReason("Internal Server Error", translate)).toBe("offline.reason.unknown");
    expect(waitingReason("", translate)).toBe("");
  });

  it("lists it with the reason, how often it was tried, and 立即上传 - no delete", () => {
    const html = render(
      <WaitingRecordsView
        entries={[waiting("server:500", 3), waiting("", 0)]}
        busy={null}
        onUpload={vi.fn()}
      />,
    );
    expect(html).toContain("上次没有上传成功：服务器暂时出错（500），会自动再试（已试 3 次）");
    expect(html).toContain("还没开始上传");
    expect(html.match(/data-waiting-upload/g)).toHaveLength(2);
    expect(html).toContain("立即上传");
    expect(html).not.toContain("删除");
  });
});

describe("a hung upload does not hold the queue", () => {
  it("is stopped after its time, so the next record and the next pass go", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const result = withinTime(never, JOB_STALL_MS).catch((error: { code?: string }) => error.code);
    await vi.advanceTimersByTimeAsync(JOB_STALL_MS);
    await expect(result).resolves.toBe(QUEUE_ERROR_STALLED);
  });

  it("lets work that finishes in time through", async () => {
    await expect(withinTime(Promise.resolve(7), 1_000)).resolves.toBe(7);
  });
});
