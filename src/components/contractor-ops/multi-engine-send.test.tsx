/**
 * 「发送」 on a confirmed package (fix/mepick, 2026-10; batch H, H17 八 2).
 *
 * The owner: 「这个multi engine这里为什么是填顾问ID，应该是可以选顾问才对啊」.
 * A consultant is still picked from the consultants this package can actually
 * go to - now inside the send dialog, beside the owner / supplier / other
 * links, which carry the warning 「拿到链接的人都能打开，请只发给对方本人。」.
 * The PDF's SHA-256 is no longer printed bare under the package - it waits
 * behind 「技术资料」.
 *
 * The runner has no DOM, so the sheet is rendered to static markup with its
 * queries answered from the cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EvidencePackageDetail } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import type { PackageConsultantChoice } from "@/services/contractor-ops.service";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { PackageSheet } = await import("@/components/contractor-ops/multi-engine");
const { SendDialog } = await import("@/components/contractor-ops/package-exchange");

const HASH = "9f2c4e7a1b3d5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";

const confirmed: EvidencePackageDetail = {
  id: "pk1",
  name: "Progress claim March",
  remarks: "For the March claim.",
  state: "CONFIRMED",
  project: "p1",
  project_name: "Tower",
  created_at: "2026-10-01T02:00:00Z",
  created_by_name: "Ong",
  confirmed_at: "2026-10-02T02:00:00Z",
  pdf_sha256: HASH,
  pdf_bytes: 1024,
  merge_report: [],
  review_state: "NOT_SENT",
  sent_at: null,
  sent_to: null,
  sent_to_name: "",
  exported_at: null,
  item_count: 0,
  returned_count: 0,
  can_delete: false,
  can_return: true,
  items: [],
  recipients: [],
  rounds: [],
  returned_item_ids: [],
  can_resubmit: false,
};

function render(choices: PackageConsultantChoice[], what: "sheet" | "CONSULTANT" | "OWNER" = "sheet") {
  const client = new QueryClient();
  client.setQueryData(["evidence-packages", "detail", "pk1"], confirmed);
  client.setQueryData(["evidence-packages", "consultant-choices", "pk1"], choices);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          {what === "sheet" ? (
            <PackageSheet id="pk1" onClose={() => undefined} />
          ) : (
            <SendDialog pkg={confirmed} initialKind={what} onClose={() => undefined} onSent={() => undefined} />
          )}
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const words = zh.multiEngine;

describe("sending a confirmed package to a consultant", () => {
  it("has a send button and the four blocks on a confirmed package", () => {
    const html = render([]);
    expect(html).toContain(words.exchange.send);
    for (const tab of ["recipients", "chat", "timeline", "rounds"] as const) {
      expect(html).toContain(words.exchange.tab[tab]);
    }
    expect(html).toContain(words.exchange.noRecipients);
  });

  it("offers a consultant picker, not a box for an account id", () => {
    const html = render(
      [{ consultant: "c1", name: "Tan Engineer", organization: "Reviewing Engineers", email: "tan@x.test" }],
      "CONSULTANT",
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain(words.field.consultantPlaceholder);
    expect(html).not.toContain(words.noConsultants);
  });

  it("says plainly when nobody is linked to the project yet", () => {
    const html = render([], "CONSULTANT");
    expect(html).toContain(words.noConsultants);
  });

  it("warns that anyone holding a link can open it (H17 六 6)", () => {
    const html = render([], "OWNER");
    expect(html).toContain(words.exchange.warning);
    expect(html).toContain(words.exchange.field.who);
    expect(html).not.toContain('role="combobox"');
  });

  it("keeps the hash behind 「技术资料」 under a plain-words badge", () => {
    const html = render([]);
    expect(html).toContain(words.locked);
    const details = html.slice(html.indexOf("<details"));
    expect(html.indexOf("<details")).toBeGreaterThan(-1);
    expect(details).toContain(words.technicalDetails);
    // Every place the hash is printed as text is inside the disclosure.
    const before = html.slice(0, html.indexOf("<details"));
    expect(before.replace(`title="${HASH}"`, "")).not.toContain(HASH);
    expect(details).toContain(HASH);
  });

  it("never asks for an id in any language", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const placeholder = messages.multiEngine.field.consultantPlaceholder.toLowerCase();
      expect(placeholder).not.toMatch(/\bid\b/);
    }
  });
});
