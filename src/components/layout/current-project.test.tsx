/**
 * 顶栏「当前项目」 (2026-10 B13, X14, Q7).
 *
 * The client, 2-4/10: 「Multi Engine 又要选一次项目。他要的是选一次项目，整个系统
 * 都用这个项目」. Asserted on the pages themselves, rendered to static markup
 * (the runner has no DOM):
 *
 * - with one project chosen in the top bar a page draws no project box of its
 *   own, and its list asks the server for that project;
 * - a `?project=` in the address (a notification, a head-office card) wins and
 *   moves the top bar to it;
 * - 「全部项目」 is offered only to someone who sees more than one project;
 * - on 全部项目 a page that needs one project asks for it, and a form that
 *   creates a record asks inside the form;
 * - a consultant keeps the page's own choice (their project is the server's).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentProjectState } from "@/components/providers/current-project-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Project } from "@/interfaces/contractor";
import messages from "@/messages/zh.json";

const nav = vi.hoisted(() => ({ search: "", pathname: "/claims" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => nav.pathname,
}));

const OFFICE = {
  id: "u-office",
  full_name: "Lim",
  portal: "MSE_TRACE",
  account_type: "TENANT",
  is_field_staff: false,
  is_platform_staff: false,
  active_project: null,
  consultant_projects: [],
  features: ["schedule"],
  permissions: [],
  company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" },
};
const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: () => true, refresh: async () => {}, isLoading: false }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const {
  CurrentProjectProvider,
  CurrentProjectValueProvider,
  resolveCurrentProject,
  useCurrentProject,
} = await import("@/components/providers/current-project-provider");
const { CurrentProjectPicker } = await import("@/components/layout/current-project-picker");
const { ProjectPicker } = await import("@/components/site-operations/project-picker");
const { MultiEngineWorkspace } = await import("@/components/contractor-ops/multi-engine");
const { ClaimEngineWorkspace } = await import("@/components/contractor-ops/claim-engine");
const { ArchiveQueue } = await import("@/components/contractor-ops/archive-queue");
const { CategoryManagement } = await import("@/components/contractor-ops/category-management");
const { FieldTasksWorkspace } = await import("@/components/contractor-ops/operations-workspaces");
const { Receipts } = await import("@/components/receipts/receipts");
const { Documents } = await import("@/components/document-workflow/documents");
const { EquipmentOperatorHours } = await import("@/components/equipment-hours/equipment-operator-hours");

function project(id: string, code: string, name: string): Project {
  return {
    id,
    code,
    name,
    status: "ACTIVE",
    client_name: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    state: "",
    postcode: "",
    geofence_radius_m: null,
    start_date: null,
    end_date: null,
    site_manager: "",
    created_at: "2026-10-01T00:00:00Z",
  } as Project;
}

const NORTH = project("p-north", "N1", "North Tower");
const SOUTH = project("p-south", "S1", "South Tower");

function topBar(projectId: string, projects: Project[] = [NORTH, SOUTH]): CurrentProjectState {
  return {
    active: true,
    projectId,
    projects,
    canChooseAll: projects.length > 1,
    loading: false,
    setProjectId: () => {},
  };
}

const page = (results: Project[]) => ({
  count: results.length,
  page: 1,
  page_size: 100,
  total_pages: 1,
  results,
});

function render(
  node: React.ReactNode,
  { state, projects }: { state?: CurrentProjectState; projects?: Project[] } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (projects) client.setQueryData(["projects", "options"], page(projects));
  const inner = state ? (
    <CurrentProjectValueProvider value={state}>{node}</CurrentProjectValueProvider>
  ) : (
    <CurrentProjectProvider>{node}</CurrentProjectProvider>
  );
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{inner}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const keys = client.getQueryCache().getAll().map((query) => query.queryKey);
  return { html, keys };
}

/** The query keys that start with `head`. */
function keysOf(keys: readonly (readonly unknown[])[], ...head: unknown[]) {
  return keys.filter((key) => head.every((part, index) => key[index] === part));
}

/** Any project box a page draws: the shared picker marks itself. */
const PAGE_PICKER = "data-project-picker";

beforeEach(() => {
  nav.search = "";
  nav.pathname = "/claims";
  auth.user = OFFICE;
});

describe("one project chosen in the top bar", () => {
  it("Multi Engine has no project box and lists that project's packages", () => {
    const { html, keys } = render(<MultiEngineWorkspace />, { state: topBar(NORTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    expect(html).not.toContain(messages.contractorOps.field.allProjects);
    expect(keysOf(keys, "evidence-packages")).toEqual([["evidence-packages", NORTH.id, "", 1]]);
  });

  it("claims has no project box and lists that project's claims", () => {
    const { html, keys } = render(<ClaimEngineWorkspace />, { state: topBar(SOUTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    expect(keysOf(keys, "claims")[0]?.[1]).toBe(SOUTH.id);
  });

  it("the record centre has no project box and reads that project", () => {
    nav.pathname = "/archive-queue";
    const { html, keys } = render(<ArchiveQueue />, { state: topBar(NORTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    const [key] = keysOf(keys, "archive-queue");
    expect(key).toContain(NORTH.id);
  });

  it("field tasks has no project box and lists that project's tasks", () => {
    nav.pathname = "/field-tasks";
    const { html, keys } = render(<FieldTasksWorkspace />, { state: topBar(NORTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    expect(keysOf(keys, "field-tasks")[0]?.[1]).toBe(NORTH.id);
  });

  it("material in (a URL-held list) sends that project with the list", () => {
    nav.pathname = "/receipts";
    const { html, keys } = render(<Receipts />, { state: topBar(SOUTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    const [key] = keysOf(keys, "receipts");
    expect((key?.[1] as { project?: string }).project).toBe(SOUTH.id);
  });

  it("the document archive has no project select and keeps company-wide files in view", () => {
    nav.pathname = "/documents";
    const { html, keys } = render(<Documents />, { state: topBar(NORTH.id) });
    expect(html).not.toContain(`aria-label="${messages.documents.field.project}"`);
    const [key] = keysOf(keys, "documents").filter((entry) => typeof entry[1] === "object");
    expect(key?.[1]).toMatchObject({ project: NORTH.id, with_company: "1" });
  });

  it("operator hours has no project box and reads that project", () => {
    nav.pathname = "/equipment-operator-hours";
    const { html, keys } = render(<EquipmentOperatorHours />, { state: topBar(NORTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    const [key] = keysOf(keys, "equipment-hours", "days");
    expect((key?.[2] as { project?: string }).project).toBe(NORTH.id);
  });

  it("the category tree has no project box", () => {
    nav.pathname = "/category-management";
    const { html, keys } = render(<CategoryManagement />, { state: topBar(NORTH.id) });
    expect(html).not.toContain(PAGE_PICKER);
    expect(keysOf(keys, "category-management")[0]).toEqual(["category-management", "material", NORTH.id]);
  });

  it("a form that creates a record is on that project, as text", () => {
    const { html } = render(
      <ProjectPicker value="" onValueChange={() => {}} placeholder={messages.contractorOps.field.selectProject} />,
      { state: topBar(NORTH.id) },
    );
    expect(html).not.toContain(PAGE_PICKER);
    expect(html).toContain("data-project-locked");
    expect(html).toContain("N1 - North Tower");
  });
});

describe("全部项目", () => {
  it("lists every project, still without a project box", () => {
    const { html, keys } = render(<MultiEngineWorkspace />, { state: topBar("") });
    expect(html).not.toContain(PAGE_PICKER);
    expect(keysOf(keys, "evidence-packages")).toEqual([["evidence-packages", "", "", 1]]);
  });

  it("a page about one project asks for it once, and says the top bar follows", () => {
    nav.pathname = "/category-management";
    const { html } = render(<CategoryManagement />, { state: topBar("") });
    expect(html).toContain(`${PAGE_PICKER}="page"`);
    expect(html).toContain(messages.currentProject.pageHint);
  });

  it("a form that creates a record asks inside the form", () => {
    const { html } = render(
      <ProjectPicker value="" onValueChange={() => {}} placeholder={messages.contractorOps.field.selectProject} />,
      { state: topBar("") },
    );
    expect(html).toContain(`${PAGE_PICKER}="form"`);
  });
});

describe("the top bar", () => {
  it("offers 全部项目 to someone who sees several projects", () => {
    const { html } = render(<CurrentProjectPicker />, { state: topBar("") });
    expect(html).toContain(`<option value="all" selected="">${messages.currentProject.all}</option>`);
    expect(html).toContain("N1 - North Tower");
    expect(html).toContain("S1 - South Tower");
  });

  it("does not offer 全部项目 to someone with one project, who is simply on it", () => {
    const { html } = render(<CurrentProjectPicker />, { projects: [NORTH] });
    expect(html).not.toContain(messages.currentProject.all);
    expect(html).not.toContain("<select");
    expect(html).toContain("N1 - North Tower");
  });

  it("puts someone with one project on it without asking, and their lists follow", () => {
    const { keys } = render(<MultiEngineWorkspace />, { projects: [NORTH] });
    expect(keysOf(keys, "evidence-packages")).toEqual([["evidence-packages", NORTH.id, "", 1]]);
  });

  it("is not drawn for a consultant, whose page keeps its own choice", () => {
    auth.user = { ...OFFICE, account_type: "CONSULTANT" };
    const { html } = render(
      <>
        <CurrentProjectPicker />
        <MultiEngineWorkspace />
      </>,
      { projects: [NORTH, SOUTH] },
    );
    expect(html).not.toContain("data-current-project");
    expect(html).toContain(PAGE_PICKER);
  });
});

describe("a ?project= in the address", () => {
  function Shown() {
    const current = useCurrentProject();
    return <output>{`[${current.projectId}]`}</output>;
  }

  it("wins: the page opens on it and the top bar moves to it", () => {
    nav.search = `project=${SOUTH.id}&status=OPEN`;
    const { html, keys } = render(
      <>
        <CurrentProjectPicker />
        <Shown />
        <MultiEngineWorkspace />
      </>,
      { projects: [NORTH, SOUTH] },
    );
    expect(html).toContain(`[${SOUTH.id}]`);
    expect(html).toContain(`<option value="${SOUTH.id}" selected="">`);
    expect(keysOf(keys, "evidence-packages")).toEqual([["evidence-packages", SOUTH.id, "", 1]]);
  });

  /** The browser's storage, holding a choice made earlier in the top bar. */
  function withStoredChoice(choice: string, run: () => void) {
    const stored = new Map([[`mse_current_project.${OFFICE.id}`, choice]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
        removeItem: (key: string) => void stored.delete(key),
      },
    });
    try {
      run();
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("absent, the choice made earlier in the top bar stands", () => {
    withStoredChoice(NORTH.id, () => {
      const { html } = render(<Shown />, { projects: [NORTH, SOUTH] });
      expect(html).toContain(`[${NORTH.id}]`);
    });
  });

  it("outvotes the choice made earlier", () => {
    withStoredChoice(NORTH.id, () => {
      nav.search = `project=${SOUTH.id}`;
      const { html } = render(<Shown />, { projects: [NORTH, SOUTH] });
      expect(html).toContain(`[${SOUTH.id}]`);
    });
  });

  it("「all」 from a company-wide card moves the top bar to 全部项目", () => {
    withStoredChoice(NORTH.id, () => {
      nav.search = "project=all";
      const { html } = render(<Shown />, { projects: [NORTH, SOUTH] });
      expect(html).toContain("[]");
    });
  });

  it("naming a project the reader cannot see is ignored", () => {
    expect(
      resolveCurrentProject({ projects: [NORTH, SOUTH], choices: ["p-hidden", NORTH.id] }),
    ).toBe(NORTH.id);
    expect(resolveCurrentProject({ projects: [NORTH], choices: ["all"] })).toBe(NORTH.id);
    expect(resolveCurrentProject({ projects: [NORTH, SOUTH], choices: [null] })).toBe("");
  });
});
