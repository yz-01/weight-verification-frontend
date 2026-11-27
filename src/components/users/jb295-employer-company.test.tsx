/**
 * JB295 (Lucas 11-27 final 「客户的意思是app账号的人员也做，因为是自动打卡所以会
 * 自动计算」): 编辑用户 gets 「所属公司」 - a company from the list or a typed
 * name; empty = 本公司. It is sent as `employer_company_key`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/users",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/dialog-navigation", async (original) => ({
  ...(await original<typeof import("@/components/shared/dialog-navigation")>()),
  useFinishForm: () => vi.fn(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({ user: { id: "boss", company: "c1", portal: "MSE_TRACE" }, can: () => true }),
}));

const { EmployerCompanyField, employerDraftOf, employerKeyOf } = await import(
  "@/components/users/employer-company-field"
);
const { CreateUser } = await import("@/components/users/create-user");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["users", "employer-options", ""], [
    { value: "s-hh", label: "HH machinery sb", kind: "SUPPLIER" },
    { value: "note:abc", label: "abc", kind: "TYPED" },
  ]);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("编辑用户 · 所属公司", () => {
  it("reads and writes the key: empty = 本公司, a listed company, or a typed name", () => {
    expect(employerDraftOf("", "本公司")).toEqual({ supplier: "", supplierName: "", note: "" });
    expect(employerDraftOf("s-hh", "HH machinery sb")).toEqual({ supplier: "s-hh", supplierName: "HH machinery sb", note: "" });
    expect(employerDraftOf("note:Ah Seng Construction", "Ah Seng Construction").note).toBe("Ah Seng Construction");
    expect(employerKeyOf({ supplier: "", supplierName: "", note: "" })).toBe("");
    expect(employerKeyOf({ supplier: "", supplierName: "", note: "  Ah Seng  " })).toBe("note:Ah Seng");
    expect(employerKeyOf({ supplier: "s-hh", supplierName: "HH", note: "left over" })).toBe("s-hh");
  });

  it("shows the label, 「不填 = 本公司」 and the typed box while no company is chosen", () => {
    const out = text(
      render(<EmployerCompanyField draft={{ supplier: "", supplierName: "", note: "" }} onChange={() => undefined} />),
    );
    expect(out).toContain(zh.jb295.employer.label);
    expect(out).toContain("不填 = 本公司");
    expect(out).toContain(zh.jb295.employer.self);
    expect(out).toContain(zh.jb295.employer.noteLabel);
    const chosen = text(
      render(
        <EmployerCompanyField draft={{ supplier: "s-hh", supplierName: "HH machinery sb", note: "" }} onChange={() => undefined} />,
      ),
    );
    expect(chosen).toContain("HH machinery sb");
    expect(chosen).not.toContain(zh.jb295.employer.noteLabel);
  });

  it("is on 编辑用户 (not on 新增), and the saved user's company opens in it", () => {
    const user = {
      id: "u-ong",
      email: "ong@site.test",
      full_name: "ong",
      phone: "",
      role: null,
      language: "zh",
      timezone: "Asia/Kuala_Lumpur",
      company: "c1",
      employer_company_key: "s-hh",
      employer_company_name: "HH machinery sb",
    };
    const edit = text(render(<CreateUser user={user as never} />));
    expect(edit).toContain(zh.jb295.employer.label);
    expect(edit).toContain("HH machinery sb");
    const create = text(render(<CreateUser />));
    expect(create).not.toContain(zh.jb295.employer.hint);
    const source = readFileSync(path.join(process.cwd(), "src/components/users/create-user.tsx"), "utf8");
    expect(source).toContain("employer_company_key: employerKeyOf(employer)");
  });
});
