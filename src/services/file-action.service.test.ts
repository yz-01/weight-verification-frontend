import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * JB27 (客户 10-26 事项 3): 「整个电脑 Web 后台…打印、下载 / 导出、发送 / 分享
 * 必须验证本人六位数密码 · 正常查看、预览资料不需要密码 · 仅针对电脑 Web 后台」.
 */

const post = vi.fn();
let fieldSession = false;
vi.mock("@/services/api-client", () => ({ api: { post: (...args: unknown[]) => post(...args), list: vi.fn() } }));
vi.mock("@/lib/auth-token", () => ({
  isFieldSessionContext: () => fieldSession,
  isDriverSessionContext: () => false,
}));

const { authorizeFileAction, linkPath, recordFileAction, signFileAction, signsFileActions } = await import(
  "@/services/file-action.service"
);

afterEach(() => {
  post.mockReset();
  fieldSession = false;
});

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("the PIN and the log, before the file leaves", () => {
  it("asks on the desktop and never on the phone", async () => {
    expect(signsFileActions()).toBe(true);
    fieldSession = true;
    expect(signsFileActions()).toBe(false);
    expect(await signFileAction("PRINT", { subject: "QR" })).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it("goes ahead only when the log row was written", async () => {
    post.mockResolvedValueOnce({});
    expect(await signFileAction("PRINT", { subject: "QR", link: "/projects/1" })).toBe(true);
    expect(post).toHaveBeenCalledWith("/api/file-actions/record/", {
      subject: "QR",
      link: "/projects/1",
      action: "PRINT",
    });
    // The PIN dialog closed, or the server refused: nothing happens.
    post.mockRejectedValueOnce(new Error("cancelled"));
    expect(await signFileAction("PRINT", { subject: "QR" })).toBe(false);
  });

  it("hands back the grant, or nothing when the dialog was closed", async () => {
    post.mockResolvedValueOnce({ grant: "g1" });
    expect(await authorizeFileAction("DOWNLOAD")).toBe("g1");
    expect(post).toHaveBeenLastCalledWith("/api/file-actions/authorize/", { action: "DOWNLOAD" });
    post.mockRejectedValueOnce(new Error("cancelled"));
    expect(await authorizeFileAction("SEND")).toBeNull();
  });

  it("writes the row with the grant it was given", async () => {
    post.mockResolvedValueOnce({});
    await recordFileAction("SEND", { file_name: "a.pdf" }, "g2");
    expect(post).toHaveBeenCalledWith("/api/file-actions/record/", {
      file_name: "a.pdf",
      link: undefined,
      action: "SEND",
      grant: "g2",
    });
  });

  it("keeps only links inside the back office", () => {
    expect(linkPath("/receipts/1?tab=a")).toBe("/receipts/1?tab=a");
    expect(linkPath("//evil.example/x")).toBeUndefined();
    expect(linkPath(undefined)).toBeUndefined();
  });
});

describe("every way out of the back office asks", () => {
  it("the shared file buttons sign before they fetch and log before they act", () => {
    const actions = read("src/components/shared/file-actions.tsx");
    const leave = actions.slice(actions.indexOf("const leave = useCallback"), actions.indexOf("const act = useCallback"));
    const order = ["authorizeFileAction(type)", "withFileFetch(grant", "recordFileAction(type", "await perform("];
    const at = order.map((step) => leave.indexOf(step));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // A preview asks nothing and says it is one.
    expect(actions).toMatch(/withFileFetch\(signsFileActions\(\) \? \{ preview: true \} : null, source\.load\)/);
  });

  it("the export menu fetches again after a preview, so the real export is kept", () => {
    expect(read("src/components/shared/export-button.tsx")).toMatch(/exportedOnServer: true/);
  });

  it.each([
    "src/components/projects/project-qr-panel.tsx",
    "src/components/qrcodes/admin-qr-workspace.tsx",
    "src/components/suppliers/supplier-qr-panel.tsx",
    "src/components/recycler-business/recycler-customers-workspace.tsx",
    "src/components/site-access/emergency-list-workspace.tsx",
    "src/components/shared/evidence-file-actions.tsx",
    "src/components/shared/file-preview.tsx",
    // Review #6: the paths outside the shared buttons.
    "src/components/consultant-workflow/application-detail.tsx",
    "src/components/projects/project-dockets.tsx",
    "src/components/site-access/site-access-workspace.tsx",
    "src/components/suppliers/supplier-site-codes.tsx",
    "src/components/shared/record-attachments.tsx",
    "src/components/evidence/evidence-archive.tsx",
  ])("%s prints or downloads only after signFileAction", (file) => {
    const source = read(file);
    expect(source).toMatch(/signFileAction\(/);
    // No print window opened outside the shared helpers.
    expect(source).not.toMatch(/window\.open\("", "_blank"/);
  });
});

describe("review fixes", () => {
  it("fetches a daily report and a record's PDF again for the real export (review #4)", () => {
    expect(read("src/components/progress/daily-reports.tsx")).toMatch(/exportedOnServer: true/);
    expect(read("src/components/shared/record-export-button.tsx").match(/exportedOnServer: true/g)).toHaveLength(2);
  });

  it("escapes names written into a printed QR page (review #11)", () => {
    expect(read("src/components/suppliers/supplier-qr-panel.tsx")).toMatch(/escapePrintHtml\(supplier\.name\)/);
    const customers = read("src/components/recycler-business/recycler-customers-workspace.tsx");
    expect(customers).toMatch(/escapePrintHtml\(customer\.company_name\)/);
    expect(customers).not.toMatch(/<h1>\$\{customer\.company_name\}/);
  });

  it("offers no second regeneration of a row already generated again (review #5)", () => {
    expect(read("src/components/contractor-ops/contractor-report-history.tsx")).toMatch(/row\.regenerated_as \?/);
  });
});
