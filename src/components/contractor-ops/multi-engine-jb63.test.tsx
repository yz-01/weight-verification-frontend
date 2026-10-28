/**
 * JB63 (客户 10-28 「Multi Engine 资料包功能验收及调整要求」), on the screens
 * rendered to static markup (the runner has no DOM) and on the source:
 *
 * - 一: a draft lists its records and the files uploaded from the computer in
 *   one numbered list - the PDF's order - each with 移到最前 / 上移 / 下移 /
 *   移到最后; 「预览完整资料」 sits beside 确认;
 * - 二: every 「发送」 of a package goes through the computer's share window,
 *   which hands WhatsApp the PDF itself - never a WhatsApp link alone, which
 *   carries only text;
 * - 三: a round's 「发送」 and the 往来记录's are written down too, and
 *   「发送记录」 says which file went.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EvidencePackageDetail } from "@/interfaces/contractor-ops";
import { recordAttachmentsKey } from "@/components/shared/record-attachments";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/evidence-packages",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
    refresh: async () => {},
    isLoading: false,
  }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { PackageSheet } = await import("@/components/contractor-ops/multi-engine");
const { SendLog } = await import("@/components/contractor-ops/package-claim-parts");

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
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

const record = (id: string, reference: string) => ({
  id,
  record_kind: "MATERIAL_RECEIPT",
  record_id: `r-${id}`,
  position: 0,
  round_no: 1,
  replaced_in_round: null,
  selection: {},
  review_state: "PENDING",
  returned_reason: "",
  returned_at: null,
  reference,
  fields: [],
  photos: [],
  documents: [],
  files: [],
  is_snapshot: false,
  answers: [],
});

const draft = {
  id: "pk1",
  package_no: "PKG-T-011",
  name: "all claim 002",
  remarks: "",
  state: "DRAFT",
  package_type: "OTHER",
  project: "p1",
  project_name: "Tower",
  created_at: "2026-10-28T02:00:00Z",
  created_by_name: "Ong",
  confirmed_at: null,
  confirmed_by_name: "",
  pdf_sha256: "",
  pdf_bytes: 0,
  merge_report: [],
  review_state: "NOT_SENT",
  sent_at: null,
  sent_to: null,
  sent_to_name: "",
  exported_at: null,
  item_count: 2,
  returned_count: 0,
  can_delete: true,
  can_return: false,
  current_round: 0,
  recipient_count: 0,
  send_status: { internal: false, external: "NONE" },
  items: [record("i1", "GRN-001"), record("i2", "GRN-002")],
  layout: [
    { kind: "item", id: "i1" },
    {
      kind: "file",
      id: "f1",
      name: "formal-letter.pdf",
      letter: false,
      uploaded_by_name: "Steven",
      uploaded_at: "2026-10-28T03:00:00Z",
    },
    { kind: "item", id: "i2" },
  ],
} as unknown as EvidencePackageDetail;

function sheet(data: EvidencePackageDetail) {
  return render(<PackageSheet id="pk1" onClose={() => undefined} />, (client) => {
    client.setQueryData(["evidence-packages", "detail", "pk1"], data);
    for (const kind of ["EVIDENCE_PACKAGE", "PACKAGE_LETTER"] as const) {
      client.setQueryData(recordAttachmentsKey(kind, "pk1"), {
        kind,
        record: "pk1",
        closed: "",
        can_add: true,
        can_delete: true,
        max_files: 10,
        max_bytes: 1,
        attachments: [],
      });
    }
  });
}

describe("JB63 一: records and uploaded files in one order", () => {
  it("lists the file between the two records, numbered, as the PDF will have it", () => {
    const html = sheet(draft);
    expect(html).toContain(zh.multiEngine.field.contents);
    const first = html.indexOf("GRN-001");
    const file = html.indexOf("formal-letter.pdf");
    const second = html.indexOf("GRN-002");
    expect(first).toBeGreaterThan(-1);
    expect(file).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(file);
    expect(html).toContain("data-package-file");
    expect(html).toContain(zh.multiEngine.layoutUpload);
    expect(html).toContain("2.</span>");
  });

  it("gives every line - record or file - 移到最前 / 上移 / 下移 / 移到最后", () => {
    const html = sheet(draft);
    expect(html.match(/data-move-buttons/g)).toHaveLength(3);
    for (const label of ["moveFirst", "moveUp", "moveDown", "moveLast"] as const) {
      expect(html.split(`aria-label="${zh.multiEngine[label]}"`).length - 1).toBe(3);
    }
  });

  it("offers 「预览完整资料」 before 确认", () => {
    const html = sheet(draft);
    expect(html).toContain('data-action="preview-draft"');
    expect(html.indexOf(zh.multiEngine.previewDraft)).toBeLessThan(html.lastIndexOf(zh.multiEngine.confirm));
  });

  it("a confirmed package shows the order without moving anything", () => {
    const html = sheet({ ...draft, state: "CONFIRMED", rounds: [], recipients: [], shares: [] } as EvidencePackageDetail);
    expect(html).toContain("formal-letter.pdf");
    expect(html).not.toContain("data-move-buttons");
    expect(html).not.toContain('data-action="preview-draft"');
  });

  it("the upload hint no longer says a file lands after the records for good", () => {
    expect(zh.multiEngine.uploads.hint).not.toContain("不能修改或删除");
    expect(zh.multiEngine.uploads.hint).toContain("Word");
  });
});

describe("JB63 二: 对外分享 sends the file itself", () => {
  const dialog = source("src/components/contractor-ops/package-share.tsx");

  it("goes through the share window like 轮次 did, not a text-only WhatsApp link", () => {
    expect(dialog).toContain('run("share"');
    expect(dialog).toContain("onShared");
    expect(dialog).not.toContain("whatsappHref");
    expect(dialog).not.toContain("wa.me");
  });

  it("the shared file actions tell the caller only when an app took the file", () => {
    const actions = source("src/components/shared/file-actions.tsx");
    expect(actions).toMatch(/outcome === "shared"\) \{\s+toast\.success\(t\("shared"\)\);\s+held\.source\.onShared\?\.\(\);/);
    expect(actions).not.toMatch(/cancelled[^\n]*onShared/);
  });

  it("says what happens next in every language", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const channel of ["WHATSAPP", "EMAIL", "DOWNLOAD"] as const) {
        expect(messages.multiEngine.share.go[channel]).toBeTruthy();
        expect(messages.multiEngine.share.handed[channel]).toBeTruthy();
      }
      expect(messages.multiEngine.share.how.WHATSAPP).toBeTruthy();
    }
  });
});

describe("JB63 三: every send is written down, with which file", () => {
  it("a round's 发送 and the 往来记录's open the package's own send", () => {
    const exchange = source("src/components/contractor-ops/package-exchange.tsx");
    expect(exchange).toContain("sendButton({ round: round.number })");
    expect(exchange).toContain("sendButton({ transcript: true })");
    expect(exchange.match(/omit=\{\["share"\]\}/g)).toHaveLength(2);
    expect(exchange).toContain("<PackageShareDialog");
  });

  it("发送记录 names the round or the 往来记录", () => {
    const pkg = {
      ...draft,
      state: "CONFIRMED",
      recipients: [],
      shares: [
        {
          id: "s1",
          channel: "WHATSAPP",
          target: "boss ku",
          status: "STARTED",
          round_no: 1,
          document: "",
          created_at: "2026-10-28T12:26:00Z",
          created_by_name: "test",
          confirmed_at: null,
          confirmed_by_name: "",
        },
        {
          id: "s2",
          channel: "EMAIL",
          target: "",
          status: "STARTED",
          round_no: null,
          document: "TRANSCRIPT",
          created_at: "2026-10-28T12:30:00Z",
          created_by_name: "test",
          confirmed_at: null,
          confirmed_by_name: "",
        },
      ],
    } as unknown as EvidencePackageDetail;
    const html = render(<SendLog pkg={pkg} onChanged={() => undefined} />);
    expect(html).toContain("第 1 轮");
    expect(html).toContain(zh.multiEngine.exchange.report);
    expect(html).toContain("boss ku");
    expect(html).toContain(zh.multiEngine.sendLog.STARTED);
  });
});
