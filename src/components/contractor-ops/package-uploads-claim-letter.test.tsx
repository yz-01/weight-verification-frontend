/**
 * JB30 (客户 10-26 事项 6): 「multi engine 打包增加一个上传资料的位置。因为打包的
 * progress claim 必须要有书信上传。」
 *
 * - a draft package has 「上传资料」 beside 「添加资料」, and lists what was
 *   uploaded; a confirmed one lists it read-only, or shows nothing when there
 *   was nothing;
 * - a Progress Claim (材料到场 / 工程进度) has a required 书信 slot and 「确认本期」
 *   says 「请先上传书信」 until one is there; a 一般 Claim has neither.
 *
 * The runner has no DOM, so the screens are rendered to static markup with
 * their queries answered from the cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EvidencePackageDetail } from "@/interfaces/contractor-ops";
import type { RecordAttachments } from "@/interfaces/record-attachment";
import { claimConfirmBlocker, claimNeedsLetter } from "@/lib/claim-letter";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { PackageSheet } = await import("@/components/contractor-ops/multi-engine");
const { RecordAttachmentsPanel, recordAttachmentsKey } = await import(
  "@/components/shared/record-attachments"
);

function slot(count: number, closed = ""): RecordAttachments {
  return {
    kind: "EVIDENCE_PACKAGE",
    record: "pk1",
    closed,
    can_add: true,
    max_files: 10,
    max_bytes: 50 * 1024 * 1024,
    attachments: Array.from({ length: count }, (_, index) => ({
      id: `f${index}`,
      record_kind: "EVIDENCE_PACKAGE",
      record_id: "pk1",
      original_name: `supplier-letter-${index}.pdf`,
      content_type: "application/pdf",
      preview_type: "application/pdf",
      byte_size: 2048,
      note: "",
      uploaded_by_name: "Ong",
      uploaded_at: "2026-10-26T02:00:00Z",
      url: "/media/x.pdf",
    })),
  };
}

const pkg = {
  id: "pk1",
  name: "Supplier letters",
  remarks: "",
  state: "DRAFT",
  package_type: "OTHER",
  project: "p1",
  project_name: "Tower",
  created_at: "2026-10-01T02:00:00Z",
  created_by_name: "Ong",
  confirmed_at: null,
  pdf_sha256: "",
  pdf_bytes: 0,
  merge_report: [],
  review_state: "NOT_SENT",
  sent_at: null,
  sent_to: null,
  sent_to_name: "",
  exported_at: null,
  item_count: 0,
  returned_count: 0,
  can_delete: true,
  can_return: false,
  items: [],
  recipients: [],
  rounds: [],
  returned_item_ids: [],
  can_resubmit: false,
} as unknown as EvidencePackageDetail;

function render(node: React.ReactNode, seed: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function sheet(state: "DRAFT" | "CONFIRMED", uploads: number) {
  return render(<PackageSheet id="pk1" onClose={() => undefined} />, (client) => {
    client.setQueryData(["evidence-packages", "detail", "pk1"], { ...pkg, state });
    client.setQueryData(recordAttachmentsKey("EVIDENCE_PACKAGE", "pk1"), slot(uploads, state === "DRAFT" ? "" : "confirmed"));
  });
}

describe("「上传资料」 on a package", () => {
  it("sits beside 「添加资料」 on a draft", () => {
    const html = sheet("DRAFT", 0);
    expect(html).toContain(zh.multiEngine.addRecords);
    expect(html).toContain(zh.multiEngine.uploads.add);
    expect(html).toContain('data-action="upload-files"');
    // Nothing uploaded yet: no empty list under the buttons.
    expect(html).not.toContain('data-kind="EVIDENCE_PACKAGE"');
  });

  it("lists what was uploaded, under its own heading", () => {
    const html = sheet("DRAFT", 2);
    expect(html).toContain('data-kind="EVIDENCE_PACKAGE"');
    expect(html).toContain(zh.multiEngine.uploads.title);
    expect(html).toContain("supplier-letter-1.pdf");
  });

  it("is read-only once confirmed, and absent when nothing was uploaded", () => {
    const withFiles = sheet("CONFIRMED", 1);
    expect(withFiles).toContain("supplier-letter-0.pdf");
    expect(withFiles).not.toContain('data-action="upload-files"');
    expect(withFiles).not.toContain(zh.recordAttachments.add);
    expect(sheet("CONFIRMED", 0)).not.toContain('data-kind="EVIDENCE_PACKAGE"');
  });
});

describe("the 书信 slot", () => {
  it("is marked required and says so while empty", () => {
    const html = render(
      <RecordAttachmentsPanel kind="CLAIM_LETTER" recordId="c1" title={zh.claims.letter.title} addLabel={zh.claims.letter.add} required />,
      (client) => client.setQueryData(recordAttachmentsKey("CLAIM_LETTER", "c1"), { ...slot(0), kind: "CLAIM_LETTER" }),
    );
    expect(html).toContain(zh.claims.letter.title);
    expect(html).toContain(zh.claims.letter.add);
    expect(html).toContain("text-destructive");
    expect(html).toContain("border-destructive");
  });

  it("is needed by the two kinds that raise a package, not by a 一般 Claim", () => {
    expect(claimNeedsLetter("MATERIAL_ON_SITE")).toBe(true);
    expect(claimNeedsLetter("PROGRESS")).toBe(true);
    expect(claimNeedsLetter("GENERAL")).toBe(false);
  });

  it("holds 「确认本期」 back until a letter is there, nothing-ticked first", () => {
    expect(claimConfirmBlocker({ kind: "PROGRESS", itemCount: 0, letterCount: 0 })).toBe("nothingSelected");
    expect(claimConfirmBlocker({ kind: "PROGRESS", itemCount: 2, letterCount: 0 })).toBe("letterMissing");
    expect(claimConfirmBlocker({ kind: "PROGRESS", itemCount: 2, letterCount: undefined })).toBe("letterMissing");
    expect(claimConfirmBlocker({ kind: "MATERIAL_ON_SITE", itemCount: 1, letterCount: 1 })).toBeNull();
    expect(claimConfirmBlocker({ kind: "GENERAL", itemCount: 0, letterCount: 0 })).toBeNull();
  });

  it("says 「请先上传书信」, in every language, with the server's code translated", () => {
    expect(zh.claims.letter.missing).toBe("请先上传书信");
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.claims.letter.missing).toBeTruthy();
      expect(messages.multiEngine.uploads.add).toBeTruthy();
      expect(messages.errors.api.claim_letter_required).toBeTruthy();
    }
  });
});
