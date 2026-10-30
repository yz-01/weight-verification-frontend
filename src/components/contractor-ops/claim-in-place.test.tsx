/**
 * Lucas 10-30: 分类管理 → 查看记录 opens a Progress Claim's own window over the
 * page, not a jump to Multi Engine. `ClaimInPlace` is the claim screen's own
 * window: its files, its conversation, its buttons, and a close.
 *
 * The runner has no DOM, so it is rendered to static markup with its queries
 * answered from the cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ClaimDetail } from "@/interfaces/contractor-ops";
import type { RecordAttachments } from "@/interfaces/record-attachment";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { ClaimInPlace } = await import("@/components/contractor-ops/claim-engine");
const { recordAttachmentsKey } = await import("@/components/shared/record-attachments");

function slot(kind: string): RecordAttachments {
  return {
    kind,
    record: "c1",
    closed: "",
    can_add: true,
    max_files: 10,
    max_bytes: 50 * 1024 * 1024,
    attachments: [],
  } as unknown as RecordAttachments;
}

const claim = {
  id: "c1",
  claim_no: "CLM-2026-0007",
  project: "p1",
  project_name: "Tower",
  kind: "GENERAL",
  description: "Manpower October",
  category_name: "Manpower",
  subcontractor_name: null,
  period: "2026-10-01",
  state: "DRAFT",
  payment_state: "UNPAID",
  amount: null,
  remarks: "",
  package: null,
  items: [],
  payment_proofs: [],
} as unknown as ClaimDetail;

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["claims", "c1"], claim);
  client.setQueryData(recordAttachmentsKey("CLAIM", "c1"), slot("CLAIM"));
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <ClaimInPlace id="c1" onClose={() => undefined} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a Progress Claim opened in place", () => {
  it("is the claim's own window, drawn as a dialog over the page", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain("CLM-2026-0007");
    expect(html).toContain("Manpower October");
    // Its files and its conversation, as on the claim screen.
    expect(html).toContain('data-kind="CLAIM"');
    expect(html).toContain(zh.claims.conversation);
    // Its own buttons, and a close; nothing that leaves the page.
    expect(html).toContain(zh.claims.editDetails);
    expect(html).toContain(zh.common.close);
    expect(html).not.toContain("href=");
  });
});
