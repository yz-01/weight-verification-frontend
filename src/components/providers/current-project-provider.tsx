"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/components/providers/auth-provider";
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
  /** "" (or "all") chooses 「全部项目」. */
  setProjectId: (projectId: string) => void;
}

/** What a change of project takes out of the address (see `setProjectId`). */
const PROJECT_BOUND_PARAMS = [
  "project",
  "page",
  "category",
  "subcategory",
  "uncategorised",
  "phase",
  "responsible_person",
];

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
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
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
  const projectId = resolveCurrentProject({ projects: list, choices: [choice] });

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

  const setProjectId = useCallback(
    (next: string) => {
      const value = next && next !== ALL_PROJECTS_CHOICE ? next : ALL_PROJECTS_CHOICE;
      setChoice(value);
      if (userId) setCurrentProjectChoice(userId, value);
      // The address's project would otherwise outvote the choice just made
      // the next time this page is opened from history; page 7 of one
      // project is not a page of the next; and a column or phase belongs to
      // one project, so filtering the next one by it shows nothing.
      if (PROJECT_BOUND_PARAMS.some((key) => searchParams.has(key))) {
        const params = new URLSearchParams(searchParams.toString());
        for (const key of PROJECT_BOUND_PARAMS) params.delete(key);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
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
