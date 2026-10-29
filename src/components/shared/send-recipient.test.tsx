/**
 * JB64 / JB65 (客户 10-29 事项 2、3): 「发送给谁什么时候发送这个记录会留在哪里
 * 呢？」 - every 发送 asks who it goes to before the PIN, is written as
 * 「已打开分享窗口」 and only becomes 「已确认发送」 when a person says so; every
 * record lists its 「发送记录」; the operation log shows the recipient.
 *
 * Rendered to static markup (the runner has no DOM) and read from the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { FileShare } from "@/interfaces/file-action";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/receipts",
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

const { contactOk, phoneOk, contactKey, recipientLine, offeredRecipients, watchReturn } = await import(
  "@/components/shared/send-recipient"
);
const { RecordSendLog, recordSharesKey, newestFirst } = await import("@/components/shared/record-send-log");
const { SentToCell } = await import("@/components/contractor-ops/contractor-report-history");
const { packageSharePart } = await import("@/components/contractor-ops/package-share");

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

const share = (overrides: Partial<FileShare> = {}): FileShare => ({
  id: "s1",
  created_at: "2026-10-29T02:47:25Z",
  sent_by_name: "test",
  method: "WHATSAPP",
  recipient_name: "Ah Kow",
  recipient_company: "Owner Sdn Bhd",
  recipient_contact: "012-345 6789",
  subject: "GRN-001",
  file_name: "GRN-001.pdf",
  record_kind: "MATERIAL_RECEIPT",
  record_id: "r1",
  part: "",
  status: "OPENED",
  confirmed_at: null,
  confirmed_by_name: "",
  ...overrides,
});

describe("JB64: 发给谁 - the recipient form's rules match the server's", () => {
  it("WhatsApp takes a phone number, Email an address, 其他 anything", () => {
    expect(phoneOk("012-345 6789")).toBe(true);
    expect(phoneOk("+60 12 345 6789")).toBe(true);
    expect(phoneOk("12345")).toBe(false);
    expect(phoneOk("abc123456")).toBe(false);
    expect(contactOk("WHATSAPP", "")).toBe(false);
    expect(contactOk("EMAIL", "qs@owner.test")).toBe(true);
    expect(contactOk("EMAIL", "012-3456789")).toBe(false);
    expect(contactOk("OTHER", "")).toBe(true);
    expect(contactKey("WHATSAPP")).toBe("phone");
    expect(contactKey("EMAIL")).toBe("email");
    expect(contactKey("OTHER")).toBe("contact");
    expect(recipientLine(share())).toBe("Ah Kow · Owner Sdn Bhd · 012-345 6789");
  });

  it("asks 发给谁 before the PIN, and sends the recipient with the log row", () => {
    const actions = source("src/components/shared/file-actions.tsx");
    const leave = actions.slice(actions.indexOf("const leave = useCallback"), actions.indexOf("const act = useCallback"));
    const order = ["askRecipient(", "authorizeFileAction(type)", "recordFileAction(type", "await perform("];
    const at = order.map((step) => leave.indexOf(step));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(leave).toContain("grant, recipient)");
    // Closing the form sends nothing.
    expect(leave).toMatch(/if \(!recipient\) return;/);
  });

  it("back from the share window it asks 发出去了吗, and never writes 已确认发送 by itself", () => {
    const actions = source("src/components/shared/file-actions.tsx");
    expect(actions).toContain("setQuestion(held)");
    expect(actions).toContain("<SentQuestion share={share}");
    const question = source("src/components/shared/send-recipient.tsx");
    // Only 「已发送」 confirms.
    expect(question.match(/confirmFileShare\(/g)).toHaveLength(1);
    expect(question.slice(question.indexOf("const yes"), question.indexOf("const no"))).toContain("confirmFileShare(");
  });

  it("no send in the back office goes round the shared one", () => {
    // Every file 发送 is `useFileActions` (`run("share"`); nothing else hands a
    // file to WhatsApp or signs a SEND by itself.
    for (const file of [
      "src/components/shared/evidence-file-actions.tsx",
      "src/components/contractor-ops/package-share.tsx",
      "src/components/shared/record-export-button.tsx",
      "src/components/shared/export-button.tsx",
    ]) {
      const text = source(file);
      expect(text).not.toMatch(/signFileAction\("SEND"/);
      expect(text).not.toContain("whatsappLink(");
    }
    expect(source("src/components/shared/evidence-file-actions.tsx")).toContain("...target");
  });

  it("a package names its file in the one share log", () => {
    expect(packageSharePart({})).toBe("");
    expect(packageSharePart({ round: 2 })).toBe("R2");
    expect(packageSharePart({ transcript: true })).toBe("TRANSCRIPT");
    const pkg = source("src/components/contractor-ops/package-share.tsx");
    expect(pkg).toContain('recordKind: "EVIDENCE_PACKAGE"');
    expect(pkg).not.toContain("logPackageShare");
  });

  it("says it in every language", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const send = messages.fileActions.send;
      for (const key of ["title", "name", "company", "phone", "email", "contact", "next", "askTitle", "yes", "no"] as const) {
        expect(send[key]).toBeTruthy();
      }
      expect(send.status.OPENED).toBeTruthy();
      expect(send.status.CONFIRMED).toBeTruthy();
      expect(send.log.title).toBeTruthy();
      expect(messages.contractorReports.history.filter.recipient).toBeTruthy();
    }
    expect(zh.fileActions.send.status.OPENED).toBe("已打开分享窗口");
    expect(zh.fileActions.send.status.CONFIRMED).toBe("已确认发送");
    expect(zh.fileActions.send.askTitle).toBe("发出去了吗？");
    expect(zh.fileActions.send.yes).toBe("已发送");
    expect(zh.fileActions.send.no).toBe("没有发");
  });
});

describe("JB65: a record's 发送记录", () => {
  const log = (rows: FileShare[]) =>
    render(<RecordSendLog recordKind="MATERIAL_RECEIPT" recordId="r1" />, (client) =>
      client.setQueryData(recordSharesKey("MATERIAL_RECEIPT", "r1"), rows),
    );

  it("lists every send newest first, with to whom, how, when and its status", () => {
    const html = log([
      share({ id: "old", recipient_name: "First Person", created_at: "2026-10-28T01:00:00Z" }),
      share({
        id: "new",
        recipient_name: "QS Lim",
        method: "EMAIL",
        recipient_contact: "qs@owner.test",
        status: "CONFIRMED",
        confirmed_at: "2026-10-29T03:00:00Z",
        confirmed_by_name: "Boss",
        created_at: "2026-10-29T03:00:00Z",
      }),
    ]);
    expect(html).toContain("data-record-send-log");
    expect(html).toContain(zh.fileActions.send.log.title);
    expect(html.indexOf("QS Lim")).toBeLessThan(html.indexOf("First Person"));
    expect(html).toContain("qs@owner.test");
    expect(html).toContain("Owner Sdn Bhd");
    expect(html).toContain("012-345 6789");
    expect(html).toContain(zh.fileActions.send.status.OPENED);
    expect(html).toContain(zh.fileActions.send.status.CONFIRMED);
    expect(html).toContain("Boss");
    // Only the open one offers 「标记为已发送」.
    expect(html.match(/data-mark-sent/g)).toHaveLength(1);
  });

  it("says so when nothing was sent", () => {
    expect(log([])).toContain(zh.fileActions.send.log.empty);
  });

  it("sorts newest first whatever order it is given", () => {
    const rows = newestFirst([share({ id: "a", created_at: "2026-01-01" }), share({ id: "b", created_at: "2026-02-01" })]);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("is in the record detail frame once, for every record kind, and in the details outside it", () => {
    const shell = source("src/components/shared/record-detail-shell.tsx");
    expect(shell.match(/<RecordSendLogFor exportRecord=\{header\.exportRecord\} \/>/g)).toHaveLength(2);
    for (const file of [
      "src/components/document-workflow/documents.tsx",
      "src/components/document-workflow/approvals.tsx",
      "src/components/settlements/view-settlement.tsx",
      "src/components/settlements/payment-proofs.tsx",
      "src/components/projects/view-project.tsx",
      "src/components/weighing/view-weigh-session.tsx",
      "src/components/site-access/site-access-workspace.tsx",
      "src/components/site-operations/attendance.tsx",
    ]) {
      expect(source(file), file).toContain("<RecordSendLog recordKind=");
    }
    // A package keeps its own 发送记录, which reads the same share log.
    expect(source("src/components/contractor-ops/package-claim-parts.tsx")).toContain("<ShareLine");
  });
});

describe("JB65: the operation log shows the recipient", () => {
  it("a send row says to whom, how and whether it went", () => {
    const html = render(<SentToCell share={share()} />);
    expect(html).toContain("Ah Kow · Owner Sdn Bhd");
    expect(html).toContain("WhatsApp · 012-345 6789");
    expect(html).toContain(zh.fileActions.send.status.OPENED);
  });

  it("is searched by recipient on the log tab", () => {
    const history = source("src/components/contractor-ops/contractor-report-history.tsx");
    expect(history).toContain('data-slot="history-filter-recipient"');
    expect(history).toContain("recipient: recipient || undefined");
    // Print, download and export rows stay as they were.
    expect(history).toMatch(/row\.share \? \(\s+<SentToCell share=\{row\.share\} \/>\s+\) : row\.channel \?/);
  });
});

describe("10-29 fixes", () => {
  const actions = source("src/components/shared/file-actions.tsx");
  const dialog = actions.slice(actions.indexOf("function ShareFileDialog"), actions.indexOf("export function ShareHint"));

  it("1: with no share window the send is written only when 下载文件 / WhatsApp / 电邮 is pressed", () => {
    const leave = actions.slice(actions.indexOf("const leave = useCallback"), actions.indexOf("const act = useCallback"));
    const noWindow = leave.slice(leave.indexOf("!canShareFile(file)"), leave.indexOf("let share: FileShare | null"));
    // Not written here: handed to the dialog to write on the first press.
    expect(noWindow).toContain("const writeLog = async");
    expect(noWindow).toContain("setSending({");
    expect(noWindow.indexOf("return;")).toBeGreaterThan(noWindow.indexOf("setSending({"));
    expect(leave.indexOf("!canShareFile(file)")).toBeLessThan(leave.indexOf("let share: FileShare | null"));
    // Each of the three writes first, and goes only if it was written.
    for (const press of ["const download", "const email", "const whatsapp"]) {
      const body = dialog.slice(dialog.indexOf(press), dialog.indexOf("};", dialog.indexOf(press)));
      expect(body, press).toMatch(/if \(await handOver\(\)\)/);
    }
    expect(dialog).toMatch(/const written = await held\.writeLog\(\);\s+setWriting\(false\);\s+if \(!written\) return false;/);
    // No link that leaves before the send is written.
    expect(dialog).not.toContain("<a href={mailtoLink");
  });

  it("1: 发出去了吗 is asked once they come back to the page", () => {
    expect(dialog).toContain("watchReturn(window, document, () => setBack(true))");
    expect(dialog).toContain("{back && share ? <SentQuestion");
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    let back = 0;
    const stop = watchReturn(win, doc, () => (back += 1));
    win.dispatchEvent(new Event("focus"));
    expect(back).toBe(0); // never left
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    expect(back).toBe(1);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(back).toBe(2);
    stop();
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    expect(back).toBe(2);
  });

  it("2: nothing says 已发送 before the person does", () => {
    expect(actions).toMatch(/if \(!held\.share\) toast\.success\(t\("shared"\)\);/);
    expect(dialog).toMatch(/if \(!share\) toast\.success\(t\("shared"\)\);/);
    expect(actions).not.toMatch(/^\s+toast\.success\(t\("shared"\)\);/m);
    for (const messages of [zh, zhTW]) {
      expect(messages.fileActions.shared).not.toMatch(/已发送|已發送/);
    }
    expect(en.fileActions.shared).not.toMatch(/sent\./i);
  });

  it("3: a recent person without a name is not offered", () => {
    const people = offeredRecipients([
      { method: "WHATSAPP", recipient_name: "", recipient_company: "", recipient_contact: "+60 12-338 4410" },
      { method: "WHATSAPP", recipient_name: "  ", recipient_company: "", recipient_contact: "0123" },
      { method: "EMAIL", recipient_name: "QS Lim", recipient_company: "", recipient_contact: "qs@owner.test" },
    ]);
    expect(people.map((person) => person.recipient_name)).toEqual(["QS Lim"]);
  });

  it("4: the 项目 filter keeps no empty label beside 接收方", () => {
    const history = source("src/components/contractor-ops/contractor-report-history.tsx");
    expect(history).toContain('useProjectBoxShown("filter")');
    expect(history).toMatch(/projectBoxShown \? \(\s+<FilterField label=\{t\("history\.project"\)\}>\{projectPicker\}<\/FilterField>/);
  });
});

describe("10-29 tutorial fixes", () => {
  it("every file the back office prints, saves or sends names its record, so its row is filed under its project", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) files.push(full);
      }
    };
    walk(resolve(process.cwd(), "src/components"));
    // Not one record: a list's or report's export (its 报表导出历史 row names
    // the project), a QR sticker sheet of many machines, the public package
    // link (no back-office account), and the shared helpers themselves.
    const notARecord = [
      "shared/export-button.tsx",
      "shared/file-actions.tsx",
      "contractor-ops/office-module-lists.tsx",
      "package-link/package-link.tsx",
      "reports/report-archive.tsx",
    ];
    const missing: string[] = [];
    for (const file of files) {
      const rel = file.replace(/\\/g, "/").split("src/components/")[1];
      if (notARecord.includes(rel)) continue;
      const text = readFileSync(file, "utf8");
      const pattern = /<FileActionButtons|<FileActionMenu|\brun\("(?:share|print|save|preview)"/g;
      for (const match of text.matchAll(pattern)) {
        const near = text.slice(match.index, match.index + 1200);
        if (!/recordKind|packageRecord\(|\.\.\.record|\.\.\.source|\.\.\.target|\.\.\.named/.test(near)) missing.push(`${rel}@${match.index}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the progress summary names its project and record, and lists its 发送记录", () => {
    const summary = source("src/components/progress/progress-summary.tsx");
    expect(summary).toContain("project: shown.project");
    expect(summary).toContain('recordKind: "PROGRESS_SUMMARY"');
    expect(summary).toContain('<RecordSendLog recordKind="PROGRESS_SUMMARY" recordId={shown.id} />');
    for (const [file, kind] of [
      ["src/components/progress/daily-reports.tsx", "DAILY_REPORT"],
      ["src/components/material-requests/material-requests-office.tsx", "MATERIAL_REQUEST"],
      ["src/components/contractor-ops/claim-engine.tsx", "EVIDENCE_PACKAGE"],
      ["src/components/billing/invoice-list.tsx", "INVOICE"],
    ] as const) {
      expect(source(file), file).toContain(`<RecordSendLog recordKind="${kind}"`);
    }
  });

  it("the 发给谁 help line does not name WhatsApp whatever the method", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.fileActions.send.intro).not.toMatch(/WhatsApp/);
      expect(messages.fileActions.send.intro).toBeTruthy();
    }
  });
});
