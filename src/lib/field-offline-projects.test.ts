/**
 * 2026-11-14: a field phone with no network still knows its projects.
 *
 * The phone opened offline as the account it last saw (H12) but asked the
 * server for that account's projects and got no answer: 「你的项目读取失败」
 * in red at the top, and a worker on two projects could not choose one - so
 * nothing could be recorded for later, although the line above said it could.
 * The list is now kept on the phone with the account and used when there is
 * no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, type Paginated } from "@/interfaces/api";
import type { CurrentUser } from "@/interfaces/auth";
import type { Project } from "@/interfaces/contractor";

const getProjects = vi.hoisted(() => vi.fn());
vi.mock("@/services/contractor.service", () => ({ getProjects }));

const { forgetFieldUser, lastFieldProjects, rememberFieldProjects, rememberFieldUser, lastFieldUser } =
  await import("@/lib/field-offline-user");
const { loadProjectOptions, PROJECT_OPTIONS_KEY } = await import("@/lib/project-options");

const page = (...names: string[]): Paginated<Project> => ({
  count: names.length,
  page: 1,
  page_size: 100,
  total_pages: 1,
  results: names.map((name, index) => ({ id: `p-${index + 1}`, code: `PRJ-000${index + 1}`, name }) as unknown as Project),
});
const WORKER = { id: "u-phone", is_field_staff: true };
const OFFICE = { id: "u-office", is_field_staff: false };
const noNetwork = () => new ApiError("Failed to fetch", 0);

describe("the field phone's project list without a network", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    getProjects.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is the one request every form and the header share", () => {
    expect(PROJECT_OPTIONS_KEY).toEqual(["projects", "options"]);
  });

  it("keeps what the server last answered, and uses it when there is no answer at all", async () => {
    getProjects.mockResolvedValueOnce(page("OIL & GAS", "PUTRA_MAS"));
    await expect(loadProjectOptions(WORKER)).resolves.toMatchObject({ count: 2 });
    expect(getProjects).toHaveBeenCalledWith({ page_size: 100, sort_by: "name" });

    getProjects.mockRejectedValueOnce(noNetwork());
    const offline = await loadProjectOptions(WORKER);
    expect(offline.results.map((project) => project.name)).toEqual(["OIL & GAS", "PUTRA_MAS"]);
  });

  it("is replaced by the next answer from the server", async () => {
    getProjects.mockResolvedValueOnce(page("OIL & GAS", "PUTRA_MAS"));
    await loadProjectOptions(WORKER);
    // Taken off one project while the phone was away.
    getProjects.mockResolvedValueOnce(page("OIL & GAS"));
    await loadProjectOptions(WORKER);
    getProjects.mockRejectedValueOnce(noNetwork());
    expect((await loadProjectOptions(WORKER)).results.map((project) => project.name)).toEqual(["OIL & GAS"]);
  });

  it("still fails when the phone has never read its projects", async () => {
    getProjects.mockRejectedValueOnce(noNetwork());
    await expect(loadProjectOptions(WORKER)).rejects.toMatchObject({ status: 0 });
  });

  it("does not hide a refusal behind the kept list", async () => {
    getProjects.mockResolvedValueOnce(page("OIL & GAS"));
    await loadProjectOptions(WORKER);
    for (const status of [401, 403, 500]) {
      getProjects.mockRejectedValueOnce(new ApiError("refused", status));
      await expect(loadProjectOptions(WORKER), String(status)).rejects.toMatchObject({ status });
    }
  });

  it("never offers the last person's projects to another account on the same phone", async () => {
    getProjects.mockResolvedValueOnce(page("OIL & GAS"));
    await loadProjectOptions(WORKER);
    expect(lastFieldProjects("u-someone-else")).toBeNull();
    getProjects.mockRejectedValueOnce(noNetwork());
    await expect(loadProjectOptions({ id: "u-someone-else", is_field_staff: true })).rejects.toMatchObject({ status: 0 });
  });

  it("is forgotten with the account - signed out or refused", () => {
    rememberFieldUser({ id: "u-phone", is_field_staff: true } as unknown as CurrentUser);
    rememberFieldProjects("u-phone", page("OIL & GAS"));
    expect(lastFieldProjects("u-phone")?.results).toHaveLength(1);
    forgetFieldUser();
    expect(lastFieldUser()).toBeNull();
    expect(lastFieldProjects("u-phone")).toBeNull();
  });

  it("is the phone's only: the office neither keeps nor falls back", async () => {
    getProjects.mockResolvedValueOnce(page("OIL & GAS"));
    await loadProjectOptions(OFFICE);
    expect(lastFieldProjects("u-office")).toBeNull();
    getProjects.mockRejectedValueOnce(noNetwork());
    await expect(loadProjectOptions(OFFICE)).rejects.toMatchObject({ status: 0 });
    getProjects.mockRejectedValueOnce(noNetwork());
    await expect(loadProjectOptions(null)).rejects.toMatchObject({ status: 0 });
  });

  it("reads nothing from a damaged store", () => {
    window.localStorage.setItem("mse.field.last-projects", "{not json");
    expect(lastFieldProjects("u-phone")).toBeNull();
    window.localStorage.setItem("mse.field.last-projects", JSON.stringify({ userId: "u-phone", projects: {} }));
    expect(lastFieldProjects("u-phone")).toBeNull();
  });
});
