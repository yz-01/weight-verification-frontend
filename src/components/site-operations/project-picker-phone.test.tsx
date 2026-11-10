/**
 * The phone's project box (JB148, 客户 11-10 事项 5). Lucas 11-10: 「用别的手机端，
 * 连接过两个项目，两个项目都能发送」 - 新增进度证据 offered a dropdown of two
 * projects. A phone account is on one project; the server says which
 * (`active_project`), and the box is that project as text even when the
 * project list still holds another (a closed one the person was on).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: () => true }),
}));

const { ProjectPicker } = await import("@/components/site-operations/project-picker");

const NORTH = { id: "p-north", code: "PRJ-0002", name: "North Tower", status: "ACTIVE" };
const OLD = { id: "p-old", code: "PRJ-0003", name: "Old Site", status: "ARCHIVED" };

function render(activeProject: { project_id: string; project_name: string } | null) {
  auth.user = { id: "u-phone", is_field_staff: true, active_project: activeProject };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["projects", "options"], { count: 2, page: 1, page_size: 100, total_pages: 1, results: [OLD, NORTH] });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <ProjectPicker value="" onValueChange={() => {}} placeholder={messages.contractorOps.field.selectProject} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a phone account's project box", () => {
  it("is the one project it is on, as text, never a dropdown", () => {
    const html = render({ project_id: NORTH.id, project_name: NORTH.name });
    expect(html).toContain("North Tower");
    expect(html).not.toContain("data-project-picker");
    expect(html).not.toContain("Old Site");
  });
});
