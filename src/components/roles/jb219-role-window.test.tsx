/**
 * JB218 / JB219 (客户 11-18 事项 3、4): the 新增 / 编辑角色 window and the role list.
 *
 * 事项 3: 「目前在总部创建 Office Admin 角色时，A组权限全部被锁定，无法勾选，B组权限
 * 却全部自动勾选……总部角色的A组及B组权限，应该允许公司管理员自行勾选或取消」.
 * 事项 4: 「保留公司管理员的完整权限。取消目前系统预设的其他角色名称，由建筑公司自行
 * 创建及命名……这样也能让整个角色管理页面更加简洁」.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PermissionEntry, Role } from "@/interfaces/auth";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ portal: "MSE_TRACE" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/roles/create",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/dialog-navigation", async (original) => ({
  ...(await original<typeof import("@/components/shared/dialog-navigation")>()),
  useFinishForm: () => vi.fn(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({ user: { id: "admin", company: "c1", portal: auth.portal }, can: () => true }),
}));
vi.mock("@/hooks/use-list-query", () => ({
  useListQuery: () => ({
    query: { page: 1 },
    page: 1,
    pageSize: 25,
    search: "",
    sortBy: "",
    sortOrder: "asc",
    hasFilters: false,
    setSearch: vi.fn(),
    setSort: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    clearFilters: vi.fn(),
  }),
}));
vi.mock("@/components/shared/data-table", () => ({
  SortableHeader: ({ label }: { label: string }) => <span>{label}</span>,
  DataTable: ({ columns, rows }: { columns: Array<Record<string, unknown>>; rows: unknown[] }) => (
    <div data-mock-table>
      <div data-mock-head>
        <div>
          {columns.map((column, index) => (
            <span key={index}>
              {typeof column.header === "function"
                ? (column.header as (context: unknown) => ReactNode)({
                    column: { getIsSorted: () => false, toggleSorting: () => {} },
                  })
                : null}
            </span>
          ))}
        </div>
      </div>
      <div data-mock-body>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} data-mock-row>
            {columns.map((column, index) => (
              <span key={index}>
                {(column.cell as (context: unknown) => ReactNode)({ row: { original: row } })}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  ),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

import { TooltipProvider } from "@/components/ui/tooltip";

const { CreateRole, holdersNotice } = await import("@/components/roles/create-role");
const { Roles } = await import("@/components/roles/roles");
const { rolePermissionSummary, roleTypeLabel } = await import("@/components/roles/role-summary");

const entry = (group: string, code: string, page: PermissionEntry["page"]): PermissionEntry => ({
  group,
  code,
  page,
  audiences: ["CONTRACTOR"],
});

const CATALOGUE: PermissionEntry[] = [
  entry("user", "user.view", "hq_reserved"),
  entry("disposal", "disposal.view", "hq_grantable"),
  entry("receipt", "receipt.view", "project"),
  entry("receipt", "receipt.create", "project"),
];

const role = (over: Partial<Role>): Role => ({
  id: "r1",
  company: "c1",
  code: "ROLE-0001",
  name: "office admin",
  description: "",
  permissions: [],
  kind: "project",
  head_office: false,
  hq_permission_count: 0,
  is_system: false,
  user_count: 0,
  created_at: "2026-11-18T00:00:00Z",
  updated_at: "2026-11-18T00:00:00Z",
  ...over,
});

function render(node: ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["permissions", "catalogue"], CATALOGUE);
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("新增角色 asks which kind of role it is (JB218-1/3)", () => {
  it("offers 总部角色 and 项目角色, chooses neither, and shows no boxes until one is chosen", () => {
    auth.portal = "MSE_TRACE";
    const html = render(<CreateRole />);
    expect(html).toContain(zh.roles.kind.label);
    expect(html).toContain(zh.roles.kind.headOffice);
    expect(html).toContain(zh.roles.kind.project);
    expect(html).toContain(zh.roles.kind.headOfficeHelp);
    expect(html.match(/role="radio" aria-checked="false"/g)).toHaveLength(2);
    expect(html).toContain("data-role-kind-first");
    expect(html).not.toContain('role="checkbox"');
    // 「这是项目角色」 no longer shows on a role nobody has given a type.
    expect(html).not.toContain("这是项目角色");
  });

  it("opens a 总部角色 with A and B both tickable (the client's office admin)", () => {
    auth.portal = "MSE_TRACE";
    const html = render(<CreateRole role={role({ kind: "head_office", head_office: true })} />);
    expect(html).toMatch(/aria-checked="true"[^>]*data-role-kind-option="head_office"/);
    expect(html).toContain(zh.roles.pages.hqHelp);
    expect(html.match(/role="checkbox"/g)).toHaveLength(2);
    expect(html).not.toMatch(/role="checkbox"[^>]*disabled=""/);
  });

  it("keeps a 项目角色 exactly as before: A locked, B to tick", () => {
    auth.portal = "MSE_TRACE";
    const html = render(<CreateRole role={role({ kind: "project" })} />);
    expect(html).toMatch(/aria-checked="true"[^>]*data-role-kind-option="project"/);
    expect(html).toContain("A 组是总部专属，不能勾选");
    expect(html.match(/role="checkbox"[^>]*disabled=""/g)).toHaveLength(1);
  });

  it("shows 公司管理员 with every permission and nothing to change (事项 4 第 1 点)", () => {
    auth.portal = "MSE_TRACE";
    const html = render(
      <CreateRole
        role={role({
          code: "company_admin",
          name: "Company Administrator",
          kind: "head_office",
          head_office: true,
          is_system: true,
          permissions: CATALOGUE.map((row) => row.code),
        })}
      />,
    );
    expect(html).toContain(zh.roles.kind.adminFixed);
    expect(html).toContain(zh.roles.adminLocked);
    expect(html).not.toContain('role="radio"');
    expect(html).not.toContain('role="checkbox"');
  });

  it("leaves a recycler's role editor without types, every box tickable (JB219 sibling)", () => {
    auth.portal = "MSE_SCRAP";
    const html = render(<CreateRole />);
    expect(html).not.toContain(zh.roles.kind.label);
    expect(html).not.toContain('role="tablist"');
    expect(html.match(/role="checkbox"/g)).toHaveLength(4);
    expect(html).not.toMatch(/role="checkbox"[^>]*disabled=""/);
    auth.portal = "MSE_TRACE";
  });
});

describe("the people already in a role (lead 11-18)", () => {
  const pageOf = (code: string) => CATALOGUE.find((row) => row.code === code)?.page;

  it("says the changed ticks reach them", () => {
    expect(
      holdersNotice({ holders: 3, typeChanged: false, before: ["user.view"], after: [], pageOf }),
    ).toBe("ticks");
    expect(zh.roles.followers).toContain("同步给他们");
    // Audit F5: 「项目」 on this page means a building project - 「其他权限不变」.
    expect(zh.roles.followers).toContain("其他权限不变");
  });

  it("says nothing when only project codes, the name or nobody is involved", () => {
    expect(
      holdersNotice({ holders: 3, typeChanged: false, before: ["user.view"], after: ["user.view", "receipt.view"], pageOf }),
    ).toBeNull();
    expect(holdersNotice({ holders: 0, typeChanged: false, before: ["user.view"], after: [], pageOf })).toBeNull();
  });

  it("says a new type re-sets them", () => {
    expect(holdersNotice({ holders: 2, typeChanged: true, before: [], after: [], pageOf })).toBe("type");
  });
});

describe("the role list is simpler (JB219-7)", () => {
  const rows = [
    role({
      id: "a",
      code: "company_admin",
      name: "Company Administrator",
      kind: "head_office",
      head_office: true,
      is_system: true,
      hq_permission_count: 46,
      user_count: 2,
    }),
  ];
  const seed = (results: Role[]) => (client: QueryClient) =>
    client.setQueryData(["roles", { page: 1, kind: "office" }], { results, count: results.length });

  it("has no 从预设新增 and no raw code for a builder, says what to do next with 公司管理员 alone", () => {
    auth.portal = "MSE_TRACE";
    const html = render(<Roles />, seed(rows));
    expect(html).not.toContain(zh.roles.preset.open);
    expect(html).not.toContain("company_admin");
    expect(html).not.toContain(zh.roles.field.code);
    expect(html).toContain(zh.roles.field.kind);
    expect(html).toContain(zh.roles.kind.headOffice);
    expect(html).toContain(zh.roles.allPermissions);
    expect(html).toContain(zh.roles.phoneHere);
    expect(html).toContain("data-roles-only-admin");
    expect(html).toContain(zh.roles.new);
  });

  it("drops the 公司管理员-only line once the company has a role of its own", () => {
    auth.portal = "MSE_TRACE";
    const own = role({ id: "b", name: "office admin", kind: "head_office", head_office: true, hq_permission_count: 3 });
    const html = render(<Roles />, seed([...rows, own]));
    expect(html).not.toContain("data-roles-only-admin");
    expect(html).toContain("office admin");
    expect(html).toContain("总部权限 3 项");
  });

  it("keeps a recycler's page as it was: 从预设新增 and the code", () => {
    auth.portal = "MSE_SCRAP";
    const dispatcher = role({ id: "d", code: "dispatcher", name: "Dispatcher", kind: "plain", permissions: ["x"] });
    const html = render(<Roles />, seed([dispatcher]));
    expect(html).toContain(zh.roles.preset.open);
    expect(html).toContain("dispatcher");
    expect(html).not.toContain(zh.roles.phoneHere);
    auth.portal = "MSE_TRACE";
  });
});

describe("what the list and card say about a role", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    `${key}${values ? JSON.stringify(values) : ""}`;
  const translate = t as unknown as Parameters<typeof roleTypeLabel>[1];

  it("names the type in the client's words", () => {
    expect(roleTypeLabel(role({ kind: "head_office" }), translate)).toBe("roles.kind.headOffice");
    expect(roleTypeLabel(role({ kind: "project" }), translate)).toBe("roles.kind.project");
    expect(roleTypeLabel(role({ kind: "phone" }), translate)).toBe("roles.kind.phone");
    expect(roleTypeLabel(role({ kind: "plain" }), translate)).toBeNull();
  });

  it("counts a builder role's 总部权限, not its stored ticks", () => {
    expect(rolePermissionSummary(role({ kind: "project", hq_permission_count: 2, permissions: ["a", "b", "c"] }), translate)).toBe(
      'roles.hqCount{"count":2}',
    );
    expect(rolePermissionSummary(role({ kind: "head_office", is_system: true }), translate)).toBe("roles.allPermissions");
    expect(rolePermissionSummary(role({ kind: "plain", hq_permission_count: null, permissions: ["a"] }), translate)).toBe(
      'roles.permissionCount{"count":1}',
    );
  });
});
