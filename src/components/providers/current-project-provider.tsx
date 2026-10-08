"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type { Paginated } from "@/interfaces/api";
import type { CurrentUser } from "@/interfaces/auth";
import type { Project } from "@/interfaces/contractor";
import {
  ALL_PROJECTS_CHOICE,
  getCurrentProjectChoice,
  setCurrentProjectChoice,
} from "@/lib/project-context";
import { getProjects } from "@/services/contractor.service";

/**
 * 顶栏「当前项目」 (B13, X14, Q7).
 *
 * The client, 2-4/10: 「Multi Engine 又要选一次项目。他要的是选一次项目，整个系统
 * 都用这个项目」. So the office console has one project choice, in the top bar,
 * and every page reads it instead of carrying a project dropdown of its own.
 *
 * - `projectId` is one project's id, or "" for 「全部项目」.
 * - 「全部项目」 is offered only to someone who sees more than one project
 *   (Q7: 总部用户); someone with one project is simply on it.
 * - A `?project=` in the address (a notification, a head-office card, a
 *   pasted link) wins: the page opens on that project and the top bar moves
 *   to it, so the next page is on it too. Choosing in the top bar takes the
 *   parameter out of the address, so it cannot pull the choice back.
 * - Field staff (the phone, bound to `active_project`) and consultants (whose
 *   project the server enforces through `X-MSE-Project`) keep their own
 *   arrangements: for them `active` is false and pages behave as before.
 */
export interface CurrentProjectState {
  /** The top bar's choice is in force on this screen. */
  active: boolean;
  /** One project's id, or "" for 「全部项目」. */
  projectId: string;
  /** The projects this user can see, for the top bar and in-form choices. */
  projects: Project[];
  /** Whether 「全部项目」 is offered (Q7). */
  canChooseAll: boolean;
  loading: boolean;
  /**
   * "" (or "all") chooses 「全部项目」. `keep` names address parameters that
   * stay although they belong to a project - the record a link opened, when
   * it is the record that moves the top bar.
   */
  setProjectId: (projectId: string, options?: { keep?: readonly string[] }) => void;
}

/** What a change of project takes out of the address (see `setProjectId`). */
const PROJECT_BOUND_PARAMS = [
  "project",
  // The head-office 待审批 card's project (`approvalsListHref`): left in the
  // address it pulled the top bar back on every reload (B13 audit #3).
  "work_project",
  "page",
  "category",
  "subcategory",
  "uncategorised",
  "phase",
  "responsible_person",
  // A record a link opened (`useUrlSelection`, a notice's `?record=`): it
  // belongs to the project being left, so it closes rather than staying open
  // over the next project's list (B13 audit #8).
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
];

/** `pathname?search` with `keys` taken out, or null when none was there. */
function addressWithout(pathname: string, search: string, keys: readonly string[]): string | null {
  const params = new URLSearchParams(search);
  if (!keys.some((key) => params.has(key))) return null;
  for (const key of keys) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * The address after choosing another project in the top bar: without what
 * belonged to the project left behind, or null when nothing did.
 */
export function addressAfterProjectChoice(
  pathname: string,
  search: string,
  keep: readonly string[] = [],
): string | null {
  return addressWithout(
    pathname,
    search,
    PROJECT_BOUND_PARAMS.filter((key) => !keep.includes(key)),
  );
}

/**
 * Addresses that forward to another page with every parameter they carry.
 * Their `?project=` stays for the page they forward to, which takes it out;
 * replacing the address here as well would cancel the forward.
 */
const FORWARDING_PATHS = new Set(["/site-disposals", "/dispatches", "/photo-approvals"]);

/**
 * The address once the top bar has taken a link's `?project=`, or null to
 * leave it. Left in, it voted again from history: Back to it, or a reload,
 * pulled the top bar back to that project after the reader had chosen
 * another (B13 audit #3). The rest of the link (`?record=`, `?category=`)
 * stays: it belongs to the project now in the top bar.
 */
export function addressWithoutProjectVote(pathname: string, search: string): string | null {
  if (FORWARDING_PATHS.has(pathname) || pathname.startsWith("/modules/")) return null;
  // `/dashboard?project=` is an old address of the project dashboard.
  if (pathname === "/dashboard") return null;
  return addressWithout(pathname, search, ["project"]);
}

/** At most this many pages of 100 are read for the top bar. */
const MAX_PROJECT_PAGES = 20;

/**
 * Every project the user can see, a page at a time: the list caps a page at
 * 100, and a project beyond the first page was missing from the top bar and
 * treated as one the user cannot see (B13 audit #11).
 */
export async function fetchAllProjects(
  getPage: (page: number) => Promise<Paginated<Project>>,
): Promise<Paginated<Project>> {
  const first = await getPage(1);
  const results = [...first.results];
  const last = Math.min(first.total_pages, MAX_PROJECT_PAGES);
  for (let page = 2; page <= last; page += 1) {
    results.push(...(await getPage(page)).results);
  }
  return { ...first, results };
}

const INACTIVE: CurrentProjectState = {
  active: false,
  projectId: "",
  projects: [],
  canChooseAll: false,
  loading: false,
  setProjectId: () => {},
};

const CurrentProjectContext = createContext<CurrentProjectState>(INACTIVE);

/** The top bar's project; `active` is false outside the office console. */
export function useCurrentProject(): CurrentProjectState {
  return useContext(CurrentProjectContext);
}

/** For tests and stories: a fixed current project. */
export const CurrentProjectValueProvider = CurrentProjectContext.Provider;

/** Whether this signed-in user gets the top bar's project choice. */
export function usesCurrentProject(user: CurrentUser | null): boolean {
  return (
    user !== null &&
    user.portal === "MSE_TRACE" &&
    user.account_type === "TENANT" &&
    !user.is_field_staff &&
    !user.is_platform_staff
  );
}

/**
 * Which project is in force, from the address's `?project=`, the stored
 * choice, and the projects the user can see (undefined while they load).
 * A choice the user can no longer see falls through to the next one; with
 * none left, a single project is chosen for them and several mean 全部项目.
 */
export function resolveCurrentProject({
  projects,
  choices,
}: {
  projects: readonly Pick<Project, "id">[] | undefined;
  choices: readonly (string | null | undefined)[];
}): string {
  for (const choice of choices) {
    if (!choice) continue;
    if (choice === ALL_PROJECTS_CHOICE) {
      if (projects === undefined || projects.length > 1) return "";
      continue;
    }
    if (projects === undefined || projects.some((project) => project.id === choice)) {
      return choice;
    }
  }
  return projects?.length === 1 ? projects[0].id : "";
}

export function CurrentProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enabled = usesCurrentProject(user);
  const userId = user?.id ?? "";
  const requested = enabled ? searchParams.get("project") : null;

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () =>
      fetchAllProjects((page) => getProjects({ page, page_size: 100, sort_by: "name" })),
    enabled,
    staleTime: 60_000,
  });

  const [choice, setChoice] = useState<string | null>(() =>
    userId ? requested || getCurrentProjectChoice(userId) : null,
  );
  const [owner, setOwner] = useState(userId);
  const [seenRequest, setSeenRequest] = useState(requested);
  // Adjusted while rendering, not in an effect, so the page that arrives
  // with `?project=` already renders - and fetches - on that project.
  if (owner !== userId) {
    setOwner(userId);
    setChoice(userId ? requested || getCurrentProjectChoice(userId) : null);
    setSeenRequest(requested);
  } else if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setChoice(requested);
  }

  const list = projects.data?.results;
  // A link to a project this user cannot see is ignored, and the choice they
  // made earlier stands (B13 audit #4).
  const stored = userId ? getCurrentProjectChoice(userId) : null;
  const projectId = resolveCurrentProject({ projects: list, choices: [choice, stored] });

  // A link's project becomes the stored choice once it is known to be one
  // this user can see, so the next page opens on it as well.
  useEffect(() => {
    if (!enabled || !userId || !choice || list === undefined) return;
    const accepted =
      choice === ALL_PROJECTS_CHOICE
        ? list.length > 1
        : list.some((project) => project.id === choice);
    if (accepted && getCurrentProjectChoice(userId) !== choice) {
      setCurrentProjectChoice(userId, choice);
    }
  }, [choice, enabled, list, userId]);

  // Once the list has answered a link's project (taken, or refused), the
  // address lets go of it, so history does not carry the vote (audit #3).
  useEffect(() => {
    if (!enabled || !requested || list === undefined) return;
    const next = addressWithoutProjectVote(pathname, searchParams.toString());
    if (next) router.replace(`${next}${window.location.hash}`, { scroll: false });
  }, [enabled, list, pathname, requested, router, searchParams]);

  const setProjectId = useCallback(
    (next: string, { keep = [] }: { keep?: readonly string[] } = {}) => {
      const value = next && next !== ALL_PROJECTS_CHOICE ? next : ALL_PROJECTS_CHOICE;
      setChoice(value);
      if (userId) setCurrentProjectChoice(userId, value);
      // The address's project would otherwise outvote the choice just made
      // the next time this page is opened from history; page 7 of one
      // project is not a page of the next; a column or phase belongs to
      // one project, so filtering the next one by it shows nothing; and a
      // record a link opened is the old project's.
      const address = addressAfterProjectChoice(pathname, searchParams.toString(), keep);
      if (address) router.replace(`${address}${window.location.hash}`, { scroll: false });
    },
    [pathname, router, searchParams, userId],
  );

  // Without the list (a failed request) the top bar stays away and every page
  // keeps its own project choice, which reports the failure itself.
  const value = useMemo<CurrentProjectState>(
    () =>
      enabled && !projects.isError
        ? {
            active: true,
            projectId,
            projects: list ?? [],
            canChooseAll: (list?.length ?? 0) > 1,
            loading: projects.isLoading,
            setProjectId,
          }
        : INACTIVE,
    [enabled, list, projectId, projects.isError, projects.isLoading, setProjectId],
  );

  return (
    <CurrentProjectContext.Provider value={value}>{children}</CurrentProjectContext.Provider>
  );
}

/**
 * A page's project, read from the top bar when it is in force and held by the
 * page itself otherwise (consultants, the phone). `all` is the value the page
 * uses for "every project" ("" or "all"); setting it chooses 全部项目.
 *
 * With the top bar in force, setting the project moves the top bar: a page
 * that needs one project and was opened on 全部项目 asks once, and from then
 * on the whole console is on that project.
 */
export function usePageProject(
  initial = "",
  { all = "" }: { all?: string } = {},
): [string, (next: string) => void] {
  const current = useCurrentProject();
  const [local, setLocal] = useState(initial || all);
  if (current.active) {
    return [current.projectId || all, current.setProjectId];
  }
  return [local, setLocal];
}

/**
 * Runs `reset` (back to page 1, close an open row) the render the project
 * changes - also when it was the top bar that changed it, which the page's
 * own handlers never see.
 */
export function useOnProjectChange(project: string, reset: () => void): void {
  const [seen, setSeen] = useState(project);
  if (seen !== project) {
    setSeen(project);
    reset();
  }
}

/**
 * Whether a page still draws its own project box (and the label around it):
 * not while the top bar's project covers it. A `filter` never shows beside the
 * top bar; a `page` choice shows only on 全部项目, to ask for one project.
 */
export function useProjectBoxShown(scope: "filter" | "page"): boolean {
  const current = useCurrentProject();
  if (!current.active) return true;
  return scope === "page" && !current.projectId;
}

/**
 * Q33.3: 「点开别的项目的记录（通知、提醒、链接），顶栏自动换到那个项目，再打开那一笔」.
 * A record a link opened (`param` in the address) that belongs to another
 * project than the top bar's moves the top bar to it, and stays open. Once
 * per record: choosing another project afterwards is the reader's own choice,
 * and closes it as any choice does. On 全部项目 every record is in view, so
 * the top bar stays.
 */
export function useFollowRecordProject(
  param: string,
  record: { id: string; project: string } | null | undefined,
): void {
  const { active, projectId, setProjectId } = useCurrentProject();
  const followed = useRef<string | null>(null);
  const id = record?.id ?? null;
  const project = record?.project ?? "";
  useEffect(() => {
    if (!id || followed.current === id) return;
    followed.current = id;
    if (active && projectId && project && project !== projectId) {
      setProjectId(project, { keep: [param] });
    }
  }, [active, id, param, project, projectId, setProjectId]);
}
