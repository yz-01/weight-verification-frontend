/**
 * JB49-JB52 (客户 10-28 事项 3, 4, 5, 13), on the screens themselves rendered to
 * static markup (the runner has no DOM):
 *
 * - JB49: every record card in a package says its number and has 「打开完整记录」;
 * - JB51: the package's own 「发送」 is 「对外分享（WhatsApp / 电邮）」, the
 *   in-system one 「系统内发送」; 「发送记录」 lists both, newest first, with
 *   「未指定」 and 「标记为已发送」; the list says 未发送 / 已发送系统内 /
 *   已发起分享 / 已对外发送;
 * - JB52: the Progress Claim tab is the package list filtered - 期数 / 分类 /
 *   分包商 and 「新增 Claim 分类」, no 「新建 Claim」 / 「开一期」 / 「填写金额」;
 *   a Progress Claim package shows its period, kind, category and an old
 *   claim's number, never an amount.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentProjectState } from "@/components/providers/current-project-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EvidencePackageDetail, EvidencePackageRow } from "@/interfaces/contractor-ops";
import { recordAttachmentsKey } from "@/components/shared/record-attachments";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
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

const { MultiEngineWorkspace, PackageSheet } = await import("@/components/contractor-ops/multi-engine");
const { CurrentProjectValueProvider } = await import("@/components/providers/current-project-provider");
const { sendStatusKeys } = await import("@/components/contractor-ops/package-claim-parts");

const TOP_BAR: CurrentProjectState = {
  active: true,
  projectId: "p1",
  projects: [],
  canChooseAll: false,
  loading: false,
  setProjectId: () => {},
};

function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <CurrentProjectValueProvider value={TOP_BAR}>{node}</CurrentProjectValueProvider>
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { html, keys: client.getQueryCache().getAll().map((query) => query.queryKey) };
}

const emptySlot = (kind: string) => ({
  kind,
  record: "pk1",
  closed: "confirmed",
  can_add: false,
  max_files: 10,
  max_bytes: 1,
  attachments: [],
});

const base = {
  id: "pk1",
  package_no: "PKG-T-015",
  name: "Progress Claim 15",
  remarks: "October",
  state: "CONFIRMED",
  package_type: "PROGRESS_CLAIM",
  project: "p1",
  project_name: "Tower",
  created_at: "2026-10-01T02:00:00Z",
  created_by_name: "Ong",
  confirmed_at: "2026-10-02T02:00:00Z",
  confirmed_by_name: "Ong",
  pdf_sha256: "abc",
  pdf_bytes: 10,
  merge_report: [],
  review_state: "NOT_SENT",
  sent_at: null,
  sent_to: null,
  sent_to_name: "",
  exported_at: null,
  item_count: 1,
  returned_count: 0,
  can_delete: false,
  can_return: false,
  current_round: 1,
  recipient_count: 1,
  claim_info: {
    claim_id: "c1",
    claim_no: "CLM-T-2603-01",
    period: "2026-03-01",
    kind: "MATERIAL_ON_SITE",
    category: "cat1",
    category_name: "Manpower Claim",
    subcontractor: null,
    subcontractor_name: null,
  },
  send_status: { internal: true, external: "STARTED" },
  claim: { type: "PROGRESS_CLAIM", claim: { id: "c1", amount: "1000.00", payment_state: "NOT_RECEIVED" } },
  items: [
    {
      id: "i1",
      record_kind: "PROGRESS",
      record_id: "r1",
      position: 0,
      round_no: 1,
      replaced_in_round: null,
      selection: {},
      review_state: "PENDING",
      returned_reason: "",
      returned_at: null,
      reference: "PG-builder-001-013",
      fields: [],
      photos: [],
      documents: [],
      files: [],
      is_snapshot: true,
      answers: [],
    },
  ],
  recipients: [
    {
      id: "r1",
      kind: "HEADQUARTERS",
      consultant: null,
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
      pending_count: 1,
      created_at: "2026-10-03T02:00:00Z",
      created_by_name: "Ong",
    },
  ],
  shares: [
    {
      id: "s1",
      channel: "WHATSAPP",
      target: "",
      status: "STARTED",
      created_at: "2026-10-04T02:00:00Z",
      created_by_name: "Tan",
      confirmed_at: null,
      confirmed_by_name: "",
    },
  ],
  rounds: [],
  returned_item_ids: [],
  can_resubmit: false,
} as unknown as EvidencePackageDetail;

function sheet(data: EvidencePackageDetail = base) {
  return render(<PackageSheet id="pk1" onClose={() => undefined} />, (client) => {
    client.setQueryData(["evidence-packages", "detail", "pk1"], data);
    for (const kind of ["EVIDENCE_PACKAGE", "PACKAGE_LETTER"] as const) {
      client.setQueryData(recordAttachmentsKey(kind, "pk1"), emptySlot(kind));
    }
  }).html;
}

beforeEach(() => {
  nav.search = "";
});

describe("JB49: a record in a package opens in full", () => {
  it("names the record by its number and offers 「打开完整记录」", () => {
    const html = sheet();
    expect(html).toContain("PG-builder-001-013");
    expect(html).toContain("data-package-item");
    expect(html).toContain(zh.multiEngine.openRecord);
    expect(html).not.toContain("未填");
  });
});

describe("JB51: two ways out, and what happened", () => {
  it("draws 「对外分享」 instead of the bare 「发送」, and 「系统内发送」 apart", () => {
    const html = sheet();
    expect(html).toContain(zh.multiEngine.share.button);
    expect(html).toContain("data-package-share-button");
    expect(html).not.toContain('data-slot="file-action-share"');
    expect(html).toContain('data-slot="file-action-save"');
    expect(html).toContain(zh.multiEngine.exchange.send);
    expect(zh.multiEngine.share.button).toBe("对外分享（WhatsApp / 电邮）");
    expect(zh.multiEngine.exchange.send).toContain("系统内发送");
  });

  it("lists both sends in 「发送记录」, newest first, with 未指定 and 标记为已发送", () => {
    const html = sheet();
    expect(html).toContain("data-send-log");
    const log = html.slice(html.indexOf("data-send-log"));
    expect(log.indexOf(zh.multiEngine.sendLog.external)).toBeLessThan(log.indexOf(zh.multiEngine.sendLog.internal));
    expect(log).toContain(zh.multiEngine.sendLog.unspecified);
    expect(log).toContain(zh.multiEngine.share.markSent);
    expect(log).toContain("data-mark-sent");
    expect(log).toContain(zh.multiEngine.sendLog.notOpened);
    expect(log).toContain(zh.multiEngine.sendLog.STARTED);
  });

  it("a confirmed share says who marked it and offers no second press", () => {
    const html = sheet({
      ...base,
      shares: [{ ...base.shares![0], status: "CONFIRMED", confirmed_at: "2026-10-05T02:00:00Z", confirmed_by_name: "Lim" }],
    });
    const log = html.slice(html.indexOf("data-send-log"));
    expect(log).toContain(zh.multiEngine.sendLog.CONFIRMED);
    expect(log).toContain("Lim");
    expect(log).not.toContain("data-mark-sent");
  });

  it("says 未发送 / 已发送系统内 / 已发起分享 / 已对外发送, never 已确认 for sent", () => {
    const row = (send_status: EvidencePackageRow["send_status"]) =>
      ({ send_status, recipient_count: 0 }) as EvidencePackageRow;
    expect(sendStatusKeys(row({ internal: false, external: "NONE" }))).toEqual(["NOT_SENT"]);
    expect(sendStatusKeys(row({ internal: true, external: "NONE" }))).toEqual(["INTERNAL"]);
    expect(sendStatusKeys(row({ internal: false, external: "STARTED" }))).toEqual(["STARTED"]);
    expect(sendStatusKeys(row({ internal: true, external: "SENT" }))).toEqual(["INTERNAL", "SENT"]);
    for (const messages of [zh, zhTW, en, ms]) {
      for (const key of ["NOT_SENT", "INTERNAL", "STARTED", "SENT"] as const) {
        expect(messages.multiEngine.sendStatus[key]).toBeTruthy();
      }
    }
    expect(zh.multiEngine.sendStatus.STARTED).toBe("已发起分享");
    expect(zh.multiEngine.sendStatus.SENT).toBe("已对外发送");
  });
});

describe("JB52: Progress Claim is a package type", () => {
  it("shows the period, kind, category and the old claim's number - no amount, no 收款", () => {
    const html = sheet();
    expect(html).toContain(zh.multiEngine.claimInfo.title);
    expect(html).toContain("CLM-T-2603-01");
    expect(html).toContain("2026-03");
    expect(html).toContain("Manpower Claim");
    expect(html).toContain(zh.claims.kind.MATERIAL_ON_SITE);
    expect(html).not.toContain(zh.multiEngine.claimFacet.setAmount);
    expect(html).not.toContain(zh.multiEngine.claimFacet.title);
  });

  it("the Progress Claim tab is the package list with its filters and 「新增 Claim 分类」", () => {
    nav.search = "type=PROGRESS_CLAIM";
    const { html, keys } = render(<MultiEngineWorkspace />);
    expect(html).toContain("data-claim-tab-filters");
    expect(html).toContain(zh.multiEngine.claimCategories.button);
    expect(html).toContain(zh.multiEngine.new);
    // None of the retired claim screen's buttons.
    expect(html).not.toContain(zh.claims.openPeriod);
    expect(html).not.toContain(zh.multiEngine.claimFacet.setAmount);
    const listKey = keys.find((key) => key[0] === "evidence-packages");
    expect(listKey?.[4]).toBe("PROGRESS_CLAIM");
    expect(keys.some((key) => key[0] === "claims")).toBe(false);
  });

  it("other tabs have neither the claim filters nor the categories button", () => {
    const { html } = render(<MultiEngineWorkspace />);
    expect(html).not.toContain("data-claim-tab-filters");
    expect(html).not.toContain(zh.multiEngine.claimCategories.button);
  });
});
