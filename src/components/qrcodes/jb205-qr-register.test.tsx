/**
 * JB205 (Lucas 11-16 audit) - 二维码管理 › 类型.
 *
 * - JB205-2: 「编辑」 opens filled with the code's expiry date and note. It
 *   opened empty (its fields were filled only by Radix's onOpenChange, which a
 *   dialog opened from state never fires), and 保存 then wiped both.
 * - JB205-7: 签发 / 编辑 / 停用 / 作废 / 重新生成 are `qr.manage` on the server
 *   and are shown only to whoever holds it.
 * - JB205-10: each row action says its name, and 编辑 is a pencil, not ↻.
 *
 * Rendered to static markup (the runner has no DOM): closed dialogs draw
 * nothing, an open one is drawn in place.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { QRCode } from "@/interfaces/qrcode";
import zh from "@/messages/zh.json";

const state = vi.hoisted(() => ({ codes: new Set<string>() }));

vi.mock("@/components/ui/dialog", async () => {
  const kit = (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule();
  return {
    ...kit,
    Dialog: (props: { open?: boolean; children?: React.ReactNode }) =>
      props.open === false ? null : kit.Dialog(props),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/qr-codes/types",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "MSE", portal: "MSE_ADMIN", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => state.codes.has(code),
  }),
}));

const { AdminQRWorkspace, EditDialog } = await import("@/components/qrcodes/admin-qr-workspace");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

const CODE: QRCode = {
  id: "qr-1",
  serial: "QR-000123",
  subject_type: "CONTRACTOR",
  subject_type_display: "Contractor",
  subject_id: "c-1",
  subject_label: "Builder Sdn Bhd",
  company: "c-1",
  company_code: "CT-1",
  company_name: "Builder Sdn Bhd",
  project: null,
  project_name: null,
  site: null,
  site_name: null,
  status: "ACTIVE",
  effective_status: "ACTIVE",
  issued_on: "2026-11-01",
  expires_on: "2027-01-31",
  is_expired: false,
  status_changed_at: null,
  status_changed_by: null,
  status_changed_by_name: null,
  status_note: "",
  replaces: null,
  replaces_serial: null,
  last_scanned_at: null,
  scan_count: 4,
  notes: "Gate 2 only",
  created_at: "2026-11-01T00:00:00Z",
};

function render(node: React.ReactNode, codes: string[] = [], seed: (qc: QueryClient) => void = () => {}) {
  state.codes = new Set(codes);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const seedRegister = (qc: QueryClient) =>
  qc.setQueryData(["admin-qr", "codes", 1, "", "", "", "", "", ""], {
    count: 1,
    page: 1,
    page_size: 25,
    total_pages: 1,
    results: [CODE],
  });

describe("JB205-2: 编辑 opens with the code's own expiry date and note", () => {
  it("fills both fields from the code", () => {
    const html = render(<EditDialog code={CODE} onClose={() => {}} onSaved={() => {}} />, ["qr.manage"]);
    expect(html).toContain(zh.adminQr.edit.title);
    expect(html).toContain('value="2027-01-31"');
    expect(html).toMatch(/<textarea[^>]*>Gate 2 only<\/textarea>/);
  });

  it("mounts a fresh dialog for each code, so its fields are that code's", () => {
    const source = read("src/components/qrcodes/admin-qr-workspace.tsx");
    expect(source).toMatch(/<EditDialog key=\{editing\?\.id/);
    expect(source).not.toContain("initialise()");
  });
});

describe("JB205-7: the write buttons follow qr.manage", () => {
  // The button, not the page's subtitle (「…签发二维码」), which names it too.
  const issueButton = `</svg>${zh.adminQr.action.issue}</button>`;

  it("a read-only role sees the codes and 查看, nothing it cannot do", () => {
    const html = render(<AdminQRWorkspace section="types" />, ["qr.view"], seedRegister);
    expect(html).toContain("QR-000123");
    expect(html).toContain(`title="${zh.common.view}"`);
    expect(html).not.toContain(issueButton);
    expect(html).not.toContain(`title="${zh.common.edit}"`);
    for (const action of ["disable", "void", "reissue"] as const) {
      expect(html).not.toContain(`title="${zh.adminQr.action[action]}"`);
    }
  });

  it("whoever holds qr.manage keeps every button", () => {
    const html = render(<AdminQRWorkspace section="types" />, ["qr.view", "qr.manage"], seedRegister);
    expect(html).toContain(issueButton);
    expect(html).toContain(`title="${zh.common.edit}"`);
    for (const action of ["disable", "void", "reissue"] as const) {
      expect(html).toContain(`title="${zh.adminQr.action[action]}"`);
    }
  });
});

describe("JB205-10: each row action says its name; 编辑 is a pencil", () => {
  it("draws the words beside the icons", () => {
    const html = render(<AdminQRWorkspace section="types" />, ["qr.view", "qr.manage"], seedRegister);
    const row = html.slice(html.indexOf("QR-000123"));
    for (const word of [zh.common.view, zh.common.edit, zh.adminQr.action.disable, zh.adminQr.action.void, zh.adminQr.action.reissue]) {
      expect(row).toMatch(new RegExp(`</svg>${word}</button>`));
    }
    expect(row).toContain("lucide-pencil");
    expect(row).not.toContain("lucide-refresh-cw");
  });
});
