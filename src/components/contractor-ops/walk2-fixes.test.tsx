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
