/**
 * The 「已暂存」 sign with a refused record on it (JB98).
 *
 * 客户 11-05 事项 1 (图 1、图 2): 「已暂存 1 条，等待上传」 stayed on the phone
 * and the only word on why was the server's 「Validation failed.」. Now the
 * refused record is counted as 「上传失败」, not as waiting, and listed with its
 * reason in the worker's words, 「重试」 and 「删除这一条」 - which asks first.
 *
 * The runner has no DOM, so screens are rendered to static markup.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import type { OfflineQueueEntry } from "@/services/offline-sync.service";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
const sync = { isOnline: true, isSyncing: false, pendingCount: 1, failedCount: 1, refreshCount: vi.fn() };
vi.mock("@/components/providers/offline-sync-provider", () => ({
  useOfflineSync: () => sync,
}));

const { OfflineStatus, RefusedRecordsView } = await import("@/components/shared/offline-status");

const refused: OfflineQueueEntry = {
  id: "gate-photo-job-1",
  kind: "GATE_PHOTO",
  reference: "",
  queuedAt: "2026-11-05T00:30:00Z",
  attempts: 1,
  lastError: "Validation failed.",
  state: "failed",
  hint: "offline.conflict.invalid",
  reason: { key: "errors.api.gate_photo_unreadable" },
};

function render(node: React.ReactNode, messages: Record<string, unknown> = zh) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const view = (extra: Partial<Parameters<typeof RefusedRecordsView>[0]> = {}) => (
  <RefusedRecordsView
    entries={[refused]}
    count={1}
    showTitle={false}
    busy={null}
    deleting={null}
    onRetry={vi.fn()}
    onAskDelete={vi.fn()}
    onConfirmDelete={vi.fn()}
    onCancelDelete={vi.fn()}
    {...extra}
  />
);

describe("the 「已暂存」 sign with a refused record", () => {
  it("counts it as 上传失败, not as waiting", () => {
    const html = render(<OfflineStatus />);
    expect(html).toContain("上传失败 1 条");
    expect(html).not.toContain("已暂存 1 条，等待上传");
  });

  it("still says how many wait when others are waiting too", () => {
    sync.pendingCount = 3;
    const html = render(<OfflineStatus />);
    sync.pendingCount = 1;
    expect(html).toContain("已暂存 2 条，等待上传");
  });

  it("lists the record with its reason in Chinese - never 「Validation failed.」", () => {
    const html = render(view());
    expect(html).toContain(zh.offline.kind.GATE_PHOTO);
    expect(html).toContain(zh.errors.api.gate_photo_unreadable);
    expect(html).not.toContain("Validation failed.");
    expect(html).toContain(zh.offline.status.refusedHelp);
  });

  it("offers 「重试」 and 「删除这一条」 on the phone itself", () => {
    const html = render(view());
    expect(html).toContain("data-refused-retry");
    expect(html).toContain("data-refused-delete");
    expect(html).toContain(">重试<");
    expect(html).toContain(">删除这一条<");
    // Nothing is deleted without asking.
    expect(html).not.toContain(zh.offline.refused.deleteHelp);
  });

  it("asks before deleting", () => {
    const html = render(view({ deleting: refused }));
    expect(html).toContain(zh.offline.refused.deleteTitle);
    expect(html).toContain(zh.offline.refused.deleteHelp);
  });

  it("words a field refusal with the field's own sentence, in the other languages too", () => {
    const fieldRefusal = { ...refused, reason: { key: "offline.refused.incomplete", values: { field: "upload_batch" } } };
    expect(render(view({ entries: [fieldRefusal] }))).toContain("资料不完整，无法上传（upload_batch）");
    expect(render(view({ entries: [fieldRefusal] }), en)).toContain("(upload_batch)");
  });
});
