/**
 * JB202 - Lucas 11-16, on the consultant list where 「已批准，需完成整改」 was cut
 * at the panel's edge: 「还有这个顾问这里的字被裁掉了，修复一下然后检查一下有没有
 * 类似的问题也修复一下」. The sweep of every menu page (desktop 1440 and phone 390,
 * Chinese and English) found the top bar and the menu cutting words:
 *
 * - phone: the project box showed no name, the search button lost its right
 *   edge, and in English the page name ran under the buttons;
 * - desktop English: the page name and the search hint ended in 「…」, the
 *   project box lost the last character of 「PRJ-0001 - 示范商业大厦一期」, the
 *   menu entry 「Hazard rectification / EHS」 ended in 「…」.
 *
 * The runner has no DOM, so these read the classes that decide whether words
 * can be cut: the bar grows a row instead of squeezing, buttons keep their
 * size, names wrap instead of ending in 「…」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CurrentProjectState } from "@/components/providers/current-project-provider";
import type { Project } from "@/interfaces/contractor";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true, refresh: async () => {}, isLoading: false }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { CurrentProjectValueProvider } = await import("@/components/providers/current-project-provider");
const { CurrentProjectPicker } = await import("@/components/layout/current-project-picker");

const read = (file: string) => readFileSync(path.join(process.cwd(), "src/components/layout", file), "utf8");

/** Every `className="…"` in a piece of source, as class lists. */
function classLists(source: string): string[][] {
  return [...source.matchAll(/className="([^"]+)"/g)].map((match) => match[1].split(/\s+/));
}

function project(id: string, code: string, name: string): Project {
  return { id, code, name, status: "ACTIVE", created_at: "2026-10-01T00:00:00Z" } as Project;
}

const LONG = project("p-1", "PRJ-0001", "示范商业大厦一期");
const OTHER = project("p-2", "PRJ-0002", "示范住宅二期");

function picker(projects: Project[]): string {
  const state: CurrentProjectState = {
    active: true,
    projectId: projects[0].id,
    projects,
    canChooseAll: projects.length > 1,
    loading: false,
    setProjectId: () => {},
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <CurrentProjectValueProvider value={state}>
        <CurrentProjectPicker />
      </CurrentProjectValueProvider>
    </NextIntlClientProvider>,
  );
}

describe("the top bar grows a row instead of squeezing (JB202)", () => {
  const toolbar = read("dashboard-toolbar.tsx");
  const header = toolbar.match(/<header className="([^"]+)"/)![1].split(" ");

  it("wraps, with no fixed height", () => {
    expect(header).toEqual(expect.arrayContaining(["flex", "flex-wrap", "min-h-14"]));
    expect(header).not.toContain("h-14");
  });

  it("lets the buttons join the bar's own rows on a phone and wrap as one group from sm up", () => {
    expect(toolbar).toContain(
      'className="contents sm:ml-auto sm:flex sm:max-w-full sm:flex-wrap sm:items-center sm:justify-end sm:gap-2"',
    );
    // the old group took what was left and squeezed its buttons into it
    expect(toolbar).not.toContain("ml-auto flex min-w-0 flex-1 items-center justify-end");
  });

  it("wraps the page name instead of ending it in 「…」", () => {
    const title = toolbar.slice(toolbar.indexOf("function PageTitle"));
    expect(title).not.toMatch(/\btruncate\b/);
    expect(title.match(/break-words/g)).toHaveLength(3);
    expect(title).toContain('"flex min-w-0 flex-1 items-center gap-2 text-sm leading-snug sm:flex-initial sm:text-base"');
  });

  it("gives the consultant's project box the room for the whole name, a row of its own on a phone", () => {
    const select = toolbar.slice(toolbar.indexOf("<select"), toolbar.indexOf("</select>"));
    const classes = classLists(select)[0];
    expect(classes).toEqual(expect.arrayContaining(["order-last", "basis-full", "max-w-full", "sm:order-none", "sm:basis-auto"]));
    expect(classes).not.toContain("max-w-56");
  });

  it("keeps the page switcher and the search button their own size", () => {
    const switcher = classLists(read("page-switcher.tsx")).find((list) => list.includes("h-10"))!;
    expect(switcher).toEqual(expect.arrayContaining(["shrink-0", "max-w-full"]));
    expect(switcher).not.toContain("shrink");
    expect(switcher).not.toContain("max-w-56");
    const search = classLists(read("global-module-search.tsx")).find((list) => list.includes("h-10"))!;
    expect(search).toEqual(expect.arrayContaining(["shrink-0", "sm:min-w-56", "lg:min-w-72"]));
    expect(search).not.toContain("shrink");
    expect(search).not.toContain("lg:w-72");
  });
});

describe("the top bar's 「当前项目」 shows the whole name (JB202)", () => {
  it("several projects: the select is as wide as the name, on a row of its own on a phone", () => {
    const html = picker([LONG, OTHER]);
    expect(html).toMatch(/<label class="order-last flex min-w-0 max-w-full basis-full items-center gap-1\.5 sm:order-none sm:basis-auto"/);
    expect(html).toMatch(/<select[^>]*class="h-9 min-w-0 max-w-full flex-1 rounded-md border bg-background px-2 text-sm sm:flex-initial"/);
    expect(html).not.toMatch(/max-w-36|max-w-56/);
    expect(html).toContain("PRJ-0001 - 示范商业大厦一期");
  });

  it("one project: the name wraps rather than ending in 「…」", () => {
    const html = picker([LONG]);
    expect(html).not.toContain("truncate");
    expect(html).toContain('<span class="min-w-0 break-words">PRJ-0001<!-- --> - <!-- -->示范商业大厦一期</span>');
    expect(html).toMatch(/data-current-project=""[^>]*class="order-last flex min-h-9 min-w-0 max-w-full basis-full/);
  });
});

describe("the menu's entries take a second line instead of 「…」 (JB202)", () => {
  const sidebar = read("app-sidebar.tsx");

  it("lets the row grow", () => {
    expect(sidebar).toContain(
      '"h-auto min-h-10 rounded-lg px-2 py-1.5 pointer-coarse:h-auto pointer-coarse:min-h-11 data-[active=true]:bg-sidebar-accent',
    );
  });

  it("wraps the entry's name, beating the menu button's own truncate", () => {
    expect(sidebar).toContain('<span className="min-w-0 break-words leading-snug whitespace-normal!">{label}</span>');
  });
});
