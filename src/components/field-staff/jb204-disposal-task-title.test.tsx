/**
 * JB204-6 (Lucas 11-16 audit): a disposal execution task's title on My Tasks.
 *
 * The server files it in English - 「Execute site disposal DR-…」 - and the
 * phone showed it as it was. The phone words it from the catalogue now, with
 * the request's number; every other task keeps the title the office gave it.
 * Rendered to static markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { MyTaskRow } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/hooks/use-phone-offline", () => ({ usePhoneOffline: () => false }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-phone", is_field_staff: true, active_project: null }, can: () => true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams(),
}));

const { MyTasksPanel, disposalTaskReference } = await import("@/components/field-staff/my-tasks-panel");

function row(overrides: Partial<MyTaskRow>): MyTaskRow {
  return {
    kind: "FIELD_TASK",
    id: "t-1",
    no: "",
    title: "Clean the loading bay",
    project: "p-1",
    project_name: "Site A",
    due_at: null,
    status: "OPEN",
    stage: "PENDING",
    needs_more_work: false,
    note: "",
    task_type: null,
    assigned_by_name: "Office",
    last_message: null,
    created_at: "2026-11-16T01:00:00Z",
    linked_record_type: "",
    linked_record_reference: "",
    ...overrides,
  };
}

function list(rows: MyTaskRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["my-tasks"], { results: rows, count: rows.length });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <MyTasksPanel onOpenHazard={() => {}} workflow={{ has: () => false, open: () => {} }} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a disposal execution task on My Tasks", () => {
  it("is named in the worker's words with the request's number", () => {
    const html = list([
      row({
        title: "Execute site disposal DR-SITE-007",
        linked_record_type: "DISPOSAL_EXECUTION",
        linked_record_reference: "DR-SITE-007",
      }),
    ]);

    expect(html).toContain("执行清运 DR-SITE-007");
    expect(html).not.toContain("Execute site disposal");
  });

  it("leaves every other task's title as the office gave it", () => {
    const html = list([row({ title: "清理卸货区" }), row({ id: "t-2", title: "Move the fence", linked_record_type: "MATERIAL_RECEIPT", linked_record_reference: "MR-1" })]);

    expect(html).toContain("清理卸货区");
    expect(html).toContain("Move the fence");
    expect(html).not.toContain("执行清运");
  });

  it("names it only for a disposal execution with a number", () => {
    expect(disposalTaskReference({ linked_record_type: "DISPOSAL_EXECUTION", linked_record_reference: "DR-1" })).toBe("DR-1");
    expect(disposalTaskReference({ linked_record_type: "DISPOSAL_EXECUTION", linked_record_reference: "" })).toBeNull();
    expect(disposalTaskReference({ linked_record_type: "MATERIAL_RECEIPT", linked_record_reference: "MR-1" })).toBeNull();
    expect(disposalTaskReference({})).toBeNull();
  });

  it("is named the same way when the task is opened", () => {
    const panel = readFileSync(path.join(process.cwd(), "src/components/field-staff/my-tasks-panel.tsx"), "utf8");
    const work = panel.slice(panel.indexOf("function FieldTaskWork("));
    expect(work).toContain("const disposal = disposalTaskReference(row);");
    expect(work).toContain('{disposal ? t("disposalTitle", { reference: disposal }) : row.title}');
  });

  it("has its words in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.taskFlow.work.disposalTitle).toContain("{reference}");
    }
    expect(en.taskFlow.work.disposalTitle).not.toContain("Execute site disposal");
  });
});
