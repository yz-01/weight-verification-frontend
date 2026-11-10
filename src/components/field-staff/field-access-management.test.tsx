/**
 * 生成现场人员链接: one project per phone account (JB148, 客户 11-10 事项 5).
 *
 * 「普通工地员工同一时间只能绑定一个项目，不允许同时挂在两个项目。」 The dialog offers
 * one project, not a list of ticks; a person still on two open projects (from
 * before) is told so and starts with none chosen. Rendered to static markup
 * (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import zh from "@/messages/zh.json";

vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), list: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "hq", portal: "MSE_TRACE" }, can: () => true }),
}));
vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (_key: string, initial?: unknown) => [initial, () => {}],
}));

const { FieldAccessManagementDialog } = await import("@/components/field-staff/field-access-management");

function site(id: string, code: string, name: string, status = "ACTIVE") {
  return { id, code, name, status };
}

const A = site("p-a", "PRJ-0001", "project 1A");
const B = site("p-b", "PRJ-0002", "Project 2B");
const OLD = site("p-old", "PRJ-0003", "old site", "ARCHIVED");
const PERSON = { id: "u1", full_name: "阿明", phone: "+60129990001" };

function render(projectsOfPerson: { id: string; code: string; name: string }[] | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["projects", "field-access-options"], { results: [A, B, OLD], count: 3 });
  client.setQueryData(["field-access", "roles"], []);
  client.setQueryData(["field-access", "staff", "options"], { results: [], count: 0 });
  if (projectsOfPerson) {
    client.setQueryData(["field-access", "info", PERSON.id], {
      user_id: PERSON.id,
      full_name: PERSON.full_name,
      phone: PERSON.phone,
      projects: projectsOfPerson,
    });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {/* The submit button says why it is grey (JB148: no project chosen yet). */}
        <TooltipProvider>
          <FieldAccessManagementDialog
            onClose={() => {}}
            initialUser={projectsOfPerson ? PERSON : undefined}
          />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The project rows the dialog draws, as [project id, checked]. */
function choices(html: string): [string, boolean][] {
  return [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((match) => [
    /value="([^"]+)"/.exec(match[0])?.[1] ?? "",
    /\schecked=""/.test(match[0]),
  ]);
}

describe("生成现场人员链接 picks one project", () => {
  it("offers one project, not a list of ticks", () => {
    const html = render(null);
    expect(html).toContain('role="radiogroup"');
    expect(choices(html)).toEqual([[A.id, false], [B.id, false], [OLD.id, false]]);
    expect(html).not.toContain('role="checkbox"');
    expect(html).toContain(zh.fieldAccessAdmin.oneProjectHint);
  });

  it("a person on one project starts on it", () => {
    const html = render([A]);
    expect(choices(html)).toEqual([[A.id, true], [B.id, false], [OLD.id, false]]);
    expect(html).not.toContain('data-testid="field-access-on-several"');
  });

  it("a closed project beside the open one does not count", () => {
    const html = render([OLD, B]);
    expect(choices(html)).toEqual([[A.id, false], [B.id, true], [OLD.id, false]]);
    expect(html).not.toContain('data-testid="field-access-on-several"');
  });

  it("a person still on two open projects is told so, and chooses one", () => {
    const html = render([A, B]);
    expect(html).toContain("同时在 2 个项目，请只选一个");
    expect(choices(html)).toEqual([[A.id, false], [B.id, false], [OLD.id, false]]);
  });
});

describe("the refusals read in the reader's language", () => {
  it("names the other project only when the server does", async () => {
    const { createTranslator } = await import("next-intl");
    // As the service layer's translator does it (lib/i18n-runtime).
    const t = createTranslator({ locale: "zh", messages: zh as never }) as unknown as (
      key: string,
      values?: Record<string, string>,
    ) => string;
    expect(t("errors.api.field_one_project", { name: "阿明", project: "none" })).toBe(
      "阿明 现在在另一个项目。手机账号同一时间只能在一个项目：请原项目先「移出项目」或「删除」，再在这里绑定。",
    );
    expect(t("errors.api.field_one_project", { name: "阿明", project: "PRJ-0002 Project 2B" })).toBe(
      "阿明 现在在另一个项目（PRJ-0002 Project 2B）。手机账号同一时间只能在一个项目：请原项目先「移出项目」或「删除」，再在这里绑定。",
    );
    // 移出 frees the number as well as 删除 does (JB148).
    expect(zh.errors.field.phone_in_use).toContain("移出项目");
    expect(zh.errors.field.phone_in_use).toContain("删除");
  });
});
