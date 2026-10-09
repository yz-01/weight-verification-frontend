/**
 * Lucas, 2026-10-09 「手机端原图备份页面调整」:
 *
 * 1. 现场人员只需拍照、提交，不需要了解原图备份和同步操作。
 * 5. 原图同步、重试及储存管理放在技术管理页面，不显示给现场人员。
 *
 * So 「我提交过的」 and the field top bar carry no original states, no
 * 「同步原图」, no switch and no storage figures; the technical page's device
 * tools carry the retry, the storage and the honest limits - and still no
 * switch, because the backup is automatic. The four states keep their words
 * for the office's ledger.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams("movement=mv-7"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
const sync = { isOnline: true, isSyncing: false, pendingCount: 2, failedCount: 0, syncNow: vi.fn() };
vi.mock("@/components/providers/offline-sync-provider", () => ({
  useOfflineSync: () => sync,
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");
const { OriginalStatusText } = await import("@/components/shared/original-backup");
const { OfflineStatus } = await import("@/components/shared/offline-status");
const { DeviceUploadTools, DEVICE_TOOLS_PATH } = await import("@/components/technical/device-upload-tools");

const pending = {
  status: "ORIGINAL_PENDING" as const,
  expected: 2,
  backed_up: 1,
  failed: 0,
  pending: 1,
  waiting_sha256: ["a".repeat(64)],
  waiting_bytes: 1_400_000,
};

const row = {
  id: "mv-7",
  kind: "EQUIPMENT_MOVEMENT" as const,
  reference: "EQ-SITE-007",
  detail: "Excavator",
  project_id: "p-1",
  project_name: "Site",
  submitted_at: "2026-10-08T01:00:00Z",
  status: "EXIT",
  status_label: "Exit",
  photo: null,
  photo_count: 2,
  original_backup: pending,
};

const queuedEntry = {
  id: "job-1",
  kind: "MATERIAL_RECEIPT",
  reference: "",
  queuedAt: "2026-10-09T01:00:00Z",
  attempts: 3,
  lastError: "network",
  state: "retrying",
  hint: null,
};

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["my-submissions"], {
    results: [
      row,
      {
        ...row,
        id: "mv-8",
        reference: "EQ-SITE-008",
        original_backup: { ...pending, status: "ORIGINAL_BACKED_UP", backed_up: 2, pending: 0, waiting_sha256: [] },
      },
    ],
    count: 2,
  });
  client.setQueryData(["my-submissions", "queued", "u-1"], [queuedEntry]);
  client.setQueryData(["my-submissions", "detail", "EQUIPMENT_MOVEMENT", "mv-7"], {
    ...row,
    fields: [],
    photos: [
      { url: "https://cdn.example/a.jpg", caption: "", original_status: "ORIGINAL_PENDING", original_sha256: "a".repeat(64) },
      { url: "https://cdn.example/b.jpg", caption: "", original_status: "ORIGINAL_BACKED_UP" },
    ],
  });
}

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

describe("「我提交过的」 shows none of the backup machinery (points 1 and 5)", () => {
  it("has no original states, no 「同步原图」 and no storage panel - on the list or in a record", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain("EQ-SITE-007");
    for (const status of Object.values(messages.originals.status)) {
      expect(html).not.toContain(status);
    }
    expect(html).not.toContain("同步原图");
    expect(html).not.toContain("原图");
    expect(html).not.toContain(messages.phoneStorage.open);
  });

  it("shows a record still on the phone as 「已暂存，等待上传」, without retries or signal reasons", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain("已暂存，等待上传");
    expect(html).toContain("data-queued-row");
    expect(html).not.toContain(messages.offline.reason.network);
    expect(html).not.toContain("3 次");
  });
});

describe("the field top bar is a sign, not a control panel", () => {
  it("shows how many records wait, and nothing to press", () => {
    const html = render(<OfflineStatus />);
    expect(html).toContain("data-upload-indicator");
    expect(html).toContain("已暂存 2 条，等待上传");
    expect(html).not.toContain(messages.offline.queue.retry);
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("原图");
  });
});

describe("the technical page's device tools (point 5)", () => {
  it("carry the retry, the storage and the limits - and no switch for the backup", () => {
    const html = renderDetail(<DeviceUploadTools />);
    expect(html).toContain(messages.technical.device.retryOriginals);
    expect(html).toContain(messages.offline.queue.retry);
    expect(html).toContain(messages.originals.storage.title);
    expect(html).toContain(messages.originals.limit.local);
    expect(html).toContain(messages.originals.limit.verified);
    expect(html).toContain(messages.originals.limit.frame);
    expect(html).toContain(messages.technical.device.originalsHelp);
    // Only this device: said, with the hidden phone address.
    expect(html).toContain(DEVICE_TOOLS_PATH);
    expect(html).not.toContain("连原图一起上传");
  });
});

describe("the four states", () => {
  it("each has its words", () => {
    for (const status of [
      "APPLICATION_UPLOADED",
      "ORIGINAL_PENDING",
      "ORIGINAL_BACKED_UP",
      "ORIGINAL_FAILED",
    ] as const) {
      expect(render(<OriginalStatusText status={status} />)).toContain(messages.originals.status[status]);
    }
  });
});
