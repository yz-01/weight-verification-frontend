/**
 * The project list a form or the phone's header chooses from - one request,
 * shared under one key (`["projects", "options"]`).
 *
 * On the field phone the answer is also kept on the phone, and used when the
 * network is down (2026-11-14, `lib/field-offline-user`): the screen then
 * shows the worker's projects as it last knew them instead of 「你的项目读取
 * 失败」, and a worker on several projects can still choose one for a record
 * that will upload later. The next answer from the server replaces it.
 *
 * Only a failure with no answer at all (`ApiError.isNetwork`) falls back. A
 * refusal - the account removed from its project, the session ended - is the
 * server speaking and is shown as it always was.
 */
import { ApiError, type Paginated } from "@/interfaces/api";
import type { CurrentUser } from "@/interfaces/auth";
import type { Project } from "@/interfaces/contractor";
import { lastFieldProjects, rememberFieldProjects } from "@/lib/field-offline-user";
import { getProjects } from "@/services/contractor.service";

export const PROJECT_OPTIONS_KEY = ["projects", "options"] as const;

type Reader = Pick<CurrentUser, "id" | "is_field_staff"> | null | undefined;

export async function loadProjectOptions(user: Reader): Promise<Paginated<Project>> {
  const ask = () => getProjects({ page_size: 100, sort_by: "name" });
  if (!user?.is_field_staff) return ask();
  try {
    const projects = await ask();
    rememberFieldProjects(user.id, projects);
    return projects;
  } catch (error) {
    if (error instanceof ApiError && error.isNetwork) {
      const last = lastFieldProjects(user.id);
      if (last) return last;
    }
    throw error;
  }
}
