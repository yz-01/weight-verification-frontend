/**
 * The switch rule on the phone's three ways to remove something (client
 * 2026-10-09 四.3-四.6; Lucas's decision 3, spec rule 8):
 *
 * - 「清理本地记录」 is grey until its switch is on, and the switch's words say
 *   what goes and what stays;
 * - each queued action's 「放弃」 is grey until the queue's switch is on;
 * - 「从我的列表移除」 is offered on uploaded records only, never on one whose
 *   originals are still owed.
 */
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/providers/offline-sync-provider", () => ({
  useOfflineSync: () => ({}),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PhoneStorageView } = await import("@/components/field-staff/phone-storage-panel");
const { QueueEntries } = await import("@/components/shared/offline-status");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");

/** The opening tag of the one element carrying `attribute`. */
function tag(html: string, attribute: string): string {
  const found = html.match(new RegExp(`<[a-z]+[^>]*\\b${attribute}\\b[^>]*>`));
  if (!found) throw new Error(`no element with ${attribute}`);
  return found[0];
}
const isDisabled = (element: string) => / disabled=""/.test(element);

const summary = {
  photos: { count: 120, bytes: 2.5 * 1024 * 1024 },
  kept: { unsent: 2, drafts: 1, originals: 3, originalBytes: 4 * 1024 * 1024 },
  usage: 30 * 1024 * 1024,
};

function storage(armed: boolean, photos = summary.photos) {
  return renderDetail(
    <PhoneStorageView
      summary={{ ...summary, photos }}
      hiddenCount={4}
      windowDays={180}
      armed={armed}
      onArmedChange={() => undefined}
      cleaning={false}
      onClean={() => undefined}
      onShowHidden={() => undefined}
    />,
  );
}

describe("「清理本地记录」 behind its switch", () => {
  it("says exactly what will be cleared and what kept, and stays grey until armed", () => {
    const html = storage(false);
    expect(html).toContain("会清掉缓存照片 120 张（约 2.5 MB）");
    expect(html).toContain("会保留还没上传的记录 2 条、草稿 1 份、还没备份的原图 3 张");
    expect(html).toContain("还没备份的原图：3 张（约 4.0 MB）");
    expect(html).toContain("已从我的列表移除：4 条");
    expect(tag(html, "data-arm-clean")).toContain('aria-checked="false"');
    expect(isDisabled(tag(html, "data-clean-local"))).toBe(true);
    expect(html).toContain(messages.phoneStorage.armFirst);
  });

  it("is live once the switch is on - no dialog after it", () => {
    const html = storage(true);
    expect(tag(html, "data-arm-clean")).toContain('aria-checked="true"');
    expect(isDisabled(tag(html, "data-clean-local"))).toBe(false);
    expect(html).not.toContain("data-dialog");
  });

  it("stays grey with nothing to clear, and says so", () => {
    const html = storage(true, { count: 0, bytes: 0 });
    expect(isDisabled(tag(html, "data-clean-local"))).toBe(true);
    expect(html).toContain(messages.phoneStorage.nothingToClean);
  });
});

describe("the offline queue's 「放弃」 behind its switch", () => {
  const entry = {
    id: "job-1",
    ownerId: "u-1",
    kind: "MATERIAL_RECEIPT",
    reference: "DO-1",
    queuedAt: "2026-10-09T01:00:00Z",
    attempts: 0,
    lastError: "",
    state: "waiting",
    hint: null,
  } as unknown as import("@/services/offline-sync.service").OfflineQueueEntry;

  const queue = (armed: boolean) =>
    renderDetail(
      <QueueEntries entries={[entry]} armed={armed} onArmedChange={() => undefined} onDiscard={() => undefined} />,
    );

  it("cannot discard until the switch is on", () => {
    const html = queue(false);
    expect(html).toContain(messages.offline.queue.armDiscardHelp);
    expect(isDisabled(tag(html, "data-discard"))).toBe(true);
  });

  it("discards directly once armed", () => {
    expect(isDisabled(tag(queue(true), "data-discard"))).toBe(false);
  });
});

describe("「从我的列表移除」 on the worker's list", () => {
  const stored = {
    id: "r-1",
    kind: "MATERIAL_RECEIPT",
    reference: "MR-001",
    detail: "",
    project_id: "p-1",
    project_name: "Site",
    submitted_at: "2026-10-08T01:00:00Z",
    status: "RECEIVED",
    status_label: "Received",
    photo: null,
  };
  const owed = {
    ...stored,
    id: "r-2",
    reference: "MR-002",
    original_backup: { status: "ORIGINAL_PENDING" },
  };

  it("is offered on an uploaded record, not on one whose originals are still owed", () => {
    const html = renderDetail(<MySubmissions />, (client) => {
      client.setQueryData(["my-submissions"], { results: [stored, owed], count: 2 });
      client.setQueryData(["my-submissions", "queued", "u-1"], []);
    });
    const removable = html.match(/data-remove-from-list/g) ?? [];
    expect(html).toContain("MR-001");
    expect(html).toContain("MR-002");
    expect(removable).toHaveLength(1);
    // Two steps in place: the confirming sentence is not shown until tapped.
    expect(html).not.toContain("data-remove-strip");
    // The storage section sits under the list.
    expect(html).toContain(messages.phoneStorage.open);
  });
});
