/**
 * The four states on the phone (H5 三.5, WP1): on each row of 「我提交过的」 and
 * in the opened record, from the server's word - 「原图已备份」 only when the
 * server says so (三.6) - with the record's own 「同步原图」 and the honest
 * limits where the worker reads them.
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
const { OriginalBackupPanel, OriginalStatusText } = await import("@/components/shared/original-backup");

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
  client.setQueryData(["my-submissions", "detail", "EQUIPMENT_MOVEMENT", "mv-7"], {
    ...row,
    fields: [],
    photos: [
      { url: "https://cdn.example/a.jpg", caption: "", original_status: "ORIGINAL_PENDING", original_sha256: "a".repeat(64) },
      { url: "https://cdn.example/b.jpg", caption: "", original_status: "ORIGINAL_BACKED_UP" },
    ],
  });
}

describe("originals on 「我提交过的」", () => {
  it("shows each row's state from the server", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain(messages.originals.status.ORIGINAL_PENDING);
    expect(html).toContain(messages.originals.status.ORIGINAL_BACKED_UP);
  });

  it("shows the record's originals, and says when this phone does not hold one", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain(messages.originals.record.title);
    expect(html).toContain("已备份 1/2 张");
    // Not held on this phone: said, and no button that cannot work.
    expect(html).toContain("1 张原图不在这台手机上");
    expect(html).not.toContain(messages.originals.record.sync);
  });
});

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

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

describe("the sync panel", () => {
  it("tells the worker the limits, the switch and the storage plainly", () => {
    const html = render(<OriginalBackupPanel />);
    expect(html).toContain(messages.originals.sync);
    expect(html).toContain(messages.originals.autoLabel);
    expect(html).toContain(messages.originals.limit.local);
    expect(html).toContain(messages.originals.limit.verified);
    expect(html).toContain(messages.originals.limit.frame);
    expect(html).toContain(messages.originals.storage.title);
  });
});
