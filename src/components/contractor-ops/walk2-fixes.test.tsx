/**
 * Walk 2 (2026-11-28) small wording and layout findings G1-G9, rendered to
 * static markup (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { PackRowStatus } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/sundry-claims",
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-pm", full_name: "PM", is_field_staff: false, features: [], permissions: [] },
    can: () => true,
  }),
}));

const { PackCollectValueProvider, usePackList } = await import("@/components/contractor-ops/pack-collect");

function render(node: React.ReactNode, seed: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of seed) client.setQueryData(key, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/* ------------------------------------------------------------------ */

describe("G1: a rejected / withdrawn 杂费报销's grey box says why in words", () => {
  const COLLECTING = {
    collecting: { id: "pkg-a", name: "杂费报销 11 月", project: "p-1" },
    itemCount: 0,
    packageNo: "PKG-1",
    start: () => {},
    end: () => {},
  };
  const status = (over: Partial<PackRowStatus>): PackRowStatus => ({
    count: 0,
    in_package: false,
    can_add: true,
    reason: "",
    ...over,
  });

  function Boxes({ ids }: { ids: string[] }) {
    const pack = usePackList({ kind: "SUNDRY_CLAIM" }, ids.map((id) => ({ id })));
    return (
      <div>
        {ids.map((id) => (
          <div key={id} data-row={id}>
            {pack.check(id)}
          </div>
        ))}
      </div>
    );
  }

  it("writes 「已拒绝或已撤回」 beside the box, not only in a hover title", () => {
    const ids = ["c-8", "c-7", "c-5"];
    const html = render(
      <PackCollectValueProvider value={COLLECTING}>
        <Boxes ids={ids} />
      </PackCollectValueProvider>,
      [
        [
          ["evidence-packages", "pack-status", "SUNDRY_CLAIM", "pkg-a", ids],
          {
            records: {
              "c-8": status({ can_add: false, reason: "ended" }),
              "c-7": status({}),
              "c-5": status({ can_add: false, reason: "not_finished" }),
            },
          },
        ],
      ],
    );
    const row = (id: string) => html.split(`data-row="${id}"`)[1]?.split("data-row=")[0] ?? "";
    expect(row("c-8")).toContain('data-slot="pack-refused-reason"');
    expect(row("c-8")).toContain(`>${zh.multiEngine.collect.reason.ended}</span>`);
    // An open row, and a passing reason, stay as they were.
    expect(row("c-7")).not.toContain("pack-refused-reason");
    expect(row("c-5")).not.toContain("pack-refused-reason");
    expect(row("c-5")).toContain(`title="${zh.multiEngine.collect.reason.not_finished}"`);
  });
});

describe("G2: the 资料包类型 hint no longer says the Progress Claim fields may be left empty", () => {
  it("names what is required, in all four languages", () => {
    for (const [language, messages] of [["zh", zh], ["zh-TW", zhTW], ["en", en], ["ms", ms]] as const) {
      const help = messages.multiEngine.type.help;
      expect(help, language).not.toMatch(/都可以不填|all optional|semuanya pilihan/);
      expect(help, language).toContain("Claim No.");
    }
    expect(zh.multiEngine.type.help).toContain("一定要填 Claim 类型和分类");
    expect(zh.multiEngine.type.help).toContain("申请金额");
  });
});

describe("G3: 总部（系统内） is named, and a QS who signs as himself is named once", () => {
  const words = zh.multiEngine.exchange;

  it("the answer lines under a record: no bare 「：待处理」", async () => {
    const { AnswerLines } = await import("@/components/contractor-ops/package-exchange");
    const html = render(
      <AnswerLines
        answers={[
          { recipient: "r-qs", recipient_name: "示范 QS（美美）", recipient_kind: "QS", decision: "ACCEPTED", reason: "", actor_name: "", at: null, signed: true },
          { recipient: "r-hq", recipient_name: "", recipient_kind: "HEADQUARTERS", decision: "PENDING", reason: "", actor_name: "", at: null, signed: false },
          { recipient: "r-hq2", recipient_name: "", recipient_kind: "HEADQUARTERS", decision: "RETURNED", reason: "照片看不清", actor_name: "", at: null, signed: true },
        ]}
      />,
    );
    expect(html).toContain(`示范 QS（美美）：${words.answer.ACCEPTED}`);
    expect(html).toContain(`${words.kind.HEADQUARTERS}：${words.answer.PENDING}`);
    expect(html).toContain(`${words.kind.HEADQUARTERS}：退回——照片看不清`);
    expect(html).not.toMatch(/<li[^>]*>：/);
  });

  it("the recipient cards: head office's name slot says 「总部（系统内）」, once", async () => {
    const { ExchangePanel } = await import("@/components/contractor-ops/package-exchange");
    const recipient = (over: Record<string, unknown>) => ({
      id: "r",
      kind: "QS",
      consultant: null,
      reviewer: null,
      display_name: "",
      name: "",
      organization: "",
      contact: "",
      status: "SENT",
      is_expired: false,
      is_live: true,
      token_hint: "",
      expires_at: null,
      revoked_at: null,
      open_count: 0,
      first_opened_at: null,
      last_opened_at: null,
      seen_round: 0,
      signed_name: "",
      signed_at: null,
      accepted_count: 0,
      returned_count: 0,
      pending_count: 3,
      created_at: "2026-11-28T11:36:00Z",
      created_by_name: "示范 项目经理",
      purpose: "APPROVAL",
      progress: "SENT",
      ...over,
    });
    const html = render(
      <ExchangePanel
        onChanged={() => {}}
        data={
          {
            id: "pkg-3",
            package_no: "PKG-PRJ-0001-003",
            name: "subcon claim",
            items: [],
            recipients: [
              recipient({ id: "r-qs", kind: "QS", display_name: "示范 QS（美美）", reviewer: "u-qs" }),
              recipient({ id: "r-hq", kind: "HEADQUARTERS" }),
            ],
          } as never
        }
      />,
    );
    const cards = html.split('class="space-y-2 rounded-lg border p-3"').slice(1);
    expect(cards).toHaveLength(2);
    const nameSlot = (card: string) => card.split('truncate font-medium">')[1]?.split("</p>")[0] ?? "";
    expect(nameSlot(cards[0])).toContain("示范 QS（美美）");
    expect(cards[0]).toContain(words.kind.QS);
    expect(nameSlot(cards[1])).toContain(words.kind.HEADQUARTERS);
    // Not twice: no extra kind badge beside a name that already is the kind.
    expect(cards[1].split(words.kind.HEADQUARTERS)).toHaveLength(2);
  });

  it("the signatures: 「接收方」 only when it is somebody else, head office by its kind", async () => {
    const { SignaturesBlock } = await import("@/components/contractor-ops/package-review-loop");
    const signature = (over: Record<string, unknown>) => ({
      id: "s",
      round_no: 1,
      side: "REVIEWER",
      action: "APPROVED",
      recipient: null,
      recipient_name: "",
      recipient_kind: "",
      signer_name: "",
      signed_at: "2026-11-28T11:41:00Z",
      opinion: "",
      decisions: [],
      claim_amount: null,
      approved_amount: null,
      amount_reason: "",
      round_sha256: "",
      signature_url: null,
      ...over,
    });
    const html = render(
      <SignaturesBlock
        signatures={
          [
            signature({ id: "s-qs", recipient: "r-qs", recipient_name: "示范 QS（美美）", recipient_kind: "QS", signer_name: "示范 QS（美美）" }),
            signature({ id: "s-hq", recipient: "r-hq", recipient_name: "", recipient_kind: "HEADQUARTERS", signer_name: "示范 总部" }),
          ] as never
        }
      />,
    );
    const forWhom = zh.jb252.signatures.for;
    expect(html).toContain(forWhom.replace("{name}", words.kind.HEADQUARTERS));
    expect(html).not.toContain(forWhom.replace("{name}", "示范 QS（美美）"));
  });
});
