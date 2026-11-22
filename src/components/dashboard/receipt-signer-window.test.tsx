/**
 * JB234 (客户 11-20 事项 6): the 签收人 on 「最新材料进场记录」 - the signing
 * account's picture or the name's initials (never anyone else's picture),
 * 「未签收」 when nobody signed, and the window with the signer and the signing.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectOverview, ReceiptSigner } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard/project",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { ProjectReference } = await import("@/components/dashboard/project-reference");
const { ReceiptSignerPanel, SignerButton, signerInitials } = await import(
  "@/components/dashboard/receipt-signer-window"
);

const withAccount: ReceiptSigner = {
  name: "Ah Ong",
  user_id: "u1",
  avatar: "https://cdn.example/ong.jpg",
  title: "现场工作人员",
  company: "MSE Construction",
  phone: "+60 19-966 6558",
  signed_at: "2026-11-20T03:38:00Z",
};
const nameOnly: ReceiptSigner = { ...withAccount, user_id: null, avatar: null, title: "", company: "", phone: "" };

type Row = NonNullable<ProjectOverview["latest_receipts"]>[number];
const row = (id: string, signer?: ReceiptSigner, extra: Partial<Row> = {}): Row => ({
  id,
  receipt_no: `MI-${id}`,
  business_at: "2026-11-20T03:38:00Z",
  supplier: "Paint Supply",
  material: "Paint",
  category: "Paint",
  quantity: "102.000",
  unit: "PAIL",
  acceptance_status: "ACCEPTED",
  signer,
  signature_url: "https://cdn.example/sig.png",
  accepted_by_name: "Mike",
  accepted_at: "2026-11-20T04:00:00Z",
  ...extra,
});

const data: ProjectOverview = {
  date: "2026-11-20",
  project: { id: "p1", code: "PRJ-0003", name: "PUTRA_MAS", latitude: null, longitude: null },
  cards: { pending_total: 0 },
  latest_receipts: [
    row("1", withAccount),
    row("2", nameOnly),
    row("3", { ...nameOnly, name: "" }),
  ],
  material_mix: [],
  waste_mix: [],
  pending: [],
  photos: [],
};

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["contractor-dashboard", "project-overview", "p1"], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the 签收人 on the latest deliveries (JB234)", () => {
  it("shows the signing account's picture, else the initials, else 未签收", () => {
    const html = wrap(<ProjectReference project="p1" />);
    const list = html.slice(html.indexOf("data-latest-receipts"));
    expect(list).toContain('data-receipt-signer="account"');
    expect(list).toContain("ong.jpg");
    expect(list).toContain('data-receipt-signer="name"');
    expect(list).toContain('data-signer-avatar="initials"');
    expect(list).toContain("未签收");
    // Only the one signer with an account has a picture - never borrowed.
    expect(list.match(/data-signer-avatar="photo"/g)).toHaveLength(1);
  });

  it("is one button over the circle and the name, which opens the window", () => {
    const html = wrap(<SignerButton signer={withAccount} onOpen={() => {}} />);
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('aria-label="查看签收人 Ah Ong"');
    expect(html).toContain("Ah Ong");
    // A phone wraps a long name instead of cutting it (J34-5); a computer truncates.
    expect(html).toContain("break-words");
    expect(html).toContain("sm:truncate");
    expect(html).toContain("pointer-coarse:min-h-11");
  });

  it("the initials are the name's", () => {
    expect(signerInitials("ah ong")).toBe("AO");
    expect(signerInitials("黄 小明")).toBe("黄小");
    expect(signerInitials("")).toBe("");
  });
});

describe("ReceiptSignerWindow's contents (JB234)", () => {
  it("shows the signer and the signing, with 打开这笔材料进场", () => {
    const html = wrap(<ReceiptSignerPanel row={row("1", withAccount)} onOpenReceipt={() => {}} />);
    for (const words of [
      "Ah Ong", "现场工作人员", "MSE Construction", "+60 19-966 6558", "tel:+60199666558",
      "签收记录", "MI-1", "Paint", "102", "签收时间", "签收人签名", "sig.png", "验收状态", "已验收",
      "验收人", "Mike", "打开这笔材料进场",
    ]) {
      expect(html).toContain(words);
    }
    expect(html).toContain('data-signer-avatar="photo"');
    expect(html).not.toContain("data-signer-no-account");
  });

  it("a signer without an account: the name, initials, no number, and why", () => {
    const html = wrap(
      <ReceiptSignerPanel row={row("2", nameOnly, { signature_url: null })} onOpenReceipt={() => {}} />,
    );
    expect(html).toContain("Ah Ong");
    expect(html).toContain('data-signer-avatar="initials"');
    expect(html).not.toContain("tel:");
    expect(html).toContain("data-signer-no-account");
    expect(html).toContain("没有签名");
  });
});
