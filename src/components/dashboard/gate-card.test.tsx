/**
 * HD10 (事项13): the dashboards' 门岗 card - today's gate photos, the gate
 * issues still open, and today's photos to look at, each opening its record
 * in EHS › 门岗记录. Rendered to static markup (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { GateSummary } from "@/interfaces/site-access";
import messages from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: () => auth.allowed }),
}));

const { GateCard } = await import("@/components/dashboard/gate-card");

const summary: GateSummary = {
  today_photos: 7,
  open_issues: 2,
  thumbs: [
    {
      id: "ph1",
      incident: "g1",
      incident_no: "MSE-P1-GATE-0001",
      is_issue: true,
      project: "p1",
      project_name: "Tower A",
      guard_name: "Ah Seng",
      captured_at: "2026-10-13T01:00:00Z",
      watermarked_image: "https://cdn.example/gate-stamped.jpg",
    },
  ],
};

function render(project = "") {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["gate-summary", project], summary);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <GateCard project={project} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the dashboards' gate card (HD10)", () => {
  it("shows today's photos, the open issues and the stamped thumbnails", () => {
    auth.allowed = true;
    const html = render("p1");
    expect(html).toContain("data-gate-card");
    expect(html).toContain(">7<");
    expect(html).toContain(">2<");
    expect(html).toContain("https://cdn.example/gate-stamped.jpg");
  });

  it("opens each thumbnail's record and each figure's list in 门岗记录", () => {
    auth.allowed = true;
    const html = render("p1");
    expect(html).toContain("/gate-records?tab=issues&amp;gate_incident=g1&amp;project=p1");
    expect(html).toContain("/gate-records?tab=issues&amp;issue_status=OPEN&amp;project=p1");
    expect(html).toMatch(/\/gate-records\?tab=photos&amp;date_from=\d{4}-\d{2}-\d{2}&amp;date_to=/);
  });

  it("is not there for someone who may not see site access", () => {
    auth.allowed = false;
    expect(render()).toBe("");
  });
});
