/**
 * E6 (Lucas 2026-10-07): a draft consultant application's attachments, linked
 * photos and related site records can be removed and corrected; a submitted
 * one shows no such buttons and says why.
 *
 * Rendered to static markup - the runner has no DOM - so what is checked is
 * what each state draws: the edit controls while editable, the Remove buttons
 * only once the block's switch is on (spec rule 8: a switch, never a confirm
 * dialog), and nothing but the locked note after submission.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  ApplicationRelatedRecord,
  ConsultantApplication,
} from "@/interfaces/consultant-workflow";
import messages from "@/messages/zh.json";

const {
  AttachmentRows,
  EvidenceLinkCards,
  LockedNote,
  RelatedRecordRemove,
  RemoveSwitch,
} = await import("@/components/consultant-workflow/application-draft-edit");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function link(id: string, caption = "") {
  return {
    id,
    evidence: `asset-${id}`,
    evidence_kind: "PHOTO",
    evidence_file: `/media/${id}.png`,
    evidence_watermarked_file: null,
    original_filename: `${id}.png`,
    captured_at: "2026-10-07T02:00:00Z",
    latitude: null,
    longitude: null,
    photographer_name: "ong",
    sha256: "a".repeat(64),
    caption,
    sort_order: 0,
  };
}

function attachment(id: string, name: string) {
  return {
    id,
    category: "CHECKLIST",
    file: `/media/${name}`,
    original_name: name,
    content_type: "application/pdf",
    byte_size: 2048,
    sha256: "b".repeat(64),
    note: "",
    created_at: "2026-10-07T02:00:00Z",
  };
}

const application = {
  id: "app-1",
  is_locked: false,
  status: "DRAFT",
  attachments: [attachment("att-1", "checklist.pdf"), attachment("att-2", "drawing.pdf")],
  evidence_links: [link("l1", "first"), link("l2"), link("l3", "last")],
  related_record_groups: [],
} as unknown as ConsultantApplication;

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("attachments of a draft (E6)", () => {
  it("offers Edit on every row, and no Remove until the switch is on", () => {
    const html = render(<AttachmentRows application={application} editable armed={false} onChanged={noop} />);
    expect(count(html, "data-draft-controls")).toBe(2);
    expect(count(html, ">修改<")).toBe(2);
    expect(html).not.toContain("data-draft-remove");
  });

  it("draws a Remove on every row once armed - pressed, it acts; there is no dialog", () => {
    const html = render(<AttachmentRows application={application} editable armed onChanged={noop} />);
    expect(count(html, "data-draft-remove")).toBe(2);
    expect(count(html, ">移除<")).toBe(2);
    expect(html).not.toContain('role="alertdialog"');
  });

  it("draws no controls at all when the application is not editable", () => {
    const html = render(<AttachmentRows application={application} editable={false} armed onChanged={noop} />);
    expect(html).toContain("checklist.pdf");
    expect(html).not.toContain("data-draft-controls");
    expect(html).not.toContain("data-draft-remove");
  });

  it("shows the attachment type in words, not its code", () => {
    const html = render(<AttachmentRows application={application} editable={false} armed={false} onChanged={noop} />);
    expect(html).toContain(messages.consultantWorkflow.attachmentType.CHECKLIST);
    expect(html).not.toContain(">CHECKLIST");
  });
});

describe("linked photos of a draft (E6)", () => {
  it("can be re-captioned and moved, the ends only one way", () => {
    const html = render(<EvidenceLinkCards application={application} editable armed={false} onChanged={noop} />);
    expect(count(html, "data-draft-controls")).toBe(3);
    expect(count(html, ">改说明<")).toBe(3);
    // First card: down only. Middle: both. Last: up only.
    expect(count(html, 'aria-label="上移"')).toBe(2);
    expect(count(html, 'aria-label="下移"')).toBe(2);
    const cards = html.split("data-evidence-link=").slice(1);
    expect(cards[0]).not.toContain('aria-label="上移"');
    expect(cards[2]).not.toContain('aria-label="下移"');
    expect(html).not.toContain("data-draft-remove");
  });

  it("can be unlinked once the switch is on", () => {
    const html = render(<EvidenceLinkCards application={application} editable armed onChanged={noop} />);
    expect(count(html, "data-draft-remove")).toBe(3);
    expect(count(html, ">取消关联<")).toBe(3);
  });

  it("are read-only after submission", () => {
    const html = render(<EvidenceLinkCards application={application} editable={false} armed onChanged={noop} />);
    expect(html).toContain("first");
    expect(html).not.toContain("data-draft-controls");
  });
});

describe("related site records (E6)", () => {
  const record = {
    type: "FIELD_TASK",
    type_label: "Field task",
    record_id: "task-1",
    reference: "FT-1",
    title: "Pour check",
    date: null,
    created_by_name: "",
    href: "",
    source_model: "contractor_ops.fieldtaskphoto",
    evidence_link_ids: ["l1", "l2"],
    removable: true,
  } satisfies ApplicationRelatedRecord;

  it("a record brought by linked photos can be removed", () => {
    const html = render(<RelatedRecordRemove application={application} record={record} onChanged={noop} />);
    expect(html).toContain("data-draft-remove");
    expect(html).toContain(">移除<");
  });

  it("the application's own origin cannot", () => {
    const html = render(
      <RelatedRecordRemove application={application} record={{ ...record, removable: false }} onChanged={noop} />,
    );
    expect(html).toBe("");
  });
});

describe("switch and locked note (E6)", () => {
  it("the switch is a switch, labelled in the reader's language", () => {
    const html = render(<RemoveSwitch armed={false} onArmedChange={noop} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="允许移除"');
  });

  it("a submitted application says why nothing can be changed", () => {
    const html = render(<LockedNote />);
    // JB201: the same words as the decision the consultant picks.
    expect(html).toContain("已发送给顾问；顾问选「修改后重提」后，在新版本里改");
  });
});

describe("the detail page wires it in (E6)", () => {
  const detail = readFileSync(
    path.join(process.cwd(), "src/components/consultant-workflow/application-detail.tsx"),
    "utf8",
  );
  const editor = readFileSync(
    path.join(process.cwd(), "src/components/consultant-workflow/application-draft-edit.tsx"),
    "utf8",
  );

  it("decides editability once, from the lock and the right to fill in the draft", () => {
    // Lucas 10-30 evening: a confirmed draft not yet sent is still changed -
    // unless MSE locked its project (JB214-3d, Lucas 11-16 「按项目锁」).
    expect(detail).toContain('!application.is_locked || (application.status === "DRAFT" && !archiveLocks)');
    expect(detail).toContain('const draftEditable = openDraft && can("consultant.submit");');
    expect(detail).toContain('const showLocked = !openDraft && can("consultant.submit");');
  });

  it("puts the locked note on all three blocks", () => {
    expect(count(detail, "<LockedNote />")).toBe(3);
    expect(count(detail, "<RemoveSwitch ")).toBe(3);
  });

  it("never asks with a dialog before removing", () => {
    expect(editor).not.toMatch(/ConfirmDialog|window\.confirm|confirm\(/);
  });

  it("has every new phrase, and the refusal, in all four catalogues", () => {
    const keys = Object.keys(messages.consultantWorkflow.draftEdit);
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const catalogue = JSON.parse(
        readFileSync(path.join(process.cwd(), `src/messages/${locale}.json`), "utf8"),
      );
      expect(Object.keys(catalogue.consultantWorkflow.draftEdit).sort(), locale).toEqual([...keys].sort());
      expect(catalogue.errors.api.consultant_application_locked, locale).toBeTruthy();
      for (const toast of ["attachmentRemoved", "attachmentUpdated", "evidenceUnlinked", "evidenceUpdated"]) {
        expect(catalogue.consultantWorkflow.toast[toast], `${locale} ${toast}`).toBeTruthy();
      }
    }
  });
});

describe("a record's complete-evidence copy, as a consultant is served it (JB228)", () => {
  // 客户 11-19: 「顾问不能查看建筑商内部的沟通记录」. For a consultant the server
  // sends no stored link for a J22 copy - only ``api_file``: the record's
  // 完整证据 made now, without the builder's internal talk.
  const served = {
    ...application,
    attachments: [
      { ...attachment("att-9", "MI-J22-001.pdf"), file: null, api_file: "/api/consultant-applications/app-1/open_attachment/?attachment=att-9" },
      attachment("att-1", "checklist.pdf"),
    ],
  } as unknown as ConsultantApplication;

  it("opens the copy through the signed-in download, never a stored link", () => {
    const html = render(<AttachmentRows application={served} editable={false} armed={false} onChanged={noop} />);
    const [copy, ordinary] = html.split("data-attachment=").slice(1);
    expect(copy).toContain("MI-J22-001.pdf");
    expect(copy).toContain("data-api-file");
    expect(copy).not.toContain("href=");
    // Any other attachment is the link it always was.
    expect(ordinary).toContain('href="/media/checklist.pdf"');
    expect(ordinary).not.toContain("data-api-file");
  });

  it("opens it in the in-app preview with 「正在生成…」, not a tab after the wait (audit 11-20 F4)", () => {
    // Making the copy takes seconds; a tab opened after that wait is blocked
    // by the browser without a word. The house way: fetch, then the preview.
    const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    const editor = read("src/components/consultant-workflow/application-draft-edit.tsx");
    const opener = editor.slice(editor.indexOf("export function useMadeNowCopy"), editor.indexOf("export function AttachmentLink"));
    expect(opener).toMatch(/run\(\s*"preview",\s*\{ load: \(\) => applicationAttachmentFile\(attachment\)/);
    const link = editor.slice(editor.indexOf("export function AttachmentLink"), editor.indexOf("export function AttachmentRows"));
    expect(link).toContain('t("attachmentCopyMaking")');
    expect(link).toContain("{copy.element}");
    const tile = read("src/components/consultant-workflow/attachment-slots.tsx");
    expect(tile).toContain("onOpen: () => copy.open(attachment)");
    expect(tile).toContain("{copy.element}");
    const service = read("src/services/consultant-workflow.service.ts");
    const fetcher = service.slice(service.indexOf("export const applicationAttachmentFile"));
    expect(fetcher.slice(0, 240)).toContain('fetchAsFile(attachment.api_file ?? "", {');
    expect(fetcher.slice(0, 240)).toContain('query: { inline: "1" }');
    expect(service).not.toContain("openApplicationAttachment");
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const catalogue = JSON.parse(read(`src/messages/${locale}.json`));
      expect(catalogue.consultantWorkflow.attachmentCopyMaking, locale).toBeTruthy();
      expect(catalogue.errors.api.application_record_copy_unavailable, locale).toBeTruthy();
    }
    expect(messages.consultantWorkflow.attachmentCopyMaking).toBe("正在生成…");
  });
});
