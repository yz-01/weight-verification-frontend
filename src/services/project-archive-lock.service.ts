/**
 * 「归档后锁定记录」 for each of a contractor's projects, set by MSE on the
 * company page (JB214-3d, Lucas 11-16 Q1 = A 「按项目锁」).
 */
import { api } from "@/services/api-client";

export interface ProjectArchiveLockRow {
  id: string;
  code: string;
  name: string;
  status: string;
  lock_after_archive: boolean;
}

export function getCompanyProjectArchiveLocks(company: string): Promise<ProjectArchiveLockRow[]> {
  return api.get<ProjectArchiveLockRow[]>("/api/project-archive-locks/get_company_projects/", { company });
}

export function setProjectArchiveLock(project: string, lockAfterArchive: boolean): Promise<ProjectArchiveLockRow> {
  return api.post<ProjectArchiveLockRow>(`/api/project-archive-locks/${project}/set_archive_lock/`, {
    lock_after_archive: lockAfterArchive,
  });
}
