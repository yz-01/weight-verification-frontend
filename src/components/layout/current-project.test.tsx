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
const {
  addressAfterProjectChoice,
  addressWithoutProjectVote,
  fetchAllProjects,
} = await import("@/components/providers/current-project-provider");
const { sharingHandOver } = await import("@/components/site-operations/field-staff-gps");
const { SupplierReturnsDialog } = await import("@/components/suppliers/supplier-return-badge");
const { ProjectNotificationDialog } = await import("@/components/notifications/notifications");
const { newApprovalProject } = await import("@/components/document-workflow/approvals");
const { IncidentThreadList } = await import("@/components/incident-reporting/incident-thread-list");
const { CreateDispatch } = await import("@/components/dispatches/create-dispatch");
const { MaterialReport } = await import("@/components/reports/material-report");

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
  {
    state,
    projects,
    seed = [],
  }: {
    state?: CurrentProjectState;
    projects?: Project[];
    /** Query answers already in the cache, as [key, data]. */
    seed?: [readonly unknown[], unknown][];
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (projects) client.setQueryData(["projects", "options"], page(projects));
  for (const [key, data] of seed) client.setQueryData(key, data);
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

/*
 * The B13 audit's findings (FABLE_AUDIT_B13, 2026-10-08) and Lucas's Q33:
 * 1. 「全部项目」 for anyone with more than one project (as built);
 * 2. a supplier's 「有退场资料」 and its list cover every project the reader
 *    sees, not the top bar's;
 * 3. opening another project's record (a notice, an alert, a link) moves the
 *    top bar to that project, then opens the record.
 */
describe("a link to one record of another project (Q33.3)", () => {
  const SOUTH_TASK = {
    id: "t-south",
    project: SOUTH.id,
    project_name: SOUTH.name,
    title: "Photograph the south hoarding",
    task_type: "PHOTO",
    instructions: "",
    work_location: "",
    submission_category: "",
    assigned_to: "u-field",
    assigned_to_name: "Ali",
    created_by_name: "Lim",
    category: null,
    category_name: null,
    priority: "NORMAL",
    due_at: null,
    status: "SUBMITTED",
    evidence_required: 1,
    photos: [],
    references: [],
    photo_count: 0,
    origin: "SITE",
    result_note: "",
    created_by: OFFICE.id,
  };

  it("a field task opens by its id although the top bar is on another project (audit #1)", () => {
    nav.pathname = "/field-tasks";
    nav.search = `task=${SOUTH_TASK.id}`;
    const { html } = render(<FieldTasksWorkspace />, {
      state: topBar(NORTH.id),
      seed: [
        [["field-tasks", NORTH.id, undefined, null], page([])],
        [["field-tasks", "detail", SOUTH_TASK.id], SOUTH_TASK],
      ],
    });
    expect(html).toContain(SOUTH_TASK.title);
    expect(html).not.toContain(messages.contractorOps.tasks.focusedMissing);
  });

  it("a project the reader cannot see keeps the choice they made (audit #4)", () => {
    const stored = new Map([[`mse_current_project.${OFFICE.id}`, NORTH.id]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
        removeItem: (key: string) => void stored.delete(key),
      },
    });
    try {
      nav.search = "project=p-hidden";
      function Shown() {
        return <output>{`[${useCurrentProject().projectId}]`}</output>;
      }
      const { html } = render(<Shown />, { projects: [NORTH, SOUTH] });
      expect(html).toContain(`[${NORTH.id}]`);
      expect(stored.get(`mse_current_project.${OFFICE.id}`)).toBe(NORTH.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the address does not vote twice (audit #3)", () => {
  it("a link's project leaves the address once the top bar has taken it", () => {
    expect(addressWithoutProjectVote("/receipts", `project=${SOUTH.id}&category=c-1`)).toBe(
      "/receipts?category=c-1",
    );
    expect(addressWithoutProjectVote("/claims", "project=all")).toBe("/claims");
    expect(addressWithoutProjectVote("/claims", "status=OPEN")).toBeNull();
  });

  it("an address that forwards keeps its project for the page it forwards to", () => {
    expect(addressWithoutProjectVote("/dashboard", `project=${SOUTH.id}`)).toBeNull();
    expect(addressWithoutProjectVote("/site-disposals", `project=${SOUTH.id}&record=r`)).toBeNull();
    expect(addressWithoutProjectVote("/photo-approvals", `project=${SOUTH.id}`)).toBeNull();
  });

  it("choosing in the top bar takes the head-office card's project out too", () => {
    expect(
      addressAfterProjectChoice("/dashboard", `work=approvals&work_project=${SOUTH.id}`),
    ).toBe("/dashboard?work=approvals");
  });
});

describe("an open record follows the project (audit #8)", () => {
  it("choosing another project closes a record opened by link", () => {
    for (const key of [
      "record",
      "movement",
      "machine",
      "outgoing",
      "approval",
      "task",
      "incident",
      "gate_incident",
      "pass",
      "thread",
      "dispatch",
    ]) {
      expect(addressAfterProjectChoice("/site-equipment", `direction=ENTRY&${key}=r-1`)).toBe(
        "/site-equipment?direction=ENTRY",
      );
    }
    expect(addressAfterProjectChoice("/site-equipment", "direction=ENTRY")).toBeNull();
  });
});

describe("office location sharing follows the top bar (audit #5)", () => {
  it("stops on the project it was sharing to and starts on the new one", () => {
    expect(sharingHandOver(NORTH.id, SOUTH.id)).toEqual({ stop: NORTH.id, start: true });
  });
  it("on 全部项目 stops and does not start", () => {
    expect(sharingHandOver(NORTH.id, "")).toEqual({ stop: NORTH.id, start: false });
  });
  it("does nothing while not sharing or when the project is the same", () => {
    expect(sharingHandOver(null, SOUTH.id)).toBeNull();
    expect(sharingHandOver(NORTH.id, NORTH.id)).toBeNull();
  });
});

describe("a supplier's returns cover every project (Q33.2, audit #9)", () => {
  it("the list opens on every project although the top bar is on one", () => {
    const { keys } = render(
      <SupplierReturnsDialog
        supplier={{ id: "s-1", name: "Acme", completed_return_count: 3 }}
        onClose={() => {}}
      />,
      { state: topBar(NORTH.id) },
    );
    const [key] = keysOf(keys, "suppliers", "returns", "s-1");
    expect(key?.[3]).toMatchObject({ project: "" });
  });
});

describe("create forms start on the top bar's project (audit #7)", () => {
  it("a project notice is addressed to the top bar's project", () => {
    const { keys } = render(<ProjectNotificationDialog onClose={() => {}} onSent={() => {}} />, {
      state: topBar(NORTH.id),
      seed: [[["projects", "notification-compose"], page([NORTH, SOUTH])]],
    });
    expect(keysOf(keys, "project-assignments")).toEqual([
      ["project-assignments", NORTH.id, "notification-compose"],
    ]);
  });

  it("a new document approval is on the top bar's project, company-wide on 全部项目", () => {
    expect(newApprovalProject(null, NORTH.id)).toBe(NORTH.id);
    expect(newApprovalProject(null, "")).toBe("none");
    expect(newApprovalProject({ project: SOUTH.id }, NORTH.id)).toBe(SOUTH.id);
    expect(newApprovalProject({ project: null }, NORTH.id)).toBe("none");
  });
});

describe("no empty filter strip beside the top bar (audit #10)", () => {
  it("the incident list draws no bar when its only filter is the top bar's", () => {
    nav.pathname = "/incident-reports";
    const { html } = render(<IncidentThreadList />, { state: topBar(NORTH.id) });
    expect(html).not.toContain("border-y bg-card/50 py-3");
  });

  it("the material report keeps no empty column where the project box was", () => {
    nav.pathname = "/reports/material";
    const { html } = render(<MaterialReport mode="quantity" />, { state: topBar(NORTH.id) });
    expect(html).not.toContain("minmax(220px,1fr)_210px_180px_180px_auto");
  });

  it("the dispatch form names the project the way every other form does", () => {
    nav.pathname = "/dispatches/create";
    const { html } = render(<CreateDispatch />, { state: topBar(NORTH.id) });
    expect(html).toContain("N1 - North Tower");
    expect(html).not.toContain("N1 — North Tower");
  });
});

describe("more than 100 projects (audit #11)", () => {
  it("the top bar reads every page of projects", async () => {
    const all = Array.from({ length: 230 }, (_, index) =>
      project(`p-${index}`, `P${index}`, `Site ${index}`),
    );
    const asked: number[] = [];
    const result = await fetchAllProjects(async (pageNo) => {
      asked.push(pageNo);
      const results = all.slice((pageNo - 1) * 100, pageNo * 100);
      return { count: all.length, page: pageNo, page_size: 100, total_pages: 3, results };
    });
    expect(asked).toEqual([1, 2, 3]);
    expect(result.results).toHaveLength(230);
    expect(result.count).toBe(230);
  });
});
