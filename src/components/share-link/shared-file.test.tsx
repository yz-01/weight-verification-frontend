/**
 * The page a WhatsApp / email recipient opens (`/s/<token>`, 客户 11-08).
 * Rendered to static markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { FileShare, SharedFileInfo } from "@/interfaces/file-action";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/s/tok",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    can: () => false,
    refresh: async () => {},
    isLoading: false,
  }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { SharedFileView } = await import("@/components/share-link/shared-file");
const { ShareLine } = await import("@/components/shared/record-send-log");

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

const info = (overrides: Partial<SharedFileInfo> = {}): SharedFileInfo => ({
  file_name: "GRN-001.pdf",
  kind: "pdf",
  content_type: "application/pdf",
  company_name: "Kim Builders",
  sender_name: "Lucas",
  expires_at: "2026-12-08T02:00:00Z",
  expired: false,
  ...overrides,
});

const page = (data: SharedFileInfo) =>
  render(<SharedFileView token="tok" />, (client) => client.setQueryData(["shared-file", "tok"], data));

describe("/s/<token>: the recipient's page", () => {
  it("shows who sent which file, 打开 PDF and 下载 side by side, and until when", () => {
    const html = page(info());
    expect(html).toContain("Kim Builders 的 Lucas 发给你的文件");
    expect(html).toContain("GRN-001.pdf");
    expect(html).toContain("打开 PDF");
    expect(html).toMatch(/href="[^"]*\/api\/file-shares\/public\/tok\/download\/"/);
    expect(html).toContain("下载");
    expect(html).toMatch(/href="[^"]*\/api\/file-shares\/public\/tok\/download\/\?download=1"/);
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("链接有效到");
    // Nothing downloads by itself.
    expect(html).not.toContain(" download=");
  });

  it("a photo says 查看照片; another file only 下载文件", () => {
    expect(page(info({ kind: "image", file_name: "a.jpg" }))).toContain("查看照片");
    const sheet = page(info({ kind: "file", file_name: "list.xlsx" }));
    expect(sheet).toContain("下载文件");
    expect(sheet).not.toContain("?download=1");
  });

  it("an expired link says so and offers no file", () => {
    const html = page(info({ expired: true }));
    expect(html).toContain("链接已过期");
    expect(html).not.toContain("/download/");
  });

  it("is public, client-rendered and never fetched by a link preview", () => {
    const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain('"/s",');
    const view = readFileSync(resolve(process.cwd(), "src/components/share-link/shared-file.tsx"), "utf8");
    expect(view.startsWith('"use client";')).toBe(true);
    expect(view).toContain("getSharedFileInfo(token)");
    // Never the office's session on this page.
    const service = readFileSync(resolve(process.cwd(), "src/services/file-action.service.ts"), "utf8");
    const reader = service.slice(service.indexOf("export async function getSharedFileInfo"));
    expect(reader).toContain('credentials: "omit"');
  });
});

describe("发送记录: 对方已打开", () => {
  const share = (overrides: Partial<FileShare> = {}): FileShare => ({
    id: "s1",
    created_at: "2026-11-08T02:00:00Z",
    sent_by_name: "Lucas",
    method: "WHATSAPP",
    recipient_name: "Ah Kow",
    recipient_company: "",
    recipient_contact: "012-345 6789",
    subject: "GRN-001",
    file_name: "GRN-001.pdf",
    record_kind: "MATERIAL_RECEIPT",
    record_id: "r1",
    part: "",
    status: "OPENED",
    confirmed_at: null,
    confirmed_by_name: "",
    has_link: true,
    ...overrides,
  });

  it("shows the badge beside the status, which stays 已打开分享窗口", () => {
    const html = render(<ShareLine share={share({ opened_at: "2026-11-08T03:00:00Z", open_count: 1 })} />);
    expect(html).toContain("data-share-opened");
    expect(html).toContain("对方已打开 · ");
    expect(html).toContain("已打开分享窗口");
    expect(html).not.toContain("次）");
  });

  it("counts more than one open", () => {
    const html = render(<ShareLine share={share({ opened_at: "2026-11-08T03:00:00Z", open_count: 3 })} />);
    expect(html).toContain("（3 次）");
  });

  it("no badge before anybody opened it", () => {
    expect(render(<ShareLine share={share({ opened_at: null, open_count: 0 })} />)).not.toContain("data-share-opened");
  });
});
