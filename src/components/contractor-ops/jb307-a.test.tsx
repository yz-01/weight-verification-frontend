/**
 * JB307 group A (客户 11-28j 事项 1, 2): a Multi Engine package's own files.
 *
 * 事项 1: 「项目经理上传的正式信函及相关文件，必须完整显示在资料包内，并支持接收方
 * 查看、预览、打印及导出，确保资料完整。」 - a consultant and an outside link now
 * list them, each with 预览 · 打印 · 导出.
 * 事项 2: 「资料被退回后，项目经理补充下一轮资料时，误上传的文件没有删除按钮……重新
 * 签名提交前可以删除本轮误上传的文件，提交后自动锁定，不影响上一轮的历史资料。」
 *
 * The runner has no DOM: rendered to static markup with the queries answered
 * from the cache, or read from the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { EvidencePackageDetail, PackageSentFile } from "@/interfaces/contractor-ops";
import type { RecordAttachment } from "@/interfaces/record-attachment";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ codes: new Set<string>(["package.view", "package.manage", "project.view"]) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/multi-engine",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-pm", company_type: "CONTRACTOR", is_field_staff: false },
    can: (code: string) => reader.codes.has(code),
  }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useCurrentProject: () => ({ active: true, projects: [] }),
  useFollowRecordProject: () => {},
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PackageSheet } = await import("@/components/contractor-ops/multi-engine");
const { PackageSentFiles } = await import("@/components/contractor-ops/package-sent-files");
const { recordAttachmentsKey } = await import("@/components/shared/record-attachments");

const SRC = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");

function attachment(id: string, name: string): RecordAttachment {
  return {
    id,
    record_kind: "EVIDENCE_PACKAGE",
    record_id: "pk1",
    original_name: name,
    content_type: "image/png",
    preview_type: "image/png",
    byte_size: 24166,
    note: "",
    uploaded_by_name: "mike",
    uploaded_at: "2026-11-28T05:54:00Z",
    url: "",
  } as RecordAttachment;
}

function returnedPackage(extra: Partial<EvidencePackageDetail> = {}): EvidencePackageDetail {
  return {
    id: "pk1",
    package_no: "PKG-PRJ-0003-028",
    name: "subcon claim",
    remarks: "",
    state: "CONFIRMED",
    project: "p1",
    project_name: "PUTRA_MAS",
    created_at: "2026-11-28T05:50:00Z",
    created_by_name: "mike",
    confirmed_at: "2026-11-28T05:55:00Z",
    pdf_sha256: "a".repeat(64),
    pdf_bytes: 1024,
    merge_report: [],
    review_state: "SENT",
    sent_at: null,
    sent_to: null,
    sent_to_name: "",
    exported_at: null,
    item_count: 0,
    returned_count: 1,
    can_delete: false,
    can_return: true,
    items: [],
    recipients: [],
    rounds: [],
    returned_item_ids: ["it1"],
    can_resubmit: true,
    takes_supplements: true,
    staged_items: [],
    resent_from: null,
    resends: [],
    layout: [
      {
        kind: "file",
        id: "f-round1",
        name: "SUP-0001-supplier-qr.png",
        letter: false,
        uploaded_by_name: "mike",
        uploaded_at: "2026-11-28T05:54:00Z",
        next_round: false,
      },
      {
        kind: "file",
        id: "f-wrong",
        name: "wrong-file.png",
        letter: false,
        uploaded_by_name: "mike",
        uploaded_at: "2026-11-28T06:10:00Z",
        next_round: true,
      },
    ],
    ...extra,
  } as EvidencePackageDetail;
}

function sheet(data: EvidencePackageDetail) {
  return renderDetail(<PackageSheet id={data.id} onClose={() => undefined} />, (client) => {
    client.setQueryData(["evidence-packages", "detail", data.id], data);
    client.setQueryData(recordAttachmentsKey("EVIDENCE_PACKAGE", data.id), {
      kind: "EVIDENCE_PACKAGE",
      record: data.id,
      attachments: [attachment("f-round1", "SUP-0001-supplier-qr.png"), attachment("f-wrong", "wrong-file.png")],
      closed: "",
      can_add: true,
      max_files: 10,
      max_bytes: 1024 * 1024,
      can_delete: false,
      preview_only: false,
    });
  });
}

describe("JB307-2: a file wrongly uploaded for the next round can be deleted", () => {
  it("has the bin on this round's file only - in the list and in the upload place", () => {
    reader.codes = new Set(["package.view", "package.manage"]);
    const html = sheet(returnedPackage());
    // Two places show the file (资料内容 and 补充下一轮的资料), the bin in both.
    expect(html.match(/data-remove-next-round-file="true"/g)?.length).toBe(2);
    expect(html).toContain(`aria-label="${zh.jb307.remove.button}"`);
    // Round 1's file has none: each bin sits after the wrong file's name.
    const firstBin = html.indexOf("data-remove-next-round-file");
    expect(html.lastIndexOf("wrong-file.png", firstBin)).toBeGreaterThan(-1);
    expect(html.slice(html.lastIndexOf("SUP-0001-supplier-qr.png", firstBin), firstBin)).toContain("wrong-file.png");
  });

  it("is locked once submitted: no bin when the package takes no additions", () => {
    reader.codes = new Set(["package.view", "package.manage"]);
    const html = sheet(returnedPackage({ takes_supplements: false, can_resubmit: false }));
    expect(html).not.toContain("data-remove-next-round-file");
  });

  it("asks once in plain words and calls the package's own remove_file", () => {
    expect(zh.jb307.remove.title).toBe("删除 {name}？");
    expect(zh.jb307.remove.body).toContain("之前几轮已经提交的资料不会改变");
    const service = read("services/contractor-ops.service.ts");
    expect(service).toContain("`/api/evidence-packages/${id}/remove_file/`");
    const source = read("components/contractor-ops/multi-engine.tsx");
    expect(source).toContain("onRemove={() => removePackageFile(id, row.id)}");
  });
});

describe("JB307-1: every receiver sees the uploaded files, each to preview, print and export", () => {
  const files: PackageSentFile[] = [
    {
      id: "f1",
      name: "SUP-0001-supplier-qr.png",
      letter: false,
      uploaded_by_name: "mike",
      uploaded_at: "2026-11-28T05:54:00Z",
      byte_size: 24166,
      preview_type: "image/png",
    },
  ];

  it("lists each file with who uploaded it and 预览 · 打印 · 导出", () => {
    const html = renderDetail(
      <PackageSentFiles files={files} load={async () => new File([], "x.pdf")} recordId="pk1" project="p1" ownWork />,
    );
    expect(html).toContain(zh.jb307.files.title);
    expect(html).toContain("SUP-0001-supplier-qr.png");
    expect(html).toContain("mike");
    expect(html).toContain("23.6 KB");
    expect(html).toContain('data-slot="file-action-preview"');
    expect(html).toContain('data-slot="file-action-print"');
    expect(html).toContain('data-slot="file-action-save"');
  });

  it("draws nothing when nothing was uploaded", () => {
    expect(renderDetail(<PackageSentFiles files={[]} load={async () => new File([], "x.pdf")} />)).toBe("");
  });

  it("is on the consultant's package and on the outside link, each file through its own door", () => {
    const review = read("components/contractor-ops/package-review.tsx");
    expect(review).toContain("<PackageSentFiles");
    expect(review).toContain("reviewPackageSentFile(id, file.id, file.name, inline)");
    const link = read("components/package-link/package-link.tsx");
    expect(link).toContain("<PackageSentFiles");
    expect(link).toContain("linkSentFile(token, file.id, file.name, { lang: locale, inline })");
    expect(read("services/contractor-ops.service.ts")).toContain("`/api/package-reviews/${id}/download_file/`");
    expect(read("services/package-link.service.ts")).toContain('linkUrl(token, "download-file/"');
  });

  it("says it in every language, the refusal too", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb307.files.title).toBeTruthy();
      expect(messages.jb307.remove.body).toBeTruthy();
      expect(messages.errors.api.package_file_locked).toBeTruthy();
    }
  });
});

describe("a draft's own upload can be deleted before 确认 (the upload hint says 「确认前可以删除」)", () => {
  it("offers the bin on a draft's uploads, not on a Claim's letter, with the draft's own words", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/multi-engine.tsx"), "utf8");
    expect(source).toContain('const draftFiles = data?.state === "DRAFT" && can("package.manage");');
    expect(source).toContain('row.kind === "file" && !row.letter && (draftFiles || row.next_round)');
    expect(source.match(/draft=\{draftFiles\}/g)?.length).toBe(2);
    for (const messages of [zh, zhTW, en, ms]) expect(messages.jb307.remove.bodyDraft).toBeTruthy();
  });
});
