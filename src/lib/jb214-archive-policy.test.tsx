/**
 * 「归档后锁定记录」 per project on the office's screens (JB214-3d, Lucas 11-16
 * Q1 = A 「按项目锁」): a record of a project MSE locked offers no 修改 /
 * 上传 / 改正 after 确认归档 (only what the server still takes); every other
 * project keeps Lucas's 10-30 evening rule. The server has the last word.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), list: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { ARCHIVE_LOCKS_CHANGES, useArchiveLocksChanges } = await import("@/lib/archive-policy");

function Probe({ project }: { project?: string | null }) {
  return <span>{String(useArchiveLocksChanges(project))}</span>;
}

function read(project: string | null | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["projects", "detail", "locked"], { id: "locked", archive_locked: true });
  client.setQueryData(["projects", "detail", "open"], { id: "open", archive_locked: false });
  client.setQueryData(["projects", "detail", "older"], { id: "older" });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Probe project={project} />
    </QueryClientProvider>,
  );
}

describe("useArchiveLocksChanges (JB214-3d)", () => {
  it("follows the record's project", () => {
    expect(ARCHIVE_LOCKS_CHANGES).toBe(false);
    expect(read("locked")).toContain("true");
    expect(read("open")).toContain("false");
    // A project read before the flag existed, or not read yet: as before (10-30).
    expect(read("older")).toContain("false");
    expect(read("unread")).toContain("false");
    expect(read(null)).toContain("false");
  });

  it("is what every screen that hid a change on archiving now asks", () => {
    const files = [
      "src/components/consultant-workflow/application-detail.tsx",
      "src/components/contractor-ops/office-module-lists.tsx",
      "src/components/material-requests/material-requests-office.tsx",
      "src/components/progress/progress-summary.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).toContain("useArchiveLocksChanges(");
      expect(source, file).not.toContain("import { ARCHIVE_LOCKS_CHANGES }");
    }
    // JB276 (客户 11-26 事项 17): an archived 材料进场 is locked on every
    // project - its page no longer asks the project's switch.
    const receipt = readFileSync(path.join(process.cwd(), "src/components/receipts/view-receipt.tsx"), "utf8");
    expect(receipt).not.toContain("useArchiveLocksChanges(");
    expect(receipt).toContain("!archived");
    const documents = readFileSync(path.join(process.cwd(), "src/components/document-workflow/documents.tsx"), "utf8");
    // A document list spans projects: each row says whether its own is locked.
    expect(documents.match(/!ARCHIVE_LOCKS_CHANGES && !record\.archive_locked/g)?.length).toBe(2);
  });
});

describe("documents (JB214-3d)", () => {
  it("offers 添加文件 on an archived document only where its project is not locked", async () => {
    const { addFilesRule } = await import("@/components/document-workflow/documents");
    const can = () => true;
    const t = (key: string) => key;
    expect(addFilesRule({ status: "ARCHIVED", project: "p1", archive_locked: false }, can, t).shown).toBe(true);
    expect(addFilesRule({ status: "ARCHIVED", project: "p1" }, can, t).shown).toBe(true);
    expect(addFilesRule({ status: "ARCHIVED", project: "p1", archive_locked: true }, can, t).shown).toBe(false);
    // An open document is open whatever its project says.
    expect(addFilesRule({ status: "ACTIVE", project: "p1", archive_locked: true }, can, t).shown).toBe(true);
  });
});
